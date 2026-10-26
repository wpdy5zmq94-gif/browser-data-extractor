import { LIMITS, matches } from './constants.js';
import { classTokens, normalizeSpace, stripCount } from '../../core/text.js';

/**
 * AliExpress renders the wishlist as a CSS-module tree. The hashed suffix
 * changes (`AllListItem--price--3BpNMAE`); the prefix and the product URL
 * stay useful. German and English copies of the same page are both handled.
 * This file only reads the DOM. It never submits a login.
 */

const PAGE_TITLES = new Set(['wunschliste', 'wishlist', 'wish list']);

const ALL_ITEMS_LABELS = ['alle artikel', 'all items', 'all products'];

const MARKER_LABELS = [
  'wunschliste',
  'wishlist',
  'wish list',
  'alle artikel',
  'all items',
  'all products',
  'meine listen',
  'my lists',
  'my list',
];

const LOAD_MORE_LABELS = [
  'load more',
  'show more',
  'view more',
  'mehr anzeigen',
  'mehr laden',
  'weitere artikel',
  'weitere anzeigen',
];

const CARD_SELECTORS = [
  '[class*="AllListItem--"]',
  '[class*="alllistItem"]',
  '[class*="allListItem"]',
  '[class*="ListItem--"]',
  '[class*="listItem--"]',
  '[class*="productItem"]',
  '[class*="ProductItem"]',
  '[class*="wishItem"]',
  '[class*="WishItem"]',
  '[class*="itemCard"]',
  '[class*="ItemCard"]',
];

const NEXT_SELECTORS = [
  '.comet-pagination-next',
  '[class*="pagination-next"]',
  '[class*="pagination"] [class*="next"]',
  '[class*="Pagination"] [class*="next"]',
  'button[aria-label="Next"]',
  'button[aria-label="Weiter"]',
  'a[aria-label="Next"]',
  'a[aria-label="Weiter"]',
  '[aria-label="Next page"]',
  '[aria-label="Nächste Seite"]',
];

const TAB_SELECTOR = '[role="tab"], .comet-tabs-nav-item, [class*="tabs"] [class*="tab"]';

const PRICE_RE = /(?:(?:US|AU|CA|NZ)\s*)?[$€£¥]\s?\d[\d.,]*|\d[\d.,]*\s?[$€£¥]|(?:EUR|USD|GBP)\s?\d[\d.,]*|\d[\d.,]*\s?(?:EUR|USD|GBP)/i;

const SHIPPING_RE = /shipping|versand|lieferung|postage|fracht/i;

const ITEM_HREF_RE = /\/item\/(\d+)/;

export function rowKey(row) {
  const match = String(row?.url || '').match(ITEM_HREF_RE);
  if (match) return `item:${match[1]}`;
  const fallback = [row?.title, row?.seller, row?.price].map((part) => normalizeSpace(part).toLowerCase()).join('|');
  return fallback.replace(/\|/g, '').trim() ? `row:${fallback}` : '';
}

export function pageStatus(document, url) {
  if (!matches(url)) {
    return {
      ok: false,
      code: 'wrong-page',
      message: 'Open your AliExpress wishlist first (the wish-manage or wishlist page).',
    };
  }
  if (findProductCards(document).length > 0 || hasWishlistMarker(document)) {
    return { ok: true };
  }
  if (looksLikeLogin(document, url)) {
    return {
      ok: false,
      code: 'login',
      message: 'AliExpress is asking you to sign in. Sign in yourself in this browser, open the wishlist, then export. This extension does not log in.',
    };
  }
  return {
    ok: false,
    code: 'not-ready',
    message: 'The wishlist is not visible yet. Wait until you see Wunschliste / Wishlist, Alle Artikel / All items, or Meine Listen / My lists, then export again.',
  };
}

export function extractVisible(document) {
  const pageCategory = detectPageCategory(document);
  const base = document.baseURI || document.URL || 'https://www.aliexpress.com/';
  const rows = [];
  for (const card of findProductCards(document)) {
    const url = absoluteItemUrl(findItemAnchor(card), base);
    const title = findTitle(card);
    if (!title && !url) continue;
    rows.push({
      category: findCardCategory(card) || pageCategory,
      seller: findSeller(card),
      price: findPrice(card),
      shipping: findShipping(card, title),
      title,
      url,
    });
  }
  return rows;
}

