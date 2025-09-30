/**
 * Event management utilities for debug sessions.
 *
 * Provides centralized event handler setup and propagation for debug adapters,
 * supporting both modern event-driven API (`adapter.on()`) and legacy callback-based
 * API (`adapter.onPaused()`, etc.). Handles console output, pause/resume events,
 * and breakpoint resolution.
 * @internal
 * @see file:../enhanced-debug-session.ts:473 - Primary usage in session setup
 */

import type {
  IDebugAdapter,
  DebugState,
  BreakpointInfo,
  BreakpointRegistration,
  ConsoleMessage,
  SessionLifecycleState,
} from '../types/index.js';

/**
 * Context object containing adapter, state, and callbacks for event management.
 *
 * Encapsulates all dependencies needed by EventManager to set up event handlers
 * and propagate events to session-level callbacks. The callbacks allow the session
 * to respond to adapter events by updating internal state and emitting session events.
 * @public
 * @see file:./event-manager.ts:39 - Used by setupAdapterEventHandlers
 */
export interface EventContext {
  /** Debug adapter instance to attach event handlers to */
  adapter: IDebugAdapter;

  /** Whether to capture console output from the debugged process */
  captureConsole: boolean;

  /** Map of breakpoint IDs to their current state */
  breakpoints: Map<string, BreakpointInfo>;

  /** Callback invoked when console output is received */
  onConsoleMessage: (message: ConsoleMessage) => void;

  /** Callback invoked to update the current debug state */
  onStateUpdate: (state: DebugState) => void;

  /** Callback invoked when session lifecycle state changes */
  onLifecycleStateChange: (state: SessionLifecycleState) => void;

  /** Callback invoked when execution pauses (breakpoint, step, etc.) */
  onPaused: (state: DebugState) => void;

  /** Callback invoked when execution resumes */
  onResumed: () => void;

  /** Callback invoked when a breakpoint is resolved by the debugger */
  onBreakpointResolved: (registration: BreakpointRegistration) => void;
}

/**
 * Event management operations for debug sessions.
 *
 * Utility class providing static methods to set up event handlers for debug adapters.
 * Automatically detects whether the adapter supports the modern event-driven API or
 * requires legacy callback registration, ensuring compatibility across adapter implementations.
 * @example
 * ```typescript
 * EventManager.setupAdapterEventHandlers({
 *   adapter: myAdapter,
 *   captureConsole: true,
 *   breakpoints: new Map(),
 *   onConsoleMessage: (msg) => console.log(msg),
 *   onStateUpdate: (state) => updateUI(state),
 *   onLifecycleStateChange: (state) => trackLifecycle(state),
 *   onPaused: (state) => handlePause(state),
 *   onResumed: () => handleResume(),
 *   onBreakpointResolved: (bp) => handleBreakpoint(bp),
 * });
 * ```
 * @internal
 * @see file:../types/adapter.ts:11 - IDebugAdapter interface definition
 */
export class EventManager {
  /**
   * Sets up event handlers for the debug adapter.
   *
   * Automatically detects adapter capabilities and configures appropriate event handlers.
   * If the adapter supports the modern event-driven API (`adapter.on()`), uses that.
   * Otherwise falls back to legacy callback methods (`adapter.onPaused()`, etc.).
   *
   * All events are propagated through the provided context callbacks, allowing the session
   * to update state and emit its own events in response to adapter events.
   * @param context - Event context containing adapter and callbacks
   * @example
   * ```typescript
   * // Called during session initialization
   * EventManager.setupAdapterEventHandlers({
   *   adapter: this.adapter,
   *   captureConsole: this.request.captureConsole !== false,
   *   breakpoints: this._breakpoints,
   *   onConsoleMessage: (msg) => this.addConsoleMessage(msg),
   *   onStateUpdate: (state) => this.updateState(state),
   *   onLifecycleStateChange: (state) => this._lifecycleState = state,
   *   onPaused: (state) => this.emit('paused', state),
   *   onResumed: () => this.emit('resumed'),
   *   onBreakpointResolved: (bp) => this.emit('breakpointResolved', bp),
   * });
   * ```
   * @public
   * @see file:../enhanced-debug-session.ts:473-498 - Primary usage site
   * @see file:./event-manager.ts:52 - Event-driven handler setup
   * @see file:./event-manager.ts:85 - Legacy handler setup
   */
  public static setupAdapterEventHandlers(context: EventContext): void {
    // Try event-driven API first, fall back to legacy if not available
    if (typeof context.adapter.on === 'function') {
      EventManager.setupEventDrivenHandlers(context);
    } else {
      EventManager.setupLegacyHandlers(context);
    }
  }

