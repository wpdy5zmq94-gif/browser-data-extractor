/** Shared by the adapter object and the DOM reader. No DOM access here. */

export const ADAPTER_ID = 'aliexpress-wishlist';

export const COLUMNS = ['category', 'seller', 'price', 'shipping', 'title', 'url'];

/**
 * Scroll distance and stop conditions for this adapter.
 * Delay bounds are separate: core/settings.js and the popup.
 * Lower scrollFraction if a virtualized list skips rows.
 * Raise maxSteps for a very long wishlist.
 */
export const LIMITS = {
  maxStaleRounds: 3,
  maxSteps: 400,
  scrollFraction: 0.75,
  minScrollPx: 240,
};

export function matches(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const host = parsed.hostname.toLowerCase();
  if (!(host === 'aliexpress.com' || host.endsWith('.aliexpress.com'))) return false;
  const path = parsed.pathname.toLowerCase();
  return path.includes('/wish-manage')
    || path.includes('/wishlist')
    || path.includes('/wish_list')
    || path.includes('/wish-list');
}
