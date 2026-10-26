import { Message } from '../core/messages.js';

/**
 * Saves the CSV the content script already built.
 * Blob URLs work from the extension service worker; a data URL is the fallback.
 * This worker does not read AliExpress and does not log anyone in.
 */

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== Message.DOWNLOAD_CSV) return undefined;
  downloadCsv(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, message: error?.message || String(error) }));
  return true;
});

async function downloadCsv({ csv, filename }) {
  if (typeof csv !== 'string' || !filename) {
    return { ok: false, message: 'Missing CSV payload.' };
  }
  const safeName = String(filename).replace(/[\\/]/g, '');
  const blobUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  try {
    const downloadId = await chrome.downloads.download({
      url: blobUrl,
      filename: safeName,
      saveAs: false,
      conflictAction: 'uniquify',
    });
    return { ok: true, downloadId };
  } catch (blobError) {
    try {
      const downloadId = await chrome.downloads.download({
        url: `data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`,
        filename: safeName,
        saveAs: false,
        conflictAction: 'uniquify',
      });
      return { ok: true, downloadId };
    } catch (dataError) {
      return {
        ok: false,
        message: dataError?.message || blobError?.message || 'Download failed.',
      };
    }
  } finally {
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
  }
}
