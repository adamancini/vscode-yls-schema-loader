/**
 * Poll `predicate` until it returns true, or throw once `timeoutMs` elapses.
 * Use for eventual-consistency waits (e.g. diagnostics appearing after a
 * document opens) instead of a fixed sleep, which is either too short under
 * load or wastes time when the condition is already met.
 */
export async function waitFor(predicate: () => boolean, timeoutMs = 3000, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  if (!predicate()) {
    throw new Error(`waitFor: condition was not met within ${timeoutMs}ms`);
  }
}

/**
 * Poll `predicate` for `durationMs`, failing fast if it ever becomes true.
 * Use to confirm something does NOT happen (e.g. no diagnostic is published)
 * — a plain sleep-then-check can't distinguish "never happened" from
 * "hasn't happened yet", but this fails as soon as it's disproven.
 */
export async function staysFalseFor(predicate: () => boolean, durationMs = 500, intervalMs = 25): Promise<void> {
  const deadline = Date.now() + durationMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      throw new Error('staysFalseFor: condition became true before the wait window elapsed');
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
