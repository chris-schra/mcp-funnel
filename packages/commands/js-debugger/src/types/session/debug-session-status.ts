/**
 * High-level lifecycle states for a debugger session.
 */
export type DebugSessionStatus =
    | 'starting'
    | 'awaiting-debugger'
    | 'running'
    | 'paused'
    | 'terminating'
    | 'terminated'
    | 'error';
