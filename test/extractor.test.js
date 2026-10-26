import assert from 'node:assert/strict';
import test from 'node:test';
import { extractAll, shouldDownload } from '../core/extractor.js';

const columns = ['category', 'seller', 'price', 'shipping', 'title', 'url'];

test('extractAll dedupes, waits, and stops after stale rounds', async () => {
  const delays = [];
  const advances = [];
  let reads = 0;
  const adapter = {
    id: 'fake',
    columns,
    limits: { maxStaleRounds: 3, maxSteps: 20 },
    extractVisible() {
      reads += 1;
      return [{
        category: 'All items',
        seller: 'Shop',
        price: 'US $1',
        shipping: 'Free shipping',
        title: 'Kettle',
        url: 'https://www.aliexpress.com/item/1001.html?spm=a',
      }, {
        category: 'All items',
        seller: 'Shop',
        price: 'US $1',
        shipping: 'Free shipping',
        title: 'Kettle duplicate',
        url: 'https://www.aliexpress.com/item/1001.html?spm=b',
      }];
    },
    rowKey(row) {
      const match = row.url.match(/\/item\/(\d+)/);
      return `item:${match[1]}`;
    },
    planAdvance() {
      return { action: 'scroll' };
    },
    async performAdvance(_document, plan) {
      advances.push(plan.action);
    },
  };

  const result = await extractAll({
    adapter,
    document: {},
    getDelayMs: () => 1250,
    sleep: async (ms) => { delays.push(ms); },
  });

  assert.equal(result.status, 'complete');
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].title, 'Kettle');
  assert.deepEqual(delays, [1250, 1250, 1250]);
  assert.deepEqual(advances, ['scroll', 'scroll', 'scroll']);
  assert.equal(shouldDownload(result), true);
  assert.ok(reads >= 4);
});

test('extractAll reports max-steps and includes the row loaded by the last advance', async () => {
  let n = 1;
  const adapter = {
    id: 'fake',
    columns,
    extractVisible() {
      return [{ title: `Item ${n}`, url: `https://www.aliexpress.com/item/${n}.html`, category: '', seller: '', price: '', shipping: '' }];
    },
    rowKey: (row) => row.url,
    planAdvance: () => ({ action: 'paginate' }),
    async performAdvance() { n += 1; },
  };

  const result = await extractAll({
    adapter,
    document: {},
    getDelayMs: async () => 0,
    sleep: async () => {},
    maxSteps: 3,
    maxStaleRounds: 10,
  });

  assert.equal(result.status, 'max-steps');
  assert.deepEqual(result.rows.map((row) => row.title), ['Item 1', 'Item 2', 'Item 3', 'Item 4']);
  assert.equal(shouldDownload(result), true);
});

test('an aborted run is not downloaded', async () => {
  const controller = new AbortController();
  const adapter = {
    id: 'fake',
    columns,
    extractVisible() {
      controller.abort();
      return [{ title: 'Partial', url: 'https://www.aliexpress.com/item/9.html' }];
    },
    rowKey: (row) => row.url,
    planAdvance: () => ({ action: 'scroll' }),
    async performAdvance() {},
  };

  const result = await extractAll({
    adapter,
    document: {},
    signal: controller.signal,
    getDelayMs: () => 5000,
    sleep: async () => {},
  });

  assert.equal(result.status, 'aborted');
  assert.equal(shouldDownload(result), false);
  assert.equal(result.rows.length, 1);
});
