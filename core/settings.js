/** Runtime defaults. The popup persists overrides in chrome.storage.local. */
export const DEFAULT_SETTINGS = {
  enabled: false,
  delayMinMs: 800,
  delayMaxMs: 2500,
};

const DELAY_CAP_MS = 60_000;

export function normalizeSettings(input = {}) {
  const delayMinMs = clampInt(input.delayMinMs, 0, DELAY_CAP_MS, DEFAULT_SETTINGS.delayMinMs);
  let delayMaxMs = clampInt(input.delayMaxMs, 0, DELAY_CAP_MS, DEFAULT_SETTINGS.delayMaxMs);
  if (delayMaxMs < delayMinMs) delayMaxMs = delayMinMs;
  return {
    enabled: input.enabled === true,
    delayMinMs,
    delayMaxMs,
  };
}

export async function getSettings() {
  const stored = await chrome.storage.local.get(DEFAULT_SETTINGS);
  return normalizeSettings(stored);
}

export async function setSettings(partial) {
  const current = await getSettings();
  const next = normalizeSettings({ ...current, ...partial });
  await chrome.storage.local.set(next);
  return next;
}

function clampInt(value, min, max, fallback) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
