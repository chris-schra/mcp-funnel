/**
 * Process exit handler context
 */
export interface ProcessHandlerContext {
  shutdown: () => Promise<void>;
}

/**
 * Process handler manager for graceful shutdown
 */
export class ProcessHandlerManager {
  private processHandlersRegistered = false;
  private isShuttingDown = false;
  private readonly context: ProcessHandlerContext;

  // Bound handler methods
  private readonly handleProcessCleanup = async () => {
    if (this.processHandlersRegistered) {
      this.removeHandlers();
    }

    if (!this.isShuttingDown) {
      await this.context.shutdown();
    }
  };

  private readonly handleProcessExit = () => {
    void this.handleProcessCleanup();
  };

  private readonly handleProcessSignal = () => {
    void this.handleProcessCleanup();
  };

  private readonly handleProcessUncaughtException = (err: unknown) => {
    console.error('Uncaught Exception:', err);
    void this.handleProcessCleanup();
  };

  private readonly handleProcessUnhandledRejection = (
    reason: unknown,
    promise: Promise<unknown>,
  ) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    void this.handleProcessCleanup();
  };

  public constructor(context: ProcessHandlerContext) {
    this.context = context;
  }

  /**
   * Setup process exit handlers for proper cleanup
   */
  public setupHandlers(): void {
    if (this.processHandlersRegistered) {
      return;
    }

    process.on('exit', this.handleProcessExit);
    process.on('SIGINT', this.handleProcessSignal);
    process.on('SIGTERM', this.handleProcessSignal);
    process.on('uncaughtException', this.handleProcessUncaughtException);
    process.on('unhandledRejection', this.handleProcessUnhandledRejection);
    this.processHandlersRegistered = true;
  }

  /**
   * Remove process exit handlers
   */
  public removeHandlers(): void {
    if (!this.processHandlersRegistered) {
      return;
    }

    process.off('exit', this.handleProcessExit);
    process.off('SIGINT', this.handleProcessSignal);
    process.off('SIGTERM', this.handleProcessSignal);
    process.off('uncaughtException', this.handleProcessUncaughtException);
    process.off('unhandledRejection', this.handleProcessUnhandledRejection);
    this.processHandlersRegistered = false;
  }

  /**
   * Check if process handlers are registered
   * @returns True if process handlers are registered
   */
  public isRegistered(): boolean {
    return this.processHandlersRegistered;
  }

  /**
   * Mark shutdown as in progress
   */
  public markShuttingDown(): void {
    this.isShuttingDown = true;
  }

  /**
   * Check if shutdown is in progress
   * @returns True if shutdown is in progress
   */
  public isShutdownInProgress(): boolean {
    return this.isShuttingDown;
  }
}
