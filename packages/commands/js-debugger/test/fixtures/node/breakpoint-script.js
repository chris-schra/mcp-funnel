/* eslint-env node */

/**
 * Computes a payload object by doubling the input value.
 * @param {number} input - The numeric value to be doubled and stored in the payload
 * @returns The payload object containing the doubled value and nested input
 * @example
 * ```javascript
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
 * Triggers a debugger pause and computes local state for inspection.
 * @returns The local state object with computed values
 * @example
 * ```javascript
 * const state = triggerPause();
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
