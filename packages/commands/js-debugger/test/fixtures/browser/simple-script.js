/* eslint-env browser */

window.__debugData = { counter: 0 };

/**
 * Triggers the browser debugger statement and increments the debug counter.
 * @returns The updated counter value after incrementing
 * @example
 * ```javascript
 * const count = triggerDebugger();
 * // Returns: 1 (or higher depending on call count)
 * ```
 */
function triggerDebugger() {
  window.__debugData.counter += 1;
  debugger; // Pause execution so tests can inspect state
  console.log('Browser fixture log', window.__debugData.counter);
  return window.__debugData.counter;
}

window.addEventListener('load', () => {
  setTimeout(triggerDebugger, 100);
});
