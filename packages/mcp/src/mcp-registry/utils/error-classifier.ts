/**
 * Classifies errors into specific categories for better logging and debugging.
 *
 * @param error - The error to classify
 * @param operation - The operation that failed (e.g., 'search', 'server fetch')
 * @param context - Additional context for the error (e.g., identifier, keywords)
 * @returns The error type for logging purposes
 */
export function classifyAndLogError(
  error: unknown,
  operation: string,
  context?: string,
): 'network' | 'parsing' | 'unexpected' {
  const contextStr = context ? ` for ${context}` : '';

  // Network errors: TypeError is commonly thrown for fetch failures
  if (error instanceof TypeError) {
    console.error(
      `[MCPRegistryClient] Network error during ${operation}${contextStr}:`,
      error.message,
    );
    return 'network';
  }

  // JSON parsing errors
  if (error instanceof SyntaxError) {
    console.error(
      `[MCPRegistryClient] JSON parsing error during ${operation}${contextStr}:`,
      error.message,
    );
    return 'parsing';
  }

  // All other errors
  console.error(
    `[MCPRegistryClient] Unexpected error during ${operation}${contextStr}:`,
    error,
  );
  return 'unexpected';
}
