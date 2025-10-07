import type {
  CommandAcknowledgment,
  DebuggerCommand,
  PauseDetails,
  SessionState,
} from '../types/index.js';
import type { SessionBreakpointManager } from './session-breakpoint-manager.js';
import type { SessionEventProcessor } from './session-event-processor.js';
import { waitForPause, tryRunIfWaitingForDebugger } from './session-utils.js';
import type Emittery from 'emittery';
import type { SessionEvents } from './session-types.js';

export interface CommandExecutionContext {
  status: SessionState;
  events: Emittery<SessionEvents>;
  sendCommand: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>;
  eventProcessor: SessionEventProcessor;
  breakpointManager: SessionBreakpointManager;
  setCommandIntent: (intent: 'resume' | 'pause' | null) => void;
  getLastPause: () => PauseDetails | undefined;
}

export interface CommandExecutionResult {
  pauseDetails?: PauseDetails;
  resumed: boolean;
}

/**
 * Executes a debugger action (continue, pause, step, etc.) and returns the result.
 * @param command - The debugger command to execute
 * @param context - Execution context with session state and handlers
 * @returns Result containing pause details and resumed status
 */
export async function executeDebuggerAction(
  command: DebuggerCommand,
  context: CommandExecutionContext,
): Promise<CommandExecutionResult> {
  let pauseDetails: PauseDetails | undefined;
  let resumed = false;

  switch (command.action) {
    case 'continue':
      await tryRunIfWaitingForDebugger(context.sendCommand);
      if (context.status.status === 'paused') {
        context.setCommandIntent('resume');
        await context.sendCommand('Debugger.resume');
        resumed = true;
      }
      break;
    case 'pause':
      if (context.status.status === 'paused' && context.eventProcessor.getLastPause()) {
        pauseDetails = context.eventProcessor.getLastPause();
      } else if (
        context.status.status === 'running' ||
        context.status.status === 'awaiting-debugger'
      ) {
        context.setCommandIntent('pause');
        await context.sendCommand('Debugger.pause');
        pauseDetails = await waitForPause(context.events, context.getLastPause(), 'pause');
      }
      break;
    case 'stepInto':
      await context.sendCommand('Debugger.stepInto');
      pauseDetails = await waitForPause(context.events, context.getLastPause(), 'stepInto');
      break;
    case 'stepOver':
      await context.sendCommand('Debugger.stepOver');
      pauseDetails = await waitForPause(context.events, context.getLastPause(), 'stepOver');
      break;
    case 'stepOut':
      await context.sendCommand('Debugger.stepOut');
      pauseDetails = await waitForPause(context.events, context.getLastPause(), 'stepOut');
      break;
    case 'continueToLocation':
      await tryRunIfWaitingForDebugger(context.sendCommand);
      if (context.status.status === 'paused') {
        context.setCommandIntent('resume');
        await context.sendCommand('Debugger.continueToLocation', {
          location: context.breakpointManager.toCdpLocation(command.location),
        });
        resumed = true;
      }
      break;
    default:
      throw new Error(`Unsupported action: ${(command as { action: string }).action}`);
  }

  return { pauseDetails, resumed };
}

/**
 * Builds a command acknowledgment based on the executed command.
 * @param command - The debugger command that was executed
 * @returns Command acknowledgment with sent status and location if applicable
 */
export function buildCommandAcknowledgment(command: DebuggerCommand): CommandAcknowledgment {
  switch (command.action) {
    case 'continue':
      return { command: 'continue', sent: true };
    case 'pause':
      return { command: 'pause', sent: true };
    case 'stepInto':
      return { command: 'stepInto', sent: true };
    case 'stepOver':
      return { command: 'stepOver', sent: true };
    case 'stepOut':
      return { command: 'stepOut', sent: true };
    case 'continueToLocation':
      return {
        command: 'continueToLocation',
        sent: true,
        location: command.location,
      };
  }
}
