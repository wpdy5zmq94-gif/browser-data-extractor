/** Example module. Runs after extraction and before the CSV download. */
export const consoleLogModule = {
  id: 'console-log',
  name: 'Console log',
  description: 'Prints a short summary and the first rows in the page console.',
  enabled: true,
  async process(payload) {
    console.info(
      `[browser-data-extractor] ${payload.adapterName}: ${payload.rows.length} rows`,
      payload.rows.slice(0, 3),
    );
  },
};
