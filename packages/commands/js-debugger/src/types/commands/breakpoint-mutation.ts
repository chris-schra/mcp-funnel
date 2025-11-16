import type { BreakpointSpec } from './breakpoint-spec';

/**
 * Describes breakpoint adjustments applied atomically alongside a debugger command.
 */
export interface BreakpointMutation {
  /**
   * Breakpoints to register before the command executes. The tool should
   * resolve and return their canonical identifiers in the command response.
   */
  set?: BreakpointSpec[];

  /**
   * Existing breakpoint identifiers to remove before the command executes.
   * Identifiers correspond to those previously returned from the tool.
   */
  remove?: string[];
}
