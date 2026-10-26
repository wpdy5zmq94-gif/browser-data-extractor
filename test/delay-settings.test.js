import assert from 'node:assert/strict';
import test from 'node:test';
import { randomDelayMs } from '../core/delay.js';
import { DEFAULT_SETTINGS, normalizeSettings } from '../core/settings.js';

test('randomDelayMs is inclusive and uses a fresh draw', () => {
  assert.equal(randomDelayMs(800, 2500, () => 0), 800);
  assert.equal(randomDelayMs(800, 2500, () => 0.999999), 2500);
  assert.equal(randomDelayMs(800, 800, () => 0.2), 800);
  assert.equal(DEFAULT_SETTINGS.delayMinMs, 800);
  assert.equal(DEFAULT_SETTINGS.delayMaxMs, 2500);
  assert.equal(DEFAULT_SETTINGS.enabled, false);
});

test('normalizeSettings clamps and keeps the extension off unless explicitly enabled', () => {
  assert.deepEqual(normalizeSettings({}), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ enabled: true, delayMinMs: 50, delayMaxMs: 10 }), {
    enabled: true,
    delayMinMs: 50,
    delayMaxMs: 50,
  });
  assert.equal(normalizeSettings({ delayMinMs: 'nope', delayMaxMs: 999999 }).delayMaxMs, 60000);
  assert.equal(normalizeSettings({ delayMinMs: '', delayMaxMs: '' }).delayMinMs, 800);
  assert.equal(normalizeSettings({ enabled: 'yes' }).enabled, false);
});
