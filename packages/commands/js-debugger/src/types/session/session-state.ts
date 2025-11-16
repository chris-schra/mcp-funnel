import type { PauseDetails } from '../commands/pause-details';
import type { ValueOf } from 'type-fest';
export type SessionStateStatus = ValueOf<SessionState, 'status'>;

/**
 * Rich session state that explicitly models the async nature of CDP.
 *
 * This discriminated union makes it clear when we know the actual state
 * versus when we've sent a command but are waiting for CDP to acknowledge.
 *
 * Key states:
 * - `starting`: Initial state before process spawn
 * - `awaiting-debugger`: Process spawned, waiting for debugger to attach
 * - `paused`: Execution is paused at a breakpoint/exception/step
 * - `running`: Execution is actively running
 * - `transitioning`: Command sent to CDP, waiting for state change confirmation
 * - `terminated`: Process has exited
 *
 * The `transitioning` state explicitly captures the race condition window where:
 * - We've sent a CDP command (e.g., `Debugger.resume`)
 * - CDP will eventually emit an event (e.g., `Debugger.resumed` or `Debugger.paused`)
 * - But we don't yet know the outcome
 *
 * This prevents bugs where code assumes immediate state changes when the
 * actual change is asynchronous and may even fail or produce unexpected results.
 */
export type SessionState =
  | { status: 'starting' }
  | { status: 'awaiting-debugger' }
  | { status: 'paused'; pause: PauseDetails }
  | { status: 'running' }
  | {
      status: 'transitioning';
      from: 'paused' | 'running';
      intent: 'resume' | 'pause';
    }
  | {
      status: 'terminated';
      exitCode: number | null;
      signal: NodeJS.Signals | null;
    };