export function planAdvance(document) {
  if (findProductCards(document).length === 0) {
    const tab = findAllItemsTab(document);
    if (tab && !isTabActive(tab)) return { action: 'open-all-items' };
  }
  const next = findNextControl(document);
  if (next) return { action: 'paginate' };
  return { action: 'scroll' };
}

export function performAdvance(document, plan) {
  if (!plan || plan.action === 'done') return;
  if (plan.action === 'open-all-items') {
    const tab = findAllItemsTab(document);
    if (tab && !isTabActive(tab)) tab.click();
    return;
  }
  if (plan.action === 'paginate') {
    const next = findNextControl(document);
    if (next) next.click();
    return;
  }
  performScroll(document);
}

export function performScroll(document, limits = LIMITS) {
  const target = findScrollContainer(document);
  const view = document.defaultView;
  const viewport = target?.clientHeight || view?.innerHeight || 0;
  const fraction = limits.scrollFraction ?? 0.75;
  const floor = limits.minScrollPx ?? 240;
  const delta = viewport > 0 ? Math.max(floor, Math.floor(viewport * fraction)) : 640;

  if (target && typeof target.scrollBy === 'function') {
    target.scrollBy(0, delta);
    return;
  }
  if (target) {
    target.scrollTop = (target.scrollTop || 0) + delta;
    return;
  }
  if (view && typeof view.scrollBy === 'function') {
    view.scrollBy(0, delta);
    return;
  }
  const root = document.scrollingElement || document.documentElement || document.body;
  if (root) root.scrollTop = (root.scrollTop || 0) + delta;
}

export function hasWishlistMarker(document) {
  const nodes = document.querySelectorAll('h1, h2, [role="tab"], title');
  for (const node of nodes) {
    const value = stripCount(node.textContent).toLowerCase();
    if (!value || value.length > 80) continue;
    if (MARKER_LABELS.some((marker) => value === marker || value.startsWith(`${marker} `))) return true;
  }
  return false;
}

export function findProductCards(document) {
  for (const selector of CARD_SELECTORS) {
    const nodes = outermost([...document.querySelectorAll(selector)])
      .filter((node) => !isInChrome(node) && !isHidden(node))
      .filter((node) => findItemAnchor(node));
    if (nodes.length > 0) return nodes;
  }
  return cardsFromItemLinks(document);
}

function cardsFromItemLinks(document) {
  const links = [...document.querySelectorAll('a[href]')].filter((anchor) => ITEM_HREF_RE.test(anchor.getAttribute('href') || ''));
  const cards = [];
  const seen = new Set();
  for (const link of links) {
    if (isInChrome(link) || isHidden(link)) continue;
    if (link.closest('[class*="MyListPage"], [class*="myListPage"], [class*="my-list-page"]')) continue;
    const card = cardFromLink(link);
    if (!card || seen.has(card)) continue;
    seen.add(card);
    cards.push(card);
  }
  return cards;
}

function cardFromLink(link) {
  let card = link;
  let node = link.parentElement;
  let steps = 0;
  while (node && node !== link.ownerDocument.body && steps < 8) {
    if (countItemLinks(node) > 1) break;
    card = node;
    node = node.parentElement;
    steps += 1;
  }
  return card;
}

function countItemLinks(node) {
  const ids = new Set();
  for (const anchor of node.querySelectorAll('a[href]')) {
    const match = (anchor.getAttribute('href') || '').match(ITEM_HREF_RE);
    if (match) ids.add(match[1]);
  }
  return ids.size;
}

function findItemAnchor(card) {
  for (const anchor of card.querySelectorAll('a[href]')) {
    if (ITEM_HREF_RE.test(anchor.getAttribute('href') || '')) return anchor;
  }
  return null;
}

function absoluteItemUrl(anchor, base) {
  if (!anchor) return '';
  const href = anchor.getAttribute('href') || '';
  if (!href) return '';
  const safeBase = /^https?:/i.test(base || '') ? base : 'https://www.aliexpress.com/';
  try {
    const url = new URL(href, safeBase);
    if (url.protocol === 'http:' && /(^|\.)aliexpress\.com$/i.test(url.hostname)) url.protocol = 'https:';
    url.hash = '';
    return url.href;
  } catch {
    return href;
  }
}

