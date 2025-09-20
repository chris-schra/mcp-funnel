/**
 * Shared Transport Utilities
 *
 * Common utilities for transport implementations to eliminate DRY violations.
 * These utilities are used by both WebSocket and SSE transports.
 */

import { v4 as uuidv4 } from 'uuid';
import { logEvent } from '../../logger.js';

/**
 * Reconnection configuration interface
 */
export interface ReconnectionConfig {
  /** Maximum reconnection attempts */
  maxAttempts: number;
  /** Initial delay in ms */
  initialDelayMs: number;
  /** Backoff multiplier */
  backoffMultiplier: number;
  /** Maximum delay cap in ms */
  maxDelayMs: number;
}

/**
 * Auth provider interface for transports
 */
export interface AuthProvider {
  /** Get current auth headers */
  getAuthHeaders(): Promise<Record<string, string>>;
  /** Refresh auth token (optional, for 401 recovery) */
  refreshToken?(): Promise<void>;
}

/**
 * Reconnection manager with exponential backoff
 */
export class ReconnectionManager {
  private attempts = 0;
  private timer: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(
    private readonly config: ReconnectionConfig,
    private readonly reconnectFn: () => void,
    private readonly onMaxAttemptsReached: () => void,
    private readonly logPrefix: string,
  ) {}

  /**
   * Reset reconnection attempts counter
   */
  public reset(): void {
    this.attempts = 0;
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  public scheduleReconnection(): void {
    if (this.isClosed || this.attempts >= this.config.maxAttempts) {
      if (this.attempts >= this.config.maxAttempts) {
        logEvent('error', `${this.logPrefix}:max-reconnection-attempts`, {
          maxAttempts: this.config.maxAttempts,
        });
        this.onMaxAttemptsReached();
      }
      return;
    }

    // Calculate exponential backoff delay
    const baseDelay = this.config.initialDelayMs;
    const multiplier = Math.pow(this.config.backoffMultiplier, this.attempts);
    const delay = Math.min(baseDelay * multiplier, this.config.maxDelayMs);

    this.attempts++;

    logEvent('info', `${this.logPrefix}:reconnecting`, {
      attempt: this.attempts,
      delay,
      maxAttempts: this.config.maxAttempts,
    });

    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.isClosed) {
        this.reconnectFn();
      }
    }, delay);
  }

  /**
   * Cancel any pending reconnection
   */
  public cancel(): void {
    this.isClosed = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  /**
   * Get current attempt count
   */
  public getAttemptCount(): number {
    return this.attempts;
  }
}

/**
 * Generate UUID for requests
 */
export function generateRequestId(): string {
  return uuidv4();
}

/**
 * Generate session ID
 */
export function generateSessionId(): string {
  return uuidv4();
}

/**
 * Sanitize URL for logging (remove auth tokens)
 */
export function sanitizeUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    if (urlObj.searchParams.has('auth')) {
      urlObj.searchParams.set('auth', '[REDACTED]');
    }
    return urlObj.toString();
  } catch {
    return '[INVALID_URL]';
  }
}

/**
 * Sanitize log data (remove tokens)
 */
export function sanitizeLogData(data: string): string {
  if (typeof data !== 'string') return '[NON_STRING_DATA]';

  // Replace potential tokens in JSON strings
  return data
    .replace(/"auth":\s*"[^"]+"/g, '"auth":"[REDACTED]"')
    .replace(/Bearer\s+[^\s"]+/g, 'Bearer [REDACTED]')
    .replace(/"Authorization":\s*"[^"]+"/g, '"Authorization":"[REDACTED]"');
}

/**
 * Apply default reconnection configuration
 */
export function applyReconnectionDefaults(
  config?: Partial<ReconnectionConfig>,
): ReconnectionConfig {
  return {
    maxAttempts: config?.maxAttempts ?? 5,
    initialDelayMs: config?.initialDelayMs ?? 1000,
    backoffMultiplier: config?.backoffMultiplier ?? 2,
    maxDelayMs: config?.maxDelayMs ?? 16000,
  };
}
