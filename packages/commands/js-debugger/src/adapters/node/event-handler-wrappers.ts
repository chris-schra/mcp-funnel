import {
  ConsoleHandler,
  ConsoleMessage,
  ResumeHandler,
} from '../../types/index.js';
import { parseConsoleMessage } from './console.js';
import type {
  NodeCDPConsoleAPICalledEventParams,
  NodeCDPScriptParsedEventParams,
} from './types.js';

/**
 * Handle debugger resumed event
 */
export function createDebuggerResumedHandler(
  resumeHandler: () => ResumeHandler | null,
  setPaused: (paused: boolean) => void,
  setCurrentCallFrames: (callFrames: never[]) => void,
) {
  return (): void => {
    setPaused(false);
    setCurrentCallFrames([]);

    const handler = resumeHandler();
    if (handler) {
      handler();
    }
  };
}

/**
 * Handle script parsed event
 */
export function createScriptParsedHandler(
  scriptUrlToId: Map<string, string>,
  scriptIdToUrl: Map<string, string>,
) {
  return (params: NodeCDPScriptParsedEventParams): void => {
    scriptUrlToId.set(params.url, params.scriptId);
    scriptIdToUrl.set(params.scriptId, params.url);
  };
}

/**
 * Handle console message event (legacy)
 */
export function createConsoleMessageHandler(
  consoleHandler: () => ConsoleHandler | null,
) {
  return (params: unknown): void => {
    const handler = consoleHandler();
    if (handler) {
      const message: ConsoleMessage = {
        level: 'log',
        timestamp: new Date().toISOString(),
        message: String(params),
        args: [params],
      };
      handler(message);
    }
  };
}

/**
 * Handle console API called event
 */
export function createConsoleAPICalledHandler(
  consoleHandler: () => ConsoleHandler | null,
) {
  return (params: NodeCDPConsoleAPICalledEventParams): void => {
    const handler = consoleHandler();
    if (!handler) {
      return;
    }

    const consoleMessage = parseConsoleMessage(params);
    handler(consoleMessage);
  };
}
