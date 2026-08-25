/**
 * Wraps `fn` so that repeated calls sharing the same key (per `keyFn`) collapse into a
 * single call after `delayMs` of quiet, using the arguments from the last call in the
 * burst. Calls with different keys run independently. Use for per-document debouncing
 * (e.g. re-checking diagnostics on every keystroke) where a global debounce would let
 * editing one document reset the timer for an unrelated one.
 */
export function debouncePerKey<Args extends unknown[]>(
  fn: (...args: Args) => void,
  delayMs: number,
  keyFn: (...args: Args) => string
): (...args: Args) => void {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  return (...args: Args) => {
    const key = keyFn(...args);
    const existing = timers.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    timers.set(
      key,
      setTimeout(() => {
        timers.delete(key);
        fn(...args);
      }, delayMs)
    );
  };
}
