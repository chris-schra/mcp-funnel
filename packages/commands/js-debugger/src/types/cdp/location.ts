/**
 * Source code location using CDP zero-based coordinates.
 */
export interface Location {
  scriptId: string;
  lineNumber: number;
  columnNumber?: number;
}
