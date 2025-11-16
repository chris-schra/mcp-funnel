export interface SummaryStats {
  total: number;
  passed: number;
  failed: Record<
    string,
    Array<{
      testName: string;
      /**
       * Error stack traces as strings (file:line location included in stack).
       * Simplified from structured error objects for token efficiency in AI responses.
       */
      errors?: string[];
    }>
  >;
  skipped: number;
  duration: number;
}
