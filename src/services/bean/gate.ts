/**
 * Bean submit throttle: serializes the pre-submit wait so submits are spaced by
 * BEAN_MIN_INTERVAL_MS (avoids burst submits). Once a caller has submitted, its
 * task polls independently, so multiple tasks can be in flight concurrently
 * (Bean caps concurrency at 10 per user; the ingest loop bounds this further).
 */

let chain: Promise<void> = Promise.resolve();
let lastSubmitAt = 0;

function minIntervalMs(): number {
  const n = Number(process.env.BEAN_MIN_INTERVAL_MS ?? 2000);
  return Number.isFinite(n) && n >= 0 ? n : 2000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Wait for this caller's turn to submit, respecting the min interval between submits. */
export async function acquireSubmitSlot(_label?: string): Promise<void> {
  const run = async (): Promise<void> => {
    const wait = minIntervalMs() - (Date.now() - lastSubmitAt);
    if (wait > 0) await sleep(wait);
    lastSubmitAt = Date.now();
  };
  const next = chain.then(run);
  chain = next.then(() => undefined).catch(() => undefined);
  await next;
}

/** Kept for API compatibility — the submit slot is released implicitly after acquire. */
export function releaseSubmitSlot(): void {
  /* no-op: submits are only serialized during the pre-submit wait */
}

export async function withBeanGate<T>(label: string, fn: () => Promise<T>): Promise<T> {
  await acquireSubmitSlot(label);
  return fn();
}
