/**
 * Setup process exit handlers for proper cleanup
 */
export function setupProcessExitHandlers(
  shutdownCallback: () => Promise<void>,
  isShuttingDownRef: { current: boolean },
): void {
  const cleanup = async () => {
    if (!isShuttingDownRef.current) {
      isShuttingDownRef.current = true;
      await shutdownCallback();
    }
  };

  // Handle various process exit scenarios
  process.on('exit', cleanup);
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
  process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    cleanup();
  });
  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    cleanup();
  });
}
