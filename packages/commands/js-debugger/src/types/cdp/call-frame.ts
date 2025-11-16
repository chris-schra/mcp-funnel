/**
 * Minimal call frame shape surfaced from CDP pause events.
 */
export interface CallFrame {
  functionName: string;
  scriptId: string;
  url: string;
  lineNumber: number;
  columnNumber: number;
}
