import assert from 'node:assert/strict';
import test from 'node:test';
import { getEnabledModules, modules, runModules } from '../modules/registry.js';

test('registry runs enabled modules and keeps going when one throws', async () => {
  const seen = [];
  const results = await runModules(
    { adapterId: 'demo', rows: [{ title: 'A' }], csv: 'title\nA\n' },
    [
      { id: 'first', enabled: true, async process(payload) { seen.push(payload.adapterId); } },
      { id: 'boom', enabled: true, async process() { throw new Error('nope'); } },
      { id: 'second', enabled: true, async process() { seen.push('second'); } },
      { id: 'skipped', enabled: false, async process() { seen.push('skipped'); } },
    ],
  );

  assert.deepEqual(seen, ['demo', 'second']);
  assert.deepEqual(results.map((item) => item.ok), [true, false, true]);
  assert.equal(results[1].message, 'nope');
  assert.equal(getEnabledModules().length, modules.length);
  assert.ok(modules.some((mod) => mod.id === 'console-log' && mod.enabled));
  assert.ok(modules.some((mod) => mod.id === 'noop' && mod.enabled));
});
