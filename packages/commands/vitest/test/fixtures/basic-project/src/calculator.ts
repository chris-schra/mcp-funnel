/**
 * Simple calculator module for testing imports
 */

/**
 *
 * @param a
 * @param b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 *
 * @param a
 * @param b
 */
export function subtract(a: number, b: number): number {
  return a - b;
}

/**
 *
 * @param a
 * @param b
 */
export function multiply(a: number, b: number): number {
  return a * b;
}

/**
 *
 * @param a
 * @param b
 */
export function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error('Division by zero');
  }
  return a / b;
}
