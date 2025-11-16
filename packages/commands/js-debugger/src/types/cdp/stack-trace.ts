import type { CallFrame } from './call-frame';
import type { StackTraceId } from './stack-trace-id';

/**
 * Stack trace snapshot optionally linked to its async parent chain.
 */
export interface StackTrace {
  description?: string;
  callFrames: CallFrame[];
  parent?: StackTrace;
  parentId?: StackTraceId;
}
