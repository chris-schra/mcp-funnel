/**
 * Session lifecycle state (separate from debug execution state)
 */
export type SessionLifecycleState =
  | 'initializing'
  | 'connected'
  | 'active'
  | 'inactive'
  | 'terminating'
  | 'terminated';
