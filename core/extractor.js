import { sleep as defaultSleep } from './delay.js';
import { normalizeRow } from './csv.js';

/**
 * Generic extraction loop.
 *
 * Adapters read the current DOM and ask for the next scroll or page.
 * This loop owns dedupe, the stale-page stop, the step cap, and the
 * random delay between those requests. It does not know about a site.
 */
export async function extractAll({
  adapter,
  document,
  getDelayMs,
  sleep = defaultSleep,
  onProgress,
  signal,
  maxStaleRounds = adapter?.limits?.maxStaleRounds ?? 3,
  maxSteps = adapter?.limits?.maxSteps ?? 400,
}) {
  if (!adapter || !document) throw new Error('extractAll needs an adapter and a document');
  if (typeof getDelayMs !== 'function') throw new Error('extractAll needs getDelayMs');

  const seen = new Map();
  let staleRounds = 0;
  let reason = 'max-steps';
  let steps = 0;

  const collect = () => {
    let added = 0;
    const extracted = adapter.extractVisible(document) || [];
    for (const row of extracted) {
      const normalized = normalizeRow(adapter.columns, row);
      const key = adapter.rowKey(normalized);
      if (!key || seen.has(key)) continue;
      seen.set(key, normalized);
      added += 1;
    }
    return added;
  };

  const report = (payload) => {
    if (!onProgress) return;
    try {
      onProgress(payload);
    } catch {
      // The popup may have closed. Keep reading the page.
    }
  };

  for (let step = 0; step < maxSteps; step += 1) {
    steps = step + 1;
    if (signal?.aborted) {
      reason = 'aborted';
      break;
    }

    const added = collect();
    const plan = adapter.planAdvance(document, {
      step,
      added,
      staleRounds,
      rowCount: seen.size,
    });
    const action = plan?.action || 'done';
    report({ phase: 'extract', step, added, count: seen.size, staleRounds, action });

    if (action === 'done') {
      reason = 'complete';
      break;
    }

    staleRounds = added === 0 ? staleRounds + 1 : 0;
    if (staleRounds >= maxStaleRounds) {
      reason = 'complete';
      break;
    }

    const delayMs = Math.max(0, Number(await getDelayMs()) || 0);
    report({ phase: 'wait', step, delayMs, count: seen.size, staleRounds, action });
    await sleep(delayMs, signal);

    if (signal?.aborted) {
      reason = 'aborted';
      break;
    }

    await adapter.performAdvance(document, plan);
  }

  if (reason !== 'aborted') collect();

  return {
    status: reason,
    rows: [...seen.values()],
    steps,
  };
}

/** An off switch aborts the run and must not write a partial file. */
export function shouldDownload(result) {
  return result?.status === 'complete' || result?.status === 'max-steps';
}
