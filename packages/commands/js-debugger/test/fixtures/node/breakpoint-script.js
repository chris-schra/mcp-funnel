/* eslint-env node */

/**
 * Computes a doubled value and wraps it in a nested object structure.
 * @param {number} input - The numeric value to double and wrap
 * @returns {object} Object containing doubled value and nested input
 * @example Basic computation
 * ```js
 * const result = computeValue(21);
 * // Returns: { doubled: 42, nested: { input: 21 } }
 * ```
 */
function computeValue(input) {
  const doubled = input * 2;
  const payload = { doubled, nested: { input } };
  return payload;
}

/**
 * Triggers a debugger breakpoint and returns computed state.
 * @returns {object} The local state object from computeValue
 * @example Debugging with breakpoint
 * ```js
 * const state = triggerPause();
 * // Execution pauses at debugger statement
 * // Returns: { doubled: 42, nested: { input: 21 } }
 * ```
 */
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
