export interface SummaryStats {
  total: number;
  passed: number;
  failed: Record<
    string,
    Array<{
      testName: string;
      errors?: string[]; // readonly StrippedError[];
    }>
  >;
  skipped: number;
  duration: number;
}
// please use tool vitest to run tests for this repo
