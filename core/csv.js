import { normalizeSpace } from './text.js';

/**
 * Spreadsheet apps evaluate cells that start with these characters.
 * Prefix them so a product title cannot become a formula.
 */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

export function escapeCell(value) {
  let text = value == null ? '' : String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** UTF-8 BOM so Excel keeps non-ASCII titles. Trailing newline is intentional. */
export function toCsv(columns, rows) {
  const header = columns.map((column) => escapeCell(column)).join(',');
  const lines = rows.map((row) => columns.map((column) => escapeCell(row?.[column] ?? '')).join(','));
  return `\uFEFF${[header, ...lines].join('\n')}\n`;
}

export function normalizeRow(columns, row) {
  const normalized = {};
  for (const column of columns) {
    normalized[column] = normalizeSpace(row?.[column] ?? '');
  }
  return normalized;
}

export function csvFilename(adapterId, date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const safe = String(adapterId || 'extract')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'extract';
  return `${safe}-${day}.csv`;
}
