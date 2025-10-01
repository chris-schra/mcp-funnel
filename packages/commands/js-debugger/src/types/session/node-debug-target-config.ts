import type { DebugTargetType } from './debug-target-type';

/**
 * Configuration required to launch and attach to a Node.js process.
 */
export interface NodeDebugTargetConfig {
  type: Extract<DebugTargetType, 'node'>;
  /** Absolute or workspace-relative entry file. */
  entry: string;
  /** Arguments passed to the entry file. */
  entryArguments?: string[];
  /** Working directory for the spawned process. */
  cwd?: string;
  /** Environment variables applied to the process. */
  env?: Record<string, string>;
  /**
   * When true, node is started with `--import tsx/register` to run TypeScript sources
   * without an explicit build step.
   */
  useTsx?: boolean;
  /** Additional flags passed to the Node runtime. */
  runtimeArguments?: string[];
  /** Optional explicit Node.js executable path. */
  nodePath?: string;
  /** Preferred host for the inspector to bind to. */
  inspectHost?: string;
}
