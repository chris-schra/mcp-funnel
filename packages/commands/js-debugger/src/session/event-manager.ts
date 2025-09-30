/**
 * Event management utilities for debug sessions
 * Handles adapter event handler setup and propagation
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
 * Context for event management operations
 */
export interface EventContext {
  adapter: IDebugAdapter;
  captureConsole: boolean;
  breakpoints: Map<string, BreakpointInfo>;
  onConsoleMessage: (message: ConsoleMessage) => void;
  onStateUpdate: (state: DebugState) => void;
  onLifecycleStateChange: (state: SessionLifecycleState) => void;
  onPaused: (state: DebugState) => void;
  onResumed: () => void;
  onBreakpointResolved: (registration: BreakpointRegistration) => void;
}

/**
 * Event management operations for debug sessions
 */
export class EventManager {
  /**
   * Set up event handlers for the adapter
   * Supports both new event-driven API and legacy callback API
   */
  static setupAdapterEventHandlers(context: EventContext): void {
    // Try event-driven API first, fall back to legacy if not available
    if (typeof context.adapter.on === 'function') {
      EventManager.setupEventDrivenHandlers(context);
    } else {
      EventManager.setupLegacyHandlers(context);
    }
  }

  /**
   * Set up handlers for new event-driven API
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
   * Set up handlers for legacy callback API
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
   * Handle paused event
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
   * Handle resumed event
   */
  private static handleResumed(context: EventContext): void {
    const runningState: DebugState = { status: 'running' };
    context.onStateUpdate(runningState);
    context.onLifecycleStateChange('active');
    context.onResumed();
  }

  /**
   * Handle breakpoint resolved event
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
