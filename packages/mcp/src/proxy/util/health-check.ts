import type { ChildProcess } from 'child_process';
import { prefixedLog } from '../logging.js';

/**
 * Configuration for health check manager.
 * @public
 */
export interface HealthCheckConfig {
  /** Server identifier for logging */
  serverName: string;
  /** Whether health checks are enabled */
  enabled: boolean;
  /** Interval between health checks in milliseconds */
  intervalMs: number;
  /** Callback invoked when health check fails */
  onHealthCheckFailed: (error: Error) => void;
}

/**
 * Manages periodic health checks for a transport process.
 * Performs basic process liveness checks at configured intervals.
 * Extracted from transport implementation to reduce file size and improve testability.
 * SEAM: Additional health checks can be implemented in performHealthCheck (ping messages,
 * stream validation, protocol-specific checks).
 * @public
 * @see file:../transports/reconnectable-transport.ts:87 - Usage in transport
 */
export class HealthCheckManager {
  private healthCheckInterval?: NodeJS.Timeout;

  public constructor(private config: HealthCheckConfig) {}

  /**
   * Starts periodic health checks on the provided process.
   * Only starts if health checks are enabled in config. Health checks run at the
   * configured interval and invoke the failure callback on error.
   * @param {() => ChildProcess | undefined} process - Function returning the current child process (or undefined if not running)
   * @public
   */
  public start(process: () => ChildProcess | undefined): void {
    if (!this.config.enabled) {
      return;
    }

    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck(process).catch((error) => {
        const errorMsg = prefixedLog(
          this.config.serverName,
          `Health check failed: ${error}`,
        );
        console.error(errorMsg);
        this.config.onHealthCheckFailed(error);
      });
    }, this.config.intervalMs);
  }

  /**
   * Stops periodic health checks and clears the interval.
   * @public
   */
  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Performs a single health check on the process.
   * Currently checks if process exists and is not killed.
   * SEAM: Can be extended with ping messages, stream validation, or protocol-specific checks.
   * @param {() => ChildProcess | undefined} getProcess - Function returning the current child process
   * @throws {Error} When process is not running or killed
   * @internal
   */
  private async performHealthCheck(
    getProcess: () => ChildProcess | undefined,
  ): Promise<void> {
    const process = getProcess();

    // Simple health check - ensure the process is still alive
    if (!process || process.killed) {
      throw new Error('Process is not running');
    }

    // SEAM: Additional health checks can be implemented here:
    // - Sending a ping message if the server supports it
    // - Checking if stdin/stdout/stderr streams are still writable/readable
    // - Custom protocol-specific health checks
  }
}
