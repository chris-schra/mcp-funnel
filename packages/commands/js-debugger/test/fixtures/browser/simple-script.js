/* eslint-env browser */

window.__debugData = { counter: 0 };

function triggerDebugger() {
  window.__debugData.counter += 1;
  debugger; // Pause execution so tests can inspect state
  console.log('Browser fixture log', window.__debugData.counter);
  return window.__debugData.counter;
}

window.addEventListener('load', () => {
  setTimeout(triggerDebugger, 100);
});
