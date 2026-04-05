/**
 * ╔══════════════════════════════════════════════════════╗
 * ║   ⚡ ScrapEx — Professional Web Scraping Library     ║
 * ║   Fast • Smart • Lightweight • Zero dependencies     ║
 * ╚══════════════════════════════════════════════════════╝
 *
 *  Architecture:
 *  ┌─────────────────────────────────────────────────────┐
 *  │  ScrapEx (Fluent API)                               │
 *  │    ├── HttpEngine (fetch + cache + limiter + retry) │
 *  │    ├── FastTokenizer (custom state-machine parser)  │
 *  │    ├── QueryEngine  (CSS selector engine)           │
 *  │    ├── SmartExtractors (tables/links/schema/media)  │
 *  │    └── Pipeline (chainable transforms)              │
 *  └─────────────────────────────────────────────────────┘
 */

import { HttpEngine }                                   from './core/engine.js';
import { buildTree, FastTokenizer, QueryEngine }         from './core/parser.js';
import {
  extractLinks, extractTables, extractMedia,
  extractSchema, extractMainContent,
  extractContacts, detectPagination, clean,
}                                                        from './extractors/index.js';
import { Pipeline, pipeline }                            from './pipeline/index.js';

// ── ScrapEx Result ──────────────────────────────────────────
class ScrapExResult {
  constructor(response, tree, url) {
    this._res  = response;
    this._tree = tree;
    this._url  = url;
    this._cache = {};
  }

  get url()         { return this._res.url || this._url; }
  get status()      { return this._res.status; }
  get html()        { return this._res.body; }
  get headers()     { return this._res.headers; }
  get fromCache()   { return this._res.fromCache || false; }
  get ms()          { return this._res.ms || 0; }

  // ── Direct Query ─────────────────────────────────────────
  $(sel)            { return this._tree.$(sel); }
  $$(sel)           { return this._tree.$$(sel); }

  text(sel)  { const n = this.$(sel); return n ? clean.text(n.text) : null; }
  texts(sel) { return this.$$(sel).map(n => clean.text(n.text)); }
  attr(sel, attr)  { return this.$(sel)?.attr(attr) ?? null; }
  attrs(sel, attr) { return this.$$(sel).map(n => n.attr(attr)).filter(Boolean); }
  href(sel)        { return clean.url(this.attr(sel, 'href'), this.url); }
  hrefs(sel)       { return this.$$(sel).map(n => clean.url(n.attr('href'), this.url)).filter(Boolean); }
  src(sel)         { return clean.url(this.attr(sel, 'src'), this.url); }
  num(sel)         { return clean.num(this.text(sel)); }

  // ── Smart Extract ─────────────────────────────────────────
  get links()   { return this._cached('links',   () => extractLinks(this._tree, this.url)); }
  get tables()  { return this._cached('tables',  () => extractTables(this._tree)); }
  get media()   { return this._cached('media',   () => extractMedia(this._tree, this.url)); }
  get schema()  { return this._cached('schema',  () => extractSchema(this._tree)); }
  get content() { return this._cached('content', () => extractMainContent(this._tree)); }
  get contacts(){ return this._cached('contacts',() => extractContacts(this.html)); }
  get pages()   { return this._cached('pages',   () => detectPagination(this._tree, this.url)); }

  // ── Structured Scraping via Schema ─────────────────────────
  extract(schema) {
    const result = {};
    for (const [key, def] of Object.entries(schema)) {
      if (typeof def === 'string') {
        result[key] = this.text(def);
      } else if (typeof def === 'function') {
        result[key] = def(this._tree, this);
      } else if (def.sel) {
        const { sel, attr: attrName, type = 'text', all = false, transform } = def;
        let val;
        if (all) {
          val = attrName ? this.attrs(sel, attrName) : this.texts(sel);
        } else {
          val = attrName ? this.attr(sel, attrName) : this.text(sel);
        }
        if (type === 'number') val = clean.num(val);
        if (type === 'url')    val = clean.url(val, this.url);
        if (transform)         val = transform(val);
        result[key] = val;
      }
    }
    return result;
  }

