import { aliexpressWishlistAdapter } from './aliexpress-wishlist/adapter.js';

/**
 * Adapter slot.
 *
 * To add a site:
 * 1. Create adapters/<id>/adapter.js exporting an object with:
 *    id, name, description, columns, limits, matches(url),
 *    pageStatus(document, url), extractVisible(document), rowKey(row),
 *    planAdvance(document, ctx) → { action: 'scroll'|'paginate'|'done'|... },
 *    performAdvance(document, plan), filename(date?).
 * 2. Import it below and append it to `adapters`. The first match wins.
 * 3. Add that site's origin to host_permissions and content_scripts.matches
 *    in manifest.json, then reload the unpacked extension.
 * 4. planAdvance should request one scroll or one page. The core waits a
 *    random delay (popup / core/settings.js) before performAdvance.
 */
export const adapters = [aliexpressWishlistAdapter];

export function matchAdapter(url) {
  if (!url) return null;
  return adapters.find((adapter) => adapter.matches(url)) ?? null;
}

export function listAdapters() {
  return adapters.map((adapter) => ({
    id: adapter.id,
    name: adapter.name,
    description: adapter.description,
    columns: [...adapter.columns],
  }));
}
