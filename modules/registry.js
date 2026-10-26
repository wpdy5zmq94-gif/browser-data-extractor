import { consoleLogModule } from './console-log.js';
import { noopModule } from './noop.js';

/**
 * Module slot. Runs after an adapter finishes and before the CSV downloads.
 *
 * To add one:
 * 1. Copy modules/noop.js to modules/<id>.js.
 * 2. Export `{ id, name, description, enabled, async process(payload) }`.
 * 3. Import it here and append it to `modules`.
 * 4. Reload the unpacked extension.
 * Set enabled: false to keep a module registered without running it.
 * A thrown error is reported in the popup and does not cancel the download.
 */
export const modules = [consoleLogModule, noopModule];

export function getEnabledModules(list = modules) {
  return list.filter((mod) => mod.enabled !== false);
}

export async function runModules(payload, list = modules) {
  const results = [];
  for (const mod of getEnabledModules(list)) {
    try {
      await mod.process(payload);
      results.push({ id: mod.id, ok: true });
    } catch (error) {
      results.push({
        id: mod.id,
        ok: false,
        message: error?.message || String(error),
      });
    }
  }
  return results;
}