  // ── Pipeline shortcut ─────────────────────────────────────
  pipe(data) { return new Pipeline(Array.isArray(data) ? data : [data]); }

  _cached(key, fn) {
    if (!(key in this._cache)) this._cache[key] = fn();
    return this._cache[key];
  }

  toJSON() {
    return {
      url: this.url, status: this.status,
      fromCache: this.fromCache, ms: this.ms,
    };
  }
}

// ── Main ScrapEx Class ──────────────────────────────────────
export class ScrapEx {
  constructor(opts = {}) {
    this.engine  = new HttpEngine(opts);
    this._opts   = opts;
  }

  // ── Core Fetch + Parse ────────────────────────────────────
  async fetch(url, opts = {}) {
    const res  = await this.engine.fetch(url, opts);
    const html = typeof res.body === 'string' ? res.body : '';
    const tree = buildTree(html);
    return new ScrapExResult(res, tree, url);
  }

  // Shorthand
  async get(url, opts)  { return this.fetch(url, { ...opts, method: 'GET'  }); }
  async post(url, opts) { return this.fetch(url, { ...opts, method: 'POST' }); }

  // ── Batch Scrape ──────────────────────────────────────────
  async scrapeAll(urls, { schema, concurrency = 5, ...opts } = {}) {
    const results = [];
    const errors  = [];

    for (let i = 0; i < urls.length; i += concurrency) {
      const batch = urls.slice(i, i + concurrency);
      const settled = await Promise.allSettled(batch.map(url => this.fetch(url, opts)));

      settled.forEach((s, idx) => {
        if (s.status === 'fulfilled') {
          const page = s.value;
          results.push(schema ? { url: page.url, ...page.extract(schema) } : page);
        } else {
          errors.push({ url: batch[idx], error: s.reason.message });
        }
      });
    }
    return { results, errors };
  }

  // ── Auto Crawler ──────────────────────────────────────────
  async * crawl(startUrl, { maxPages = 50, filter, delay = 500, schema, ...opts } = {}) {
    const visited = new Set();
    const queue   = [startUrl];

    while (queue.length && visited.size < maxPages) {
      const url = queue.shift();
      if (visited.has(url)) continue;
      visited.add(url);

      let page;
      try {
        page = await this.fetch(url, opts);
      } catch (e) {
        yield { url, error: e.message }; continue;
      }

      const result = schema ? { url: page.url, ...page.extract(schema) } : page;
      yield result;

      // Discover new links
      const newLinks = page.links
        .map(l => l.href)
        .filter(href => href && !visited.has(href) && href.startsWith(startUrl));

      if (filter) newLinks.filter(filter).forEach(l => queue.push(l));
      else        newLinks.forEach(l => queue.push(l));

      if (delay && queue.length) await sleep(delay);
    }
  }

  // ── Parse raw HTML ────────────────────────────────────────
  parse(html, fakeUrl = 'https://example.com') {
    const tree = buildTree(html);
    return new ScrapExResult({ body: html, status: 200, headers: {}, url: fakeUrl }, tree, fakeUrl);
  }

  // ── Pipeline factory ──────────────────────────────────────
  pipeline(data) { return new Pipeline(data); }

  // ── Stats ─────────────────────────────────────────────────
  get stats() { return this.engine.stats; }

  // ── Quick factories ───────────────────────────────────────
  static create(opts = {})    { return new ScrapEx(opts); }
  static async fetch(url, opts) { return ScrapEx.create(opts).fetch(url); }
}

// ── Standalone Utility Functions ────────────────────────────
export { buildTree, FastTokenizer, QueryEngine }   from './core/parser.js';
export { HttpEngine, SmartCache, RateLimiter }     from './core/engine.js';
export { pipeline, Pipeline }                       from './pipeline/index.js';
export {
  extractLinks, extractTables, extractMedia,
  extractSchema, extractMainContent,
  extractContacts, detectPagination, clean,
}                                                  from './extractors/index.js';

export default ScrapEx;

// ── Helpers ──────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));
