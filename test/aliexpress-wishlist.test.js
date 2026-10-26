import assert from 'node:assert/strict';
import test from 'node:test';
import { parseHTML } from 'linkedom';
import { aliexpressWishlistAdapter, COLUMNS, matches } from '../adapters/aliexpress-wishlist/adapter.js';
import { extractAll } from '../core/extractor.js';
import { toCsv } from '../core/csv.js';

const WISH = 'https://www.aliexpress.com/p/wish-manage/index.html';
const DE_WISH = 'https://de.aliexpress.com/p/wishlist/index.html';

function page(html, url = WISH) {
  const { document } = parseHTML(`<!DOCTYPE html><html><body>${html}</body></html>`);
  return { document, url };
}

test('matches wishlist urls only', () => {
  assert.equal(matches(WISH), true);
  assert.equal(matches(DE_WISH), true);
  assert.equal(matches('https://my.aliexpress.com/wishlist/wish_list_product_list.htm'), true);
  assert.equal(matches('https://www.aliexpress.com/item/1001.html'), false);
  assert.equal(matches('https://example.com/p/wish-manage/index.html'), false);
  assert.deepEqual(aliexpressWishlistAdapter.columns, COLUMNS);
  assert.deepEqual(COLUMNS, ['category', 'seller', 'price', 'shipping', 'title', 'url']);
});

test('reads an English wishlist card and ignores the struck price', () => {
  const { document } = page(`
    <div class="comet-tabs-nav">
      <div class="comet-tabs-nav-item comet-tabs-nav-item-active" role="tab" aria-selected="true">All items (2)</div>
      <div class="comet-tabs-nav-item" role="tab">My lists (1)</div>
    </div>
    <div class="AllListItem--alllistItemContainer--aaa">
      <a href="https://www.aliexpress.com/item/1001.html?spm=1"><h3>Red kettle 1.7L</h3></a>
      <p class="AllListItem--price--ddd"><span class="AllListItem--oldPrice--eee">US $40.00</span> US $19.50</p>
      <a class="AllListItem--storeName--fff" href="https://www.aliexpress.com/store/55">Bright Home</a>
      <div class="AllListItem--logistics--ggg">Free shipping</div>
    </div>
    <div class="AllListItem--alllistItemContainer--hhh">
      <a href="//www.aliexpress.com/item/1002.html"><h3>USB cable</h3></a>
      <div class="AllListItem--price--iii">€3.20</div>
      <a href="/store/77">Cable Lab</a>
      <span class="AllListItem--freight--jjj">Shipping: €1.10</span>
    </div>
  `);

  const rows = aliexpressWishlistAdapter.extractVisible(document);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    category: 'All items',
    seller: 'Bright Home',
    price: 'US $19.50',
    shipping: 'Free shipping',
    title: 'Red kettle 1.7L',
    url: 'https://www.aliexpress.com/item/1001.html?spm=1',
  });
  assert.equal(rows[1].title, 'USB cable');
  assert.equal(rows[1].price, '€3.20');
  assert.equal(rows[1].seller, 'Cable Lab');
  assert.equal(rows[1].shipping, 'Shipping: €1.10');
  assert.equal(rows[1].url, 'https://www.aliexpress.com/item/1002.html');
  assert.equal(aliexpressWishlistAdapter.planAdvance(document).action, 'scroll');
  assert.equal(aliexpressWishlistAdapter.pageStatus(document, WISH).ok, true);
});

test('reads a German list and uses the open list name as category', () => {
  const { document } = page(`
    <h1>Wunschliste</h1>
    <div role="tab">Alle Artikel</div>
    <div role="tab" aria-selected="true">Meine Listen</div>
    <div class="ListDetail--headerPCContainer--NH339OM"><h4>Küche</h4></div>
    <div class="AllListItem--alllistItemContainer--zzz">
      <a href="https://de.aliexpress.com/item/555.html"><h3>Bluetooth Kopfhörer</h3></a>
      <div class="AllListItem--price--1"><del>20,00 €</del> 12,34 €</div>
      <a href="https://de.aliexpress.com/store/999">Shop Beispiel</a>
      <div class="AllListItem--shipping--1">Kostenloser Versand</div>
    </div>
  `, DE_WISH);

  const rows = aliexpressWishlistAdapter.extractVisible(document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].category, 'Küche');
  assert.equal(rows[0].seller, 'Shop Beispiel');
  assert.equal(rows[0].price, '12,34 €');
  assert.equal(rows[0].shipping, 'Kostenloser Versand');
  assert.equal(rows[0].title, 'Bluetooth Kopfhörer');
  assert.equal(aliexpressWishlistAdapter.pageStatus(document, DE_WISH).ok, true);

  const csv = toCsv(COLUMNS, rows);
  assert.match(csv, /category,seller,price,shipping,title,url/);
  assert.match(csv, /Küche,Shop Beispiel,"12,34 €",Kostenloser Versand,Bluetooth Kopfhörer/);
});

