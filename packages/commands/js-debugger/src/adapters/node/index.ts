/**
 * Node.js debugging adapter utilities
 *
 * This module provides utilities for debugging Node.js applications using
 * the Chrome DevTools Protocol (CDP).
 */

export {
  ProcessSpawner,
  type SpawnOptions,
  type SpawnResult,
  type ProcessOutput,
} from './process-spawner.js';

export { CDPConnection } from './cdp-connection.js';
export { ScopeInspector } from './scope-inspector.js';
export {
  SourceMapHandler,
  type SourcePosition,
  type MappingResult,
} from './source-map-handler.js';

export { PauseHandlerManager, type PausePromiseInfo } from './pause-handler.js';

export { EventHandlersManager } from './event-handlers.js';

export { ConnectionManager } from './connection-manager.js';

export { determineCodeOrigin, type CodeOrigin } from './code-origin.js';

export { ExecutionControlManager } from './execution-control-manager.js';
export { BreakpointManager } from './breakpoint-manager.js';
export { InspectionManager } from './inspection-manager.js';
export { LegacyCallbackStorage } from './legacy-callbacks.js';
export { SessionLifecycleManager } from './session-lifecycle-manager.js';
