import { matchAdapter } from '../adapters/registry.js';
import { toCsv } from '../core/csv.js';
import { randomDelayMs, sleep } from '../core/delay.js';
import { extractAll, shouldDownload } from '../core/extractor.js';
import { Message } from '../core/messages.js';
import { getSettings } from '../core/settings.js';
import { runModules } from '../modules/registry.js';

/**
 * Injected on AliExpress so an export can run against the open session.
 * While the popup toggle is off, the only work is reading that flag from
 * extension storage and returning. The page DOM is not read.
 */

let current = null;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== Message.EXTRACT && message?.type !== Message.PAGE_STATUS) return undefined;
  respond(message).then(
    (result) => reply(sendResponse, result),
    (error) => reply(sendResponse, { ok: false, code: 'error', message: error?.message || String(error) }),
  );
  return true;
});

function reply(sendResponse, result) {
  try {
    sendResponse(result);
  } catch {
    // The popup closed. A download that already started still finishes.
  }
}

async function respond(message) {
  const settings = await getSettings();
  if (!settings.enabled) {
    return {
      ok: false,
      code: 'disabled',
      message: 'Extension is off. The page was not read.',
    };
  }

  const adapter = matchAdapter(location.href);
  if (!adapter) {
    return {
      ok: false,
      code: 'no-adapter',
      message: 'No adapter matches this page.',
    };
  }

  if (message.type === Message.PAGE_STATUS) {
    const status = adapter.pageStatus(document, location.href);
    return {
      ok: Boolean(status.ok),
      code: status.code || 'ready',
      message: status.message || '',
      adapterId: adapter.id,
      adapterName: adapter.name,
    };
  }

  return runExtract(adapter);
}

async function runExtract(adapter) {
  if (current) {
    return { ok: false, code: 'busy', message: 'An export is already running on this page.' };
  }

  const controller = new AbortController();
  const stopWatching = watchDisable(controller);
  current = controller;
  try {
    const fresh = await getSettings();
    if (!fresh.enabled) {
      return { ok: false, code: 'disabled', message: 'Extension is off. The page was not read.' };
    }

    const status = adapter.pageStatus(document, location.href);
    if (!status.ok) return { ok: false, code: status.code, message: status.message };

    const result = await extractAll({
      adapter,
      document,
      signal: controller.signal,
      getDelayMs: async () => {
        const latest = await getSettings();
        return randomDelayMs(latest.delayMinMs, latest.delayMaxMs);
      },
      sleep,
      onProgress: (progress) => {
        chrome.runtime.sendMessage({
          type: Message.PROGRESS,
          ...progress,
          adapterId: adapter.id,
        }).catch(() => {});
      },
    });

    if (!shouldDownload(result)) {
      return {
        ok: false,
        code: 'aborted',
        message: 'Stopped because the extension was turned off. No file was saved.',
        count: result.rows.length,
      };
    }

    const rows = result.rows.map((row) => ({ ...row }));
    const csv = toCsv(adapter.columns, rows);
    const filename = adapter.filename(new Date());
    const moduleResults = await runModules({
      adapterId: adapter.id,
      adapterName: adapter.name,
      columns: [...adapter.columns],
      rows,
      csv,
      pageUrl: location.href,
      extractedAt: new Date().toISOString(),
    });

    const saved = await saveCsv(csv, filename);
    if (!saved.ok) {
      return {
        ok: false,
        code: 'download',
        message: saved.message || 'Could not start the download.',
        count: rows.length,
        moduleResults,
      };
    }

    return {
      ok: true,
      count: rows.length,
      filename,
      status: result.status,
      moduleResults,
      message: summary({ rows, filename, result, adapter, moduleResults }),
    };
  } finally {
    stopWatching();
    if (current === controller) current = null;
  }
}

function watchDisable(controller) {
  const listener = (changes, area) => {
    if (area === 'local' && changes.enabled && changes.enabled.newValue === false) {
      controller.abort();
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

async function saveCsv(csv, filename) {
  try {
    const download = await chrome.runtime.sendMessage({
      type: Message.DOWNLOAD_CSV,
      csv,
      filename,
    });
    if (download?.ok) return download;
    const fallback = downloadWithAnchor(csv, filename);
    if (fallback.ok) return fallback;
    return { ok: false, message: download?.message || fallback.message };
  } catch (error) {
    const fallback = downloadWithAnchor(csv, filename);
    if (fallback.ok) return fallback;
    return { ok: false, message: error?.message || fallback.message || 'Could not start the download.' };
  }
}

function downloadWithAnchor(csv, filename) {
  try {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return { ok: true };
  } catch (error) {
    return { ok: false, message: error?.message || String(error) };
  }
}

function summary({ rows, filename, result, adapter, moduleResults }) {
  const failed = moduleResults.filter((item) => !item.ok);
  const parts = [`Saved ${rows.length} rows to ${filename}.`];
  if (rows.length === 0) {
    parts.push('No items were visible. Open Alle Artikel / All items and try again.');
  }
  if (result.status === 'max-steps') {
    parts.push(`Reached the step cap (${adapter.limits?.maxSteps ?? result.steps}). Raise maxSteps on the adapter if the list is longer.`);
  }
  if (failed.length > 0) {
    parts.push(`Module ${failed.map((item) => `${item.id}: ${item.message}`).join('; ')} failed.`);
  }
  return parts.join(' ');
}
