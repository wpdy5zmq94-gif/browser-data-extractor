import { listAdapters, matchAdapter } from '../adapters/registry.js';
import { Message } from '../core/messages.js';
import { getSettings, setSettings } from '../core/settings.js';

const enabledInput = document.querySelector('#enabled');
const enabledLabel = document.querySelector('#enabled-label');
const enabledHelp = document.querySelector('#enabled-help');
const adapterName = document.querySelector('#adapter-name');
const adapterDetail = document.querySelector('#adapter-detail');
const columns = document.querySelector('#columns');
const delayMin = document.querySelector('#delay-min');
const delayMax = document.querySelector('#delay-max');
const exportButton = document.querySelector('#export');
const status = document.querySelector('#status');

let tabId = null;
let matched = null;
let running = false;

enabledInput.disabled = true;
delayMin.disabled = true;
delayMax.disabled = true;

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== Message.PROGRESS || message.adapterId !== matched?.id) return;
  if (message.phase === 'wait') {
    setStatus(`Waiting ${formatSeconds(message.delayMs)} before ${message.action}. ${message.count} rows so far.`);
    return;
  }
  setStatus(`Reading the page. ${message.count} rows so far.`);
});

init().catch((error) => setStatus(error.message || String(error), true));

enabledInput.addEventListener('change', async () => {
  const settings = await setSettings({ enabled: enabledInput.checked });
  applySettings(settings);
  await refreshPage();
});

delayMin.addEventListener('change', saveDelay);
delayMax.addEventListener('change', saveDelay);

exportButton.addEventListener('click', async () => {
  if (!tabId || !matched || !enabledInput.checked || running) return;
  running = true;
  exportButton.disabled = true;
  setStatus('Starting export…');
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: Message.EXTRACT });
    if (!response) {
      setStatus('No response from the page. Reload the tab, then try again.', true);
      return;
    }
    setStatus(response.message || (response.ok ? 'Export finished.' : 'Export failed.'), !response.ok);
  } catch (error) {
    const missing = /Receiving end does not exist|Could not establish connection/i.test(error?.message || '');
    setStatus(
      missing
        ? 'Reload the wishlist tab so the extension can attach, then try Export again.'
        : (error?.message || String(error)),
      true,
    );
  } finally {
    running = false;
    syncExportButton();
  }
});

async function init() {
  try {
    const settings = await getSettings();
    applySettings(settings);
    delayMin.value = String(settings.delayMinMs);
    delayMax.value = String(settings.delayMaxMs);
    const included = listAdapters().map((adapter) => adapter.name).join(', ');
    adapterDetail.textContent = included ? `Included adapters: ${included}.` : 'No adapters are registered.';
    await refreshPage();
  } finally {
    enabledInput.disabled = false;
    delayMin.disabled = false;
    delayMax.disabled = false;
    syncExportButton();
  }
}

async function refreshPage() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab?.id ?? null;
  matched = matchAdapter(tab?.url || '');
  if (!matched) {
    adapterName.textContent = 'No adapter for this tab';
    columns.textContent = '';
    if (enabledInput.checked) {
      setStatus('Open a page that has an adapter. For AliExpress, use the wishlist while you are already signed in.');
    }
    syncExportButton();
    return;
  }

  adapterName.textContent = matched.name;
  columns.textContent = `Columns: ${matched.columns.join(', ')}`;
  if (!enabledInput.checked) {
    syncExportButton();
    return;
  }

  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: Message.PAGE_STATUS });
    if (!response?.ok && response?.message) setStatus(response.message, response.code !== 'ready');
    else setStatus('Ready to export the open page.');
  } catch {
    setStatus('Reload this tab so the extension can attach, then open the popup again.', true);
  }
  syncExportButton();
}

async function saveDelay() {
  const settings = await setSettings({
    delayMinMs: delayMin.value,
    delayMaxMs: delayMax.value,
  });
  delayMin.value = String(settings.delayMinMs);
  delayMax.value = String(settings.delayMaxMs);
}

function applySettings(settings) {
  enabledInput.checked = settings.enabled;
  enabledLabel.textContent = settings.enabled ? 'Enabled' : 'Disabled';
  enabledHelp.textContent = settings.enabled
    ? 'Export may read the open page and download a CSV.'
    : 'Content scripts stay idle and do not read the page.';
  if (!settings.enabled) setStatus('Off. Turn it on when you are on a page you want to export.');
  syncExportButton();
}

function syncExportButton() {
  exportButton.disabled = running || !enabledInput.checked || !matched || tabId == null;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', Boolean(isError));
}

function formatSeconds(ms) {
  const seconds = Math.max(0, Number(ms) || 0) / 1000;
  return `${seconds.toFixed(1)}s`;
}
