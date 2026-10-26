/**
 * Template module. Registered, enabled, and intentionally does nothing.
 * Copy this file, change `id`, and implement `process` to send rows elsewhere.
 *
 * payload fields:
 *   adapterId, adapterName, columns, rows, csv, pageUrl, extractedAt
 * Rows are copies. Changing them does not change the CSV that downloads.
 */
export const noopModule = {
  id: 'noop',
  name: 'No-op',
  description: 'Registered example that leaves the rows untouched.',
  enabled: true,
  async process() {},
};
