/**
 * Standard Result type for operations that can fail.
 *
 * Provides type-safe error handling with discriminated unions.
 *
 * @typeParam T - The success value type
 * @typeParam E - The error type (defaults to Error)
 *
 * @example
 * ```typescript
 * function divide(a: number, b: number): Result<number, string> {
 *   if (b === 0) {
 *     return { ok: false, error: 'Division by zero' };
 *   }
 *   return { ok: true, value: a / b };
 * }
 *
 * const result = divide(10, 2);
 * if (result.ok) {
 *   console.log(result.value); // Type-safe: value is number
 * } else {
 *   console.error(result.error); // Type-safe: error is string
 * }
 * ```
 */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/**
 * Creates a successful Result.
 *
 * @typeParam T - The success value type
 * @param value - The success value
 * @returns A successful Result containing the value
 */
export const ok = <T>(value: T): Result<T, never> => ({
  ok: true,
  value,
});

/**
 * Creates a failed Result.
 *
 * @typeParam E - The error type
 * @param error - The error value
 * @returns A failed Result containing the error
 */
export const err = <E>(error: E): Result<never, E> => ({
  ok: false,
  error,
});
