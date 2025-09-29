import type { ChildProcess } from 'child_process';
import { prefixedLog } from '../logging.js';

/**
 * Configuration for health check manager
 */
export interface HealthCheckConfig {
  serverName: string;
  enabled: boolean;
  intervalMs: number;
  onHealthCheckFailed: (error: Error) => void;
}

/**
 * Manages periodic health checks for a transport process
 * Extracted class to reduce transport file size
 */
export class HealthCheckManager {
  private healthCheckInterval?: NodeJS.Timeout;

  public constructor(private config: HealthCheckConfig) {}

  /**
   * Start periodic health checks
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
   * Stop periodic health checks
   */
  public stop(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
    }
  }

  /**
   * Perform a single health check
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
