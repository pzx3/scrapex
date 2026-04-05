# ⚡ ScrapEx — Professional Web Scraping Library

> **Fast • Smart • Lightweight • Zero Dependencies**
> Built on native Fetch API + Custom State-Machine HTML Parser

---

## 🏗 Architecture

```
scrapex/
 ├── index.js              ← Main API (ScrapEx class)
 ├── core/
 │   ├── parser.js         ← ⚡ FastTokenizer + buildTree + QueryEngine
 │   └── engine.js         ← HttpEngine + SmartCache + RateLimiter + Retry
 ├── extractors/
 │   └── index.js          ← Links, Tables, Media, Schema, Content AI
 └── pipeline/
     └── index.js          ← Fluent data transform pipeline
```

---

## 🚀 Quick Start

```js
import ScrapEx from './scrapex/index.js';

const scraper = ScrapEx.create({
  rps      : 10,          // requests per second
  burst    : 20,          // burst capacity
  cacheTTL : 60_000,      // cache 1 minute
  retries  : 3,
  timeout  : 10_000,
});

const page = await scraper.fetch('https://example.com');

// CSS selectors
const title    = page.text('h1');
const allLinks = page.$$('nav a');
const price    = page.num('.price');
const imgUrl   = page.src('img.hero');
```

---

## 📌 Core Features

### 1. Custom HTML Tokenizer (State Machine)
```
HTML String → Tokenizer → Token Stream → Tree Builder → DOM Tree
```
- Zero regex in the hot path
- Handles malformed HTML gracefully
- 3–5× faster than string-split approaches for targeted extraction

### 2. Smart Cache (LRU + TTL)
```js
// Auto-caches all GET requests
const page1 = await scraper.fetch(url);         // network
const page2 = await scraper.fetch(url);         // from cache ⚡
console.log(page2.fromCache);                   // true
```

### 3. Token Bucket Rate Limiter
```js
// Automatically throttles — never hits rate limits
ScrapEx.create({ rps: 5, burst: 10 });
```

### 4. Smart Retry (Exponential Backoff + Jitter)
```js
// Auto-retries on network errors, 5xx
// Never retries on 4xx (fatal errors)
ScrapEx.create({ retries: 3, retryDelay: 300, factor: 2 });
```

---

## 🧠 Smart Extractors

### Links
```js
const links = page.links;
// [{ href, text, title, rel, isExternal }, ...]
```

### Tables → JSON
```js
const tables = page.tables;
// [{ headers: ['Name','Price'], data: [{Name:'X', Price:'$5'}], rows, cols }]
```

### Media
```js
const { images, videos, audio, iframes } = page.media;
```

### Structured Data (JSON-LD + OG + Meta)
```js
const { schemas, canonical, title } = page.schema;
```

### Main Content AI
```js
const content = page.content;
// { text, headings, paragraphs, lists, wordCount, score }
```

### Contact Info
```js
const { emails, phones, social } = page.contacts;
```

### Pagination
```js
const { next, pages } = page.pages;
```

---

## 📋 Schema-based Extraction

```js
const data = page.extract({
  title   : 'h1',
  price   : { sel: '.price', type: 'number' },
  image   : { sel: 'img.product', attr: 'src', type: 'url' },
  tags    : { sel: '.tag', all: true },
  rating  : { sel: '.stars', transform: v => parseFloat(v) },
  inStock : (tree) => !!tree.$('.in-stock'),
});
```

---

## ⚡ Batch Scraping

```js
const { results, errors } = await scraper.scrapeAll(urls, {
  concurrency: 10,
  schema: {
    title: 'h1',
    price: { sel: '.price', type: 'number' },
  },
});
```

---

## 🕷 Auto Crawler

```js
for await (const page of scraper.crawl('https://example.com', {
  maxPages: 100,
  delay   : 200,
  schema  : { title: 'h1', h2s: { sel: 'h2', all: true } },
})) {
  console.log(page.title, page.url);
}
```

---

## 🔄 Pipeline

```js
import { pipeline } from './scrapex/index.js';

const results = pipeline(rawData)
  .trimText()
  .removeEmpty(['title', 'price'])
  .cast({ price: 'number', date: 'date' })
  .rename({ 'product-name': 'name' })
  .pick(['name', 'price', 'url'])
  .unique('url')
  .filter(item => item.price > 10)
  .limit(50)
  .run();

// Export
pipeline(results).toCSV();   // CSV string
pipeline(results).toJSON();  // JSON string
```

---

## 📊 Stats

```js
console.log(scraper.stats);
// {
//   requests : 150,
//   hits     : 45,       ← cache hits
//   misses   : 105,
//   errors   : 2,
//   hitRate  : '30.0%',
//   avgMs    : 234,
//   cacheSize: 45,
//   pending  : 0,
// }
```

---

## 🆚 Comparison

| Feature              | ScrapEx    | Cheerio     | Playwright  |
|----------------------|------------|-------------|-------------|
| Zero dependencies    | ✅         | ❌ (jQuery) | ❌          |
| Custom parser        | ✅         | ❌          | ❌          |
| Built-in cache       | ✅         | ❌          | ❌          |
| Rate limiter         | ✅         | ❌          | ❌          |
| Content AI           | ✅         | ❌          | ❌          |
| Pipeline             | ✅         | ❌          | ❌          |
| Bundle size          | ~12KB      | ~200KB      | ~50MB       |
| JS rendering         | ❌         | ❌          | ✅          |

---

## 🔧 All Options

```js
ScrapEx.create({
  // HTTP
  timeout    : 15_000,     // ms
  retries    : 3,
  retryDelay : 300,        // ms base delay
  factor     : 2,          // backoff multiplier
  userAgent  : 'MyBot/1.0',
  headers    : {},

  // Rate Limiter
  rps        : 5,          // requests per second
  burst      : 10,         // burst tokens

  // Cache
  cacheSize  : 256,        // max entries (LRU)
  cacheTTL   : 60_000,     // ms
});
```
