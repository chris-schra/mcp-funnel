import type { RemoteObjectSummary } from './remote-object-summary';
import type { StackTrace } from './stack-trace';

/**
 * Rich description of an exception captured by the runtime domain.
 */
export interface ExceptionDetails {
  exceptionId: number;
  text: string;
  lineNumber: number;
  columnNumber: number;
  scriptId?: string;
  url?: string;
  stackTrace?: StackTrace;
  exception?: RemoteObjectSummary;
  executionContextId?: number;
}
