import type { BreakpointSpec } from '../commands/breakpoint-spec';
import type { DebugSessionId } from './debug-session-id';
import type { DebugTargetConfig } from './debug-target-config';

/**
 * Configuration payload used when creating a new debugger session.
 */
export interface DebugSessionConfig {
    /** Optional predefined identifier, otherwise generated server-side. */
    id?: DebugSessionId;
    target: DebugTargetConfig;
    /** Breakpoints to register before the target resumes execution. */
    breakpoints?: BreakpointSpec[];
    /**
     * Resume automatically once configuration completes. Defaults to false to
     * keep the target paused on entry.
     */
    resumeAfterConfigure?: boolean;
}
