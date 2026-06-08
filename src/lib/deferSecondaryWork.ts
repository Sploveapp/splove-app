/** Exécute du travail non critique après le premier paint / route principale. */
export function deferSecondaryWork(fn: () => void, delayMs = 1200): () => void {
  let cancelled = false;
  const run = () => {
    if (!cancelled) fn();
  };

  if (typeof requestIdleCallback === "function") {
    const id = requestIdleCallback(run, { timeout: delayMs });
    return () => {
      cancelled = true;
      cancelIdleCallback(id);
    };
  }

  const timerId = window.setTimeout(run, delayMs);
  return () => {
    cancelled = true;
    window.clearTimeout(timerId);
  };
}
