import type { OutputBufferSnapshot } from '../output';
import type { DebugSessionDescriptor } from './debug-session-descriptor';

/**
 * Aggregated view of session metadata and buffered output.
 */
export interface DebugSessionSnapshot {
  session: DebugSessionDescriptor;
  output: OutputBufferSnapshot;
}