test('list overview without product rows asks to open All items', () => {
  const { document } = page(`
    <div role="tab">All items</div>
    <div role="tab" aria-selected="true">My lists (2)</div>
    <div class="MyListPage--myListPageContainer--2C0">
      <a href="https://www.aliexpress.com/item/9.html"><img alt="cover" /></a>
      <h4>Gadgets</h4>
    </div>
  `);
  assert.equal(aliexpressWishlistAdapter.extractVisible(document).length, 0);
  assert.equal(aliexpressWishlistAdapter.planAdvance(document).action, 'open-all-items');
});

test('pagination and load-more controls are preferred over scrolling', () => {
  const next = page(`
    <div role="tab" aria-selected="true">Alle Artikel</div>
    <div class="AllListItem--alllistItemContainer--a">
      <a href="https://www.aliexpress.com/item/1.html"><h3>One</h3></a>
    </div>
    <button class="comet-pagination-next">Next</button>
  `);
  assert.equal(aliexpressWishlistAdapter.planAdvance(next.document).action, 'paginate');

  const disabled = page(`
    <div class="AllListItem--alllistItemContainer--a">
      <a href="https://www.aliexpress.com/item/1.html"><h3>One</h3></a>
    </div>
    <button class="comet-pagination-next comet-pagination-disabled" disabled>Next</button>
  `);
  assert.equal(aliexpressWishlistAdapter.planAdvance(disabled.document).action, 'scroll');

  const more = page(`
    <h1>Wunschliste</h1>
    <div class="row">
      <a href="https://de.aliexpress.com/item/7.html">Lampe</a>
      <span class="price">8,00 €</span>
      <a href="/store/3">Lampenladen</a>
      <span>Kostenloser Versand</span>
    </div>
    <button type="button">Mehr anzeigen</button>
  `, DE_WISH);
  assert.equal(aliexpressWishlistAdapter.planAdvance(more.document).action, 'paginate');
  const rows = aliexpressWishlistAdapter.extractVisible(more.document);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Lampe');
  assert.equal(rows[0].seller, 'Lampenladen');
  assert.equal(rows[0].price, '8,00 €');
  assert.equal(rows[0].shipping, 'Kostenloser Versand');
});

test('login wall and a bare item page are refused', () => {
  const login = page('<input type="password" /><h1>Sign in</h1>');
  const status = aliexpressWishlistAdapter.pageStatus(login.document, 'https://login.aliexpress.com/user/login?return_url=%2Fp%2Fwish-manage');
  assert.equal(status.ok, false);
  assert.equal(status.code, 'wrong-page');

  const wall = page('<input type="password" />', WISH);
  assert.equal(aliexpressWishlistAdapter.pageStatus(wall.document, WISH).code, 'login');
  assert.match(aliexpressWishlistAdapter.pageStatus(wall.document, WISH).message, /does not log in/i);
});

test('extractAll scrolls the real adapter until no new ids appear', async () => {
  const { document } = page(`
    <div role="tab" aria-selected="true">All items</div>
    <div id="list"></div>
  `);
  const list = document.querySelector('#list');
  const add = (id, title) => {
    const card = document.createElement('div');
    card.className = 'AllListItem--alllistItemContainer--x';
    card.innerHTML = `<a href="https://www.aliexpress.com/item/${id}.html"><h3>${title}</h3></a><div class="AllListItem--price--x">US $2.00</div>`;
    list.appendChild(card);
  };
  add(1, 'First');
  let added = 0;
  const wrapped = {
    ...aliexpressWishlistAdapter,
    planAdvance: () => ({ action: 'scroll' }),
    performAdvance() {
      added += 1;
      if (added === 1) add(2, 'Second');
    },
  };

  const result = await extractAll({
    adapter: wrapped,
    document,
    getDelayMs: () => 0,
    sleep: async () => {},
    maxStaleRounds: 2,
    maxSteps: 10,
  });

  assert.equal(result.status, 'complete');
  assert.deepEqual(result.rows.map((row) => row.title), ['First', 'Second']);
  assert.equal(result.rows[0].category, 'All items');
});
