/**
 * Reference to a stack trace, potentially originating from another debugger.
 */
export interface StackTraceId {
  id: string;
  debuggerId?: string;
}
