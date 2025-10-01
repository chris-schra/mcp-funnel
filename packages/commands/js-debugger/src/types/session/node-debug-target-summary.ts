import type { DebugTargetType } from './debug-target-type';

/**
 * Sanitised view of a Node target shared with clients.
 */
export interface NodeDebugTargetSummary {
  type: Extract<DebugTargetType, 'node'>;
  entry: string;
  entryArguments?: string[];
  cwd?: string;
  useTsx?: boolean;
  runtimeArguments?: string[];
}
