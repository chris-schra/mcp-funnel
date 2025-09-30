import Emittery from 'emittery';
import { CDPClient, type CDPCallFrame } from '../../cdp/index.js';
import { deriveProjectRootFromRequest } from '../../utils/locations.js';
import { PageManager } from './page-manager.js';
import { BrowserConsoleHandler } from './console-handler.js';
import { BreakpointManager } from './breakpoint-manager.js';
import { BrowserEventHandlers } from './event-handlers.js';
import { ExecutionControl } from './execution-control.js';
import type {
  DebugState,
  DebugSessionEvents,
  DebugRequest,
} from '../../types/index.js';
import type { ScriptInfo } from './handlers/script-handler.js';
import type { PausePromiseInfo } from './connection-lifecycle.js';

/**
 * Internal components created during adapter initialization.
 * @internal
 */
export type AdapterComponents = {
  cdpClient: CDPClient;
  pageManager: PageManager;
  consoleHandler: BrowserConsoleHandler;
  eventHandlers: BrowserEventHandlers;
  breakpointManager: BreakpointManager;
  executionControl: ExecutionControl;
  eventEmitter: Emittery<DebugSessionEvents>;
  projectRoot?: string;
};

/**
 * Creates and wires up all adapter components.
 *
 * Initializes CDP client, managers, handlers, and event infrastructure.
 * All components are interconnected and ready for use after connection.
 * @param host - CDP host address
 * @param port - CDP port number
 * @param request - Optional debug request for configuration
 * @param scripts - Scripts map (shared between components)
 * @param debugState - Debug state object (shared, mutated by handlers)
 * @param pausePromises - Pause promises set (shared, mutated by handlers)
 * @param currentCallFrames - Call frames array (shared, mutated by handlers)
 * @param stateUpdater - Callback to update debug state in parent adapter
 * @returns Initialized adapter components
 * @internal
 */
export function createAdapterComponents(
  host: string,
  port: number,
  request: DebugRequest | undefined,
  scripts: Map<string, ScriptInfo>,
  debugState: DebugState,
  pausePromises: Set<PausePromiseInfo>,
  currentCallFrames: CDPCallFrame[],
  stateUpdater: (state: DebugState) => void,
): AdapterComponents {
  const cdpClient = new CDPClient();
  const pageManager = new PageManager(host, port);
  const eventEmitter = new Emittery<DebugSessionEvents>();
  const consoleHandler = new BrowserConsoleHandler(eventEmitter);
  const projectRoot = deriveProjectRootFromRequest(request);

  const breakpointManager = new BreakpointManager(
    cdpClient,
    scripts,
    projectRoot,
  );

  const eventHandlers = new BrowserEventHandlers(
    cdpClient,
    eventEmitter,
    consoleHandler,
    scripts,
    breakpointManager.getBreakpoints(),
    debugState,
    pausePromises,
    currentCallFrames,
    projectRoot,
    stateUpdater,
  );

  const executionControl = new ExecutionControl(cdpClient, eventHandlers);

  eventHandlers.setupEventHandlers();

  return {
    cdpClient,
    pageManager,
    consoleHandler,
    eventHandlers,
    breakpointManager,
    executionControl,
    eventEmitter,
    projectRoot,
  };
}
