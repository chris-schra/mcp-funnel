/* eslint-env node */

function computeValue(input) {
  const doubled = input * 2;
  const payload = { doubled, nested: { input } };
  return payload;
}

function triggerPause() {
  const localState = computeValue(21);
  debugger; // Execution should pause here
  console.log('Breakpoint reached', localState.doubled);
  return localState;
}

triggerPause();

setTimeout(() => {
  console.log('Exiting after debugger resume');
  process.exit(0);
}, 200);
