import type { BreakpointLocation } from './breakpoint-location';

/**
 * Acknowledgment that a debugger command was sent to CDP.
 *
 * This type explicitly represents what we know after sending a command:
 * - The command was accepted by CDP (`sent: true`)
 * - For location-specific commands, where we intended to go
 *
 * **IMPORTANT**: This does NOT mean the command has completed or that the
 * intended state change has occurred. CDP is asynchronous - the actual state
 * change will be reflected in a subsequent event (e.g., `Debugger.paused`,
 * `Debugger.resumed`).
 *
 * Use this to track command intent, not actual state. The session's `SessionState`
 * reflects the known truth, while this reflects our pending intention.
 *
 * Example flow:
 * 1. Call `runCommand({ action: 'continue' })`
 * 2. Get back `{ commandAck: { command: 'continue', sent: true } }`
 * 3. Session state may be `{ status: 'transitioning', intent: 'resume' }`
 * 4. Later, CDP emits `Debugger.resumed` event
 * 5. Session state becomes `{ status: 'running' }`
 */
export type CommandAcknowledgment =
  | { command: 'continue'; sent: true }
  | { command: 'pause'; sent: true }
  | { command: 'stepOver'; sent: true }
  | { command: 'stepInto'; sent: true }
  | { command: 'stepOut'; sent: true }
  | {
      command: 'continueToLocation';
      sent: true;
      location: BreakpointLocation;
    };