function findTitle(card) {
  const heading = card.querySelector('h1, h2, h3, h4, [class*="title"], [class*="Title"]');
  const headingText = heading ? normalizeSpace(heading.textContent) : '';
  if (headingText && headingText.length > 1 && headingText.length <= 500 && !PAGE_TITLES.has(headingText.toLowerCase())) {
    return headingText;
  }
  const anchor = findItemAnchor(card);
  const anchorText = anchor ? normalizeSpace(anchor.textContent) : '';
  if (anchorText && anchorText.length > 1 && anchorText.length <= 500) return anchorText;
  const alt = card.querySelector('img[alt]')?.getAttribute('alt') || '';
  const altText = normalizeSpace(alt);
  if (altText && altText.length > 1 && altText.length <= 500) return altText;
  return '';
}

function findPrice(card) {
  const candidates = [...card.querySelectorAll('[class*="price"], [class*="Price"]')]
    .filter((element) => element !== card && !isStruck(element))
    .map((element) => priceText(element))
    .filter((text) => text && text.length < 48 && PRICE_RE.test(text))
    .sort((a, b) => a.length - b.length);
  if (candidates[0]) return candidates[0].match(PRICE_RE)[0];

  for (const leaf of leaves(card)) {
    const text = normalizeSpace(leaf.textContent);
    if (!text || text.length > 48 || isStruck(leaf)) continue;
    const match = text.match(PRICE_RE);
    if (match) return match[0];
  }
  return '';
}

function priceText(element) {
  const clone = element.cloneNode(true);
  for (const node of [...clone.querySelectorAll('*')]) {
    if (isStruck(node)) node.remove();
  }
  return normalizeSpace(clone.textContent);
}

function isStruck(element) {
  const tag = String(element.tagName || '').toUpperCase();
  if (tag === 'DEL' || tag === 'S' || tag === 'STRIKE') return true;
  const tokens = classTokens(element.className);
  if (tokens.some((token) => token === 'old' || token === 'del' || token === 'origin' || token === 'original' || token === 'linethrough' || token === 'listprice')) {
    return true;
  }
  try {
    const style = element.ownerDocument?.defaultView?.getComputedStyle?.(element);
    const decoration = `${style?.textDecorationLine || ''} ${style?.textDecoration || ''}`;
    if (decoration.includes('line-through')) return true;
  } catch {
    // No layout. Class and tag checks above still apply.
  }
  return false;
}

