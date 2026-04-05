/**
 * ⚡ ScrapEx - Pipeline
 * Fluent chainable data transformation system
 */

// ── Transform Pipeline ──────────────────────────────────────
export class Pipeline {
  constructor(data) {
    this._data  = Array.isArray(data) ? data : [data];
    this._steps = [];
    this._errors = [];
  }

  // Add a transform step
  pipe(fn)    { this._steps.push({ type: 'map',    fn }); return this; }
  filter(fn)  { this._steps.push({ type: 'filter', fn }); return this; }
  tap(fn)     { this._steps.push({ type: 'tap',    fn }); return this; }
  limit(n)    { this._steps.push({ type: 'limit',  n  }); return this; }
  skip(n)     { this._steps.push({ type: 'skip',   n  }); return this; }
  unique(key) { this._steps.push({ type: 'unique', key }); return this; }
  flatten()   { this._steps.push({ type: 'flatten' });     return this; }

  // Built-in cleaners
  trimText(key) {
    return this.pipe(item => {
      if (typeof item === 'string') return item.trim();
      if (key && item?.[key]) return { ...item, [key]: item[key].trim() };
      if (!key && typeof item === 'object') {
        const out = {};
        for (const [k, v] of Object.entries(item))
          out[k] = typeof v === 'string' ? v.trim() : v;
        return out;
      }
      return item;
    });
  }

  removeEmpty(keys) {
    return this.filter(item => {
      if (!item) return false;
      if (typeof item === 'string') return item.trim().length > 0;
      const targets = keys || Object.keys(item);
      return targets.some(k => item[k] !== null && item[k] !== undefined && item[k] !== '');
    });
  }

  rename(map) {
    return this.pipe(item => {
      if (typeof item !== 'object' || !item) return item;
      const out = { ...item };
      for (const [from, to] of Object.entries(map)) {
        if (from in out) { out[to] = out[from]; delete out[from]; }
      }
      return out;
    });
  }

  pick(keys) {
    return this.pipe(item => {
      if (typeof item !== 'object') return item;
      return Object.fromEntries(keys.map(k => [k, item[k]]));
    });
  }

  cast(schema) {
    return this.pipe(item => {
      const out = { ...item };
      for (const [key, type] of Object.entries(schema)) {
        if (!(key in out)) continue;
        switch (type) {
          case 'number': out[key] = parseFloat(out[key]) || null; break;
          case 'int'   : out[key] = parseInt(out[key]) || null;   break;
          case 'bool'  : out[key] = Boolean(out[key]);            break;
          case 'date'  : out[key] = new Date(out[key]);           break;
          case 'string': out[key] = String(out[key] ?? '');       break;
          case 'array' : out[key] = Array.isArray(out[key]) ? out[key] : [out[key]]; break;
        }
      }
      return out;
    });
  }

  validate(schema) {
    return this.pipe(item => {
      for (const [key, rules] of Object.entries(schema)) {
        const val = item?.[key];
        if (rules.required && (val === null || val === undefined || val === '')) {
          const err = new Error(`Validation failed: '${key}' is required`);
          err.item = item;
          this._errors.push(err);
          return null;
        }
        if (rules.min !== undefined && val < rules.min) {
          this._errors.push(new Error(`'${key}' < min(${rules.min})`));
          return null;
        }
        if (rules.max !== undefined && val > rules.max) {
          this._errors.push(new Error(`'${key}' > max(${rules.max})`));
          return null;
        }
        if (rules.pattern && !rules.pattern.test(val)) {
          this._errors.push(new Error(`'${key}' failed pattern`));
          return null;
        }
      }
      return item;
    }).filter(Boolean);
  }

  // Execute pipeline
  run() {
    let data = [...this._data];

    for (const step of this._steps) {
      switch (step.type) {
        case 'map'    : data = data.map(step.fn); break;
        case 'filter' : data = data.filter(step.fn); break;
        case 'tap'    : data.forEach(step.fn); break;
        case 'limit'  : data = data.slice(0, step.n); break;
        case 'skip'   : data = data.slice(step.n); break;
        case 'flatten': data = data.flat(Infinity); break;
        case 'unique' : {
          const seen = new Set();
          data = data.filter(item => {
            const key = step.key ? item?.[step.key] : JSON.stringify(item);
            if (seen.has(key)) return false;
            seen.add(key); return true;
          });
          break;
        }
      }
    }
    return data;
  }

  toJSON()   { return JSON.stringify(this.run(), null, 2); }
  toCSV(sep = ',') {
    const rows = this.run();
    if (!rows.length) return '';
    const headers = Object.keys(rows[0]);
    const escape  = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [
      headers.map(escape).join(sep),
      ...rows.map(r => headers.map(h => escape(r[h])).join(sep)),
    ].join('\n');
  }

  get errors() { return this._errors; }
  get length()  { return this.run().length; }
}

export const pipeline = data => new Pipeline(data);