  /**
   * Sets up handlers using the modern event-driven API.
   *
   * Registers event listeners via `adapter.on()` for console output, pause/resume
   * events, and breakpoint resolution. Each adapter event is forwarded to the
   * appropriate handler method which updates state and invokes context callbacks.
   * @param context - Event context containing adapter and callbacks
   * @internal
   * @see file:../types/adapter.ts:29-36 - IDebugAdapter.on() method signature
   * @see file:./event-manager.ts:116 - handlePaused implementation
   * @see file:./event-manager.ts:138 - handleResumed implementation
   * @see file:./event-manager.ts:150 - handleBreakpointResolved implementation
   */
  private static setupEventDrivenHandlers(context: EventContext): void {
    const { adapter } = context;

    // Console output handler
    if (context.captureConsole) {
      adapter.on!('console', (message: ConsoleMessage) => {
        context.onConsoleMessage(message);
      });
    }

    // Pause handler
    adapter.on!('paused', (state: DebugState) => {
      EventManager.handlePaused(state, context);
    });

    // Resume handler
    adapter.on!('resumed', () => {
      EventManager.handleResumed(context);
    });

    // Breakpoint resolved handler
    adapter.on!(
      'breakpointResolved',
      (registration: BreakpointRegistration) => {
        EventManager.handleBreakpointResolved(registration, context);
      },
    );
  }

  /**
   * Sets up handlers using the legacy callback-based API.
   *
   * Registers callbacks via legacy methods (`adapter.onPaused()`, `adapter.onResumed()`,
   * etc.) for adapters that don't support the modern event-driven interface. Each callback
   * is forwarded to the appropriate handler method which updates state and invokes context
   * callbacks.
   *
   * Uses optional chaining since these methods may not exist on all adapter implementations.
   * @param context - Event context containing adapter and callbacks
   * @internal
   * @see file:./event-manager.ts:116 - handlePaused implementation
   * @see file:./event-manager.ts:138 - handleResumed implementation
   * @see file:./event-manager.ts:150 - handleBreakpointResolved implementation
   */
  private static setupLegacyHandlers(context: EventContext): void {
    const { adapter } = context;

    // Console output handler
    if (context.captureConsole) {
      adapter.onConsoleOutput?.((message: ConsoleMessage) => {
        context.onConsoleMessage(message);
      });
    }

    // Pause handler
    adapter.onPaused?.((state: DebugState) => {
      EventManager.handlePaused(state, context);
    });

    // Resume handler
    adapter.onResumed?.(() => {
      EventManager.handleResumed(context);
    });

    // Breakpoint resolved handler
    adapter.onBreakpointResolved?.((registration: BreakpointRegistration) => {
      EventManager.handleBreakpointResolved(registration, context);
    });
  }

  /**
   * Handles pause events from the debug adapter.
   *
   * When execution pauses (breakpoint hit, step complete, debugger statement, etc.),
   * updates the session state and breakpoint information. If paused on a breakpoint,
   * synchronizes the breakpoint's verification status and resolved locations.
   *
   * Invokes callbacks to update state, set lifecycle to 'active', and notify listeners
   * that execution has paused.
   * @param state - Current debug state including pause reason and location
   * @param context - Event context containing state and callbacks
   * @internal
   * @see file:../types/index.js - DebugState type definition
   */
  private static handlePaused(state: DebugState, context: EventContext): void {
    context.onStateUpdate(state);

    // Update breakpoint info if paused on breakpoint
    if (state.breakpoint) {
      const entry = context.breakpoints.get(state.breakpoint.id);
      if (entry) {
        entry.verified = state.breakpoint.verified;
        if (state.breakpoint.resolvedLocations) {
          entry.resolvedLocations = state.breakpoint.resolvedLocations;
        }
      }
    }

    context.onLifecycleStateChange('active');
    context.onPaused(state);
  }

  /**
   * Handles resume events from the debug adapter.
   *
   * When execution resumes (after continue, step, etc.), creates a running state
   * and invokes callbacks to update state, set lifecycle to 'active', and notify
   * listeners that execution has resumed.
   * @param context - Event context containing state and callbacks
   * @internal
   * @see file:../types/index.js - DebugState type definition
   */
  private static handleResumed(context: EventContext): void {
    const runningState: DebugState = { status: 'running' };
    context.onStateUpdate(runningState);
    context.onLifecycleStateChange('active');
    context.onResumed();
  }

  /**
   * Handles breakpoint resolution events from the debug adapter.
   *
   * When the debugger resolves a breakpoint (verifies it can be set, determines
   * actual code locations), updates the cached breakpoint information with the
   * verification status and resolved locations. The resolved locations may differ
   * from the requested location due to source maps, code optimization, etc.
   *
   * Invokes the callback to notify listeners about the breakpoint resolution.
   * @param registration - Breakpoint registration with verification status
   * @param context - Event context containing breakpoint map and callbacks
   * @internal
   * @see file:../types/index.js - BreakpointRegistration type definition
   */
  private static handleBreakpointResolved(
    registration: BreakpointRegistration,
    context: EventContext,
  ): void {
    const entry = context.breakpoints.get(registration.id);
    if (entry) {
      entry.verified = registration.verified;
      if (registration.resolvedLocations) {
        entry.resolvedLocations = registration.resolvedLocations;
      }
    }
    context.onBreakpointResolved(registration);
  }
}
