/**
 * Uniform integer delay in milliseconds, inclusive of both ends.
 *
 * Defaults live in core/settings.js (800–2500). The popup writes
 * delayMinMs / delayMaxMs over those defaults. Draw a new value before
 * every scroll or page request; do not reuse one delay for the whole run.
 */
export function randomDelayMs(minMs, maxMs, random = Math.random) {
  const min = Math.ceil(Number(minMs));
  const max = Math.floor(Number(maxMs));
  if (!Number.isFinite(min) || !Number.isFinite(max)) {
    throw new Error('Delay bounds must be finite numbers');
  }
  if (max <= min) return Math.max(0, min);
  return min + Math.floor(random() * (max - min + 1));
}

/** Resolves early when `signal` aborts so the off switch does not wait out the delay. */
export function sleep(ms, signal) {
  const duration = Math.max(0, Number(ms) || 0);
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(finish, duration);
    const onAbort = () => finish();
    function finish() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
