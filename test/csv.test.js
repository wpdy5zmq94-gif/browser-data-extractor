import assert from 'node:assert/strict';
import test from 'node:test';
import { csvFilename, escapeCell, normalizeRow, toCsv } from '../core/csv.js';

test('csv columns and formula-safe cells', () => {
  const columns = ['category', 'seller', 'price', 'shipping', 'title', 'url'];
  const csv = toCsv(columns, [
    {
      category: 'Küche',
      seller: 'Shop, Beispiel',
      price: '12,34 €',
      shipping: 'Kostenloser Versand',
      title: '=HYPERLINK("http://evil")',
      url: 'https://www.aliexpress.com/item/5.html',
    },
  ]);
  assert.equal(csv.charCodeAt(0), 0xfeff);
  assert.equal(
    csv.slice(1),
    'category,seller,price,shipping,title,url\n'
    + 'Küche,"Shop, Beispiel","12,34 €",Kostenloser Versand,"\'=HYPERLINK(""http://evil"")",https://www.aliexpress.com/item/5.html\n',
  );
});

test('escapeCell quotes quotes and prefixes formulas', () => {
  assert.equal(escapeCell('plain'), 'plain');
  assert.equal(escapeCell('Say "hi"'), '"Say ""hi"""');
  assert.equal(escapeCell('+1'), "'+1");
  assert.equal(escapeCell('-1'), "'-1");
  assert.equal(escapeCell('@cmd'), "'@cmd");
});

test('normalizeRow fills missing columns and collapses space', () => {
  assert.deepEqual(normalizeRow(['title', 'price'], { title: ' Red \n kettle ' }), {
    title: 'Red kettle',
    price: '',
  });
});

test('csvFilename is dated and safe', () => {
  const name = csvFilename('AliExpress Wishlist', new Date('2026-10-26T12:00:00Z'));
  assert.equal(name, 'aliexpress-wishlist-2026-10-26.csv');
});
