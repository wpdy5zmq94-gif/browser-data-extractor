import { csvFilename } from '../../core/csv.js';
import { ADAPTER_ID, COLUMNS, LIMITS, matches } from './constants.js';
import { extractVisible, pageStatus, performAdvance, planAdvance, rowKey } from './dom.js';

/**
 * First included adapter: the AliExpress wishlist already open in the browser.
 *
 * The random wait between scroll and page requests is not fixed here.
 * core/settings.js defaults to 800–2500 ms. The popup stores delayMinMs and
 * delayMaxMs, and the extractor draws a new value before every advance.
 */
export const aliexpressWishlistAdapter = {
  id: ADAPTER_ID,
  name: 'AliExpress Wishlist',
  description: 'Reads the open AliExpress wishlist (English or German) and exports CSV. Uses the session already in the browser and does not log in.',
  columns: COLUMNS,
  limits: LIMITS,
  matches,
  pageStatus,
  extractVisible,
  rowKey,
  planAdvance,
  performAdvance,
  filename(date) {
    return csvFilename(ADAPTER_ID, date);
  },
};

export { ADAPTER_ID, COLUMNS, LIMITS, matches };
