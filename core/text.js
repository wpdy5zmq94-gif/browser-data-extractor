/** Collapse whitespace and trim. CSV cells stay single-line. */
export function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

/** "Alle Artikel (12)" and "My lists · 3" → label without the count. */
export function stripCount(value) {
  return normalizeSpace(value)
    .replace(/\s*\(\d[\d.,]*\)\s*$/, '')
    .replace(/\s*[·•|]\s*\d[\d.,]*\s*$/, '')
    .trim();
}

/** CSS-module class strings ("oldPrice", "AllListItem--price--x") → tokens. */
export function classTokens(className) {
  return String(className || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