function findSeller(card) {
  const store = [...card.querySelectorAll('a[href]')].find((anchor) => /\/store\/|storeId|\/shop\//i.test(anchor.getAttribute('href') || ''));
  const fromLink = store ? normalizeSpace(store.textContent) : '';
  if (fromLink && fromLink.length < 120) return fromLink;

  const named = [...card.querySelectorAll('[class*="store"], [class*="Store"], [class*="seller"], [class*="Seller"], [class*="shopName"], [class*="shop-name"]')]
    .find((element) => element !== card);
  const text = named ? normalizeSpace(named.textContent) : '';
  if (text && text.length < 120 && !PRICE_RE.test(text)) return text;
  return '';
}

function findShipping(card, title) {
  const named = [...card.querySelectorAll('[class*="shipping"], [class*="Shipping"], [class*="freight"], [class*="Freight"], [class*="logistics"], [class*="Logistics"], [class*="delivery"], [class*="postage"]')]
    .find((element) => element !== card);
  const namedText = named ? normalizeSpace(named.textContent) : '';
  if (namedText && namedText.length < 120 && namedText !== title) return namedText;

  for (const leaf of leaves(card)) {
    const text = normalizeSpace(leaf.textContent);
    if (!text || text.length > 80 || text === title) continue;
    if (SHIPPING_RE.test(text)) return text;
  }
  return '';
}

function findCardCategory(card) {
  const named = card.querySelector('[class*="category"], [class*="Category"]');
  if (!named || named === card) return '';
  const text = stripCount(named.textContent);
  if (!text || text.length > 80 || PAGE_TITLES.has(text.toLowerCase())) return '';
  return text;
}

function detectPageCategory(document) {
  const listTitle = firstText(document, [
    '[class*="ListDetail"] h1',
    '[class*="ListDetail"] h2',
    '[class*="ListDetail"] h3',
    '[class*="ListDetail"] h4',
    '[class*="listName"]',
    '[class*="list-name"]',
  ]);
  if (listTitle && !PAGE_TITLES.has(listTitle.toLowerCase())) return listTitle;

  const active = [...document.querySelectorAll(TAB_SELECTOR)].find((element) => isTabActive(element));
  if (active) {
    const label = stripCount(active.textContent);
    if (label && !PAGE_TITLES.has(label.toLowerCase())) return label;
  }
  return '';
}

function firstText(document, selectors) {
  for (const selector of selectors) {
    const text = stripCount(document.querySelector(selector)?.textContent || '');
    if (text) return text;
  }
  return '';
}

function findAllItemsTab(document) {
  return [...document.querySelectorAll(TAB_SELECTOR)].find((element) => {
    const label = stripCount(element.textContent).toLowerCase();
    return ALL_ITEMS_LABELS.includes(label);
  }) || null;
}

function findNextControl(document) {
  for (const selector of NEXT_SELECTORS) {
    for (const node of document.querySelectorAll(selector)) {
      const clickable = asClickable(node);
      if (clickable && !isDisabled(node) && !isDisabled(clickable) && !isInProductCard(clickable)) return clickable;
    }
  }
  for (const node of document.querySelectorAll('button, [role="button"], a')) {
    if (!matchesLoadMore(node.textContent)) continue;
    if (isDisabled(node) || isInChrome(node) || isInProductCard(node)) continue;
    return node;
  }
  return null;
}

function matchesLoadMore(value) {
  const text = normalizeSpace(value).toLowerCase();
  return LOAD_MORE_LABELS.some((label) => text === label || text.startsWith(`${label} `));
}

function asClickable(element) {
  if (!element) return null;
  if (element.matches('button, a, [role="button"]')) return element;
  return element.querySelector('button, a, [role="button"]') || element;
}

function isDisabled(element) {
  if (!element) return true;
  if (element.disabled || element.getAttribute('aria-disabled') === 'true') return true;
  const tokens = classTokens(element.className);
  return tokens.includes('disabled');
}

function isTabActive(element) {
  if (!element) return false;
  if (element.getAttribute('aria-selected') === 'true') return true;
  const tokens = classTokens(element.className);
  const tabLike = tokens.includes('tab') || element.getAttribute('role') === 'tab' || String(element.className || '').includes('comet-tabs');
  return tabLike && (tokens.includes('active') || tokens.includes('selected'));
}

function isInProductCard(element) {
  return CARD_SELECTORS.some((selector) => {
    try {
      return Boolean(element.closest(selector));
    } catch {
      return false;
    }
  });
}

function isInChrome(element) {
  return Boolean(element.closest('header, nav'));
}

function isHidden(element) {
  return Boolean(element.closest('[hidden], template'));
}

function leaves(root) {
  return [...root.querySelectorAll('span, p, div, a, li')].filter((element) => element.children.length === 0);
}

function outermost(nodes) {
  return nodes.filter((node) => !nodes.some((other) => other !== node && other.contains(node)));
}

function findScrollContainer(document) {
  let best = null;
  let bestRoom = 80;
  const candidates = document.querySelectorAll('[class*="wish"], [class*="Wish"], [class*="List"], [class*="list"], [class*="content"], [class*="Content"]');
  for (const element of candidates) {
    if (isHidden(element)) continue;
    const client = element.clientHeight || 0;
    // Ignore nodes with no box. A hidden template can report a huge scrollHeight.
    if (client < 80) continue;
    const room = (element.scrollHeight || 0) - (element.scrollTop || 0) - client;
    if (room > bestRoom) {
      best = element;
      bestRoom = room;
    }
  }
  return best;
}

function looksLikeLogin(document, url) {
  if (/login|passport|signin|sign-in/i.test(url || '')) return true;
  return Boolean(document.querySelector('input[type="password"]'));
}
