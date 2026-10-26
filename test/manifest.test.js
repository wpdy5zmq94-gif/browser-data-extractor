import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('manifest is a loadable Manifest V3 extension', () => {
  const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.background.type, 'module');
  assert.equal(manifest.content_scripts[0].type, 'module');
  assert.ok(manifest.permissions.includes('storage'));
  assert.ok(manifest.permissions.includes('downloads'));
  assert.ok(manifest.host_permissions.some((pattern) => pattern.includes('aliexpress.com')));
  assert.deepEqual(manifest.content_scripts[0].matches, manifest.host_permissions);
  assert.equal(manifest.homepage_url, 'https://github.com/wpdy5zmq94-gif/browser-data-extractor');

  const files = [
    manifest.action.default_popup,
    manifest.background.service_worker,
    ...manifest.content_scripts[0].js,
    ...Object.values(manifest.icons),
  ];
  for (const file of files) {
    assert.equal(existsSync(path.join(root, file)), true, file);
  }
});

test('content script returns before reading the page when disabled', () => {
  const source = readFileSync(path.join(root, 'content/content.js'), 'utf8');
  const gate = source.indexOf('if (!settings.enabled)');
  const domRead = source.indexOf('adapter.pageStatus');
  assert.ok(gate > 0);
  assert.ok(domRead > gate);
  assert.match(source, /The page was not read/);
});
