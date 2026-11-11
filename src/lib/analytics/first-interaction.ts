/**
 * Runs `callback` on the first tap, key, scroll or touch, or after `timeoutMs`
 * if there is none, so heavy third-party scripts never compete with the first
 * paint. Returns a cleanup. Browser only.
 */
export function afterFirstInteraction(callback: () => void, timeoutMs = 4000): () => void {
  const events = ["pointerdown", "keydown", "scroll", "touchstart"] as const;
  let done = false;
  const cleanup = () => {
    for (const name of events) window.removeEventListener(name, run);
    window.clearTimeout(timer);
  };
  function run() {
    if (done) return;
    done = true;
    cleanup();
    callback();
  }
  for (const name of events) window.addEventListener(name, run, { passive: true, once: true });
  const timer = window.setTimeout(run, timeoutMs);
  return cleanup;
}
