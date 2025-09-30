import { ICDPClient } from '../../types/index.js';
import type {
  NodeCDPConsoleAPICalledEventParams,
  NodeCDPPausedEventParams,
  NodeCDPScriptParsedEventParams,
} from './types.js';

/**
 * Event handlers for CDP initialization
 */
export interface CDPEventHandlers {
  onDebuggerPaused: (params: NodeCDPPausedEventParams) => void;
  onDebuggerResumed: () => void;
  onScriptParsed: (params: NodeCDPScriptParsedEventParams) => void;
  onConsoleMessage: (params: unknown) => void;
  onConsoleAPICalled: (params: NodeCDPConsoleAPICalledEventParams) => void;
}

/**
 * Initialize CDP connection with event handlers
 */
export async function initializeCDP(
  cdpClient: ICDPClient,
  handlers: CDPEventHandlers,
  isPaused: boolean,
  _hasResumedFromInitialPause: boolean,
): Promise<{ shouldSetResumed: boolean }> {
  // Set up event handlers before enabling domains to catch early events
  cdpClient.on('Debugger.paused', (params) => {
    handlers.onDebuggerPaused(params as NodeCDPPausedEventParams);
  });

  cdpClient.on('Debugger.resumed', () => {
    handlers.onDebuggerResumed();
  });

  cdpClient.on('Debugger.scriptParsed', (params) => {
    handlers.onScriptParsed(params as NodeCDPScriptParsedEventParams);
  });

  cdpClient.on('Console.messageAdded', (params) => {
    handlers.onConsoleMessage(params);
  });

  cdpClient.on('Runtime.consoleAPICalled', (params) => {
    handlers.onConsoleAPICalled(params as NodeCDPConsoleAPICalledEventParams);
  });

  // Enable Runtime and Console domains first to capture all output
  await Promise.all([
    cdpClient.send('Runtime.enable'),
    cdpClient.send('Console.enable'),
  ]);

  // Enable Debugger domain
  await cdpClient.send('Debugger.enable');

  // Auto-resume from --inspect-brk if we haven't received a pause event
  let shouldSetResumed = false;
  if (!isPaused) {
    try {
      await cdpClient.send('Runtime.runIfWaitingForDebugger');
      shouldSetResumed = true;
    } catch (_error) {
      // Already running or command not needed
    }
  }

  return { shouldSetResumed };
}
