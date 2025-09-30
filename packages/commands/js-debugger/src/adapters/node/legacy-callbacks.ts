import type {
  ConsoleHandler,
  PauseHandler,
  ResumeHandler,
  BreakpointRegistration,
} from '../../types/index.js';

/**
 * Storage for legacy callback handlers.
 *
 * Provides backward compatibility for the older callback-based event API.
 * New code should use the event emitter (`on()`) instead of these callbacks.
 * @deprecated Use event emitter via `adapter.on(event, handler)` instead
 * @public
 * @see file:../node-adapter.ts:541 - Event emitter API
 */
export class LegacyCallbackStorage {
  private consoleHandler?: ConsoleHandler;
  private pauseHandler?: PauseHandler;
  private resumeHandler?: ResumeHandler;
  private breakpointResolvedHandler?: (reg: BreakpointRegistration) => void;

  /**
   * Gets the registered console output callback.
   * @returns Console handler or undefined if not set
   */
  public getConsoleHandler(): ConsoleHandler | undefined {
    return this.consoleHandler;
  }

  /**
   * Gets the registered pause callback.
   * @returns Pause handler or undefined if not set
   */
  public getPauseHandler(): PauseHandler | undefined {
    return this.pauseHandler;
  }

  /**
   * Gets the registered resume callback.
   * @returns Resume handler or undefined if not set
   */
  public getResumeHandler(): ResumeHandler | undefined {
    return this.resumeHandler;
  }

  /**
   * Gets the registered breakpoint resolved callback.
   * @returns Breakpoint resolved handler or undefined if not set
   */
  public getBreakpointResolvedHandler():
    | ((reg: BreakpointRegistration) => void)
    | undefined {
    return this.breakpointResolvedHandler;
  }

  /**
   * Registers a legacy callback for console output events.
   * @param handler - Callback receiving console messages
   * @deprecated Use `on('console', handler)` instead for type-safe event handling
   * @example Migration path
   * ```typescript
   * // Old way:
   * adapter.onConsoleOutput((msg) => console.log(msg));
   * // New way:
   * adapter.on('console', (msg) => console.log(msg));
   * ```
   * @public
   */
  public setConsoleHandler(handler: ConsoleHandler): void {
    this.consoleHandler = handler;
  }

  /**
   * Registers a legacy callback for pause events.
   * @param handler - Callback receiving debug state when paused
   * @deprecated Use `on('paused', handler)` instead for type-safe event handling
   * @public
   */
  public setPauseHandler(handler: PauseHandler): void {
    this.pauseHandler = handler;
  }

  /**
   * Registers a legacy callback for resume events.
   * @param handler - Callback invoked when execution resumes
   * @deprecated Use `on('resumed', handler)` instead for type-safe event handling
   * @public
   */
  public setResumeHandler(handler: ResumeHandler): void {
    this.resumeHandler = handler;
  }

  /**
   * Registers a legacy callback for breakpoint resolution events.
   * @param handler - Callback receiving breakpoint registration details
   * @deprecated Use `on('breakpointResolved', handler)` instead for type-safe event handling
   * @public
   */
  public setBreakpointResolvedHandler(
    handler: (registration: BreakpointRegistration) => void,
  ): void {
    this.breakpointResolvedHandler = handler;
  }
}
