import type {
  TokenData,
  ITokenStorage,
} from '../interfaces/token-storage.interface.js';
import { logEvent } from '../../logger.js';

/**
 * In-memory token storage implementation
 * Provides MVP token storage that is lost on application restart
 * Includes automatic refresh scheduling and thread safety
 */
export class MemoryTokenStorage implements ITokenStorage {
  private tokenData: TokenData | null = null;
  private refreshCallback: (() => Promise<void>) | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
  private operationLock = false;

  // Buffer time in milliseconds (5 minutes)
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Store token with metadata and schedule refresh if callback is set
   * @param token - Token data to store
   */
  async store(token: TokenData): Promise<void> {
    await this.withLock(async () => {
      // Validate token
      this.validateToken(token);

      // Sanitize token data
      const sanitizedToken = this.sanitizeToken(token);

      // Clear any existing refresh timer
      this.clearRefreshTimer();

      // Store the token
      this.tokenData = sanitizedToken;

      // Schedule refresh if callback is set and token is not already expired
      if (
        this.refreshCallback &&
        !this.isTokenExpiredWithBuffer(sanitizedToken)
      ) {
        this.scheduleTokenRefresh(sanitizedToken);
      }

      // Log successful storage (without sensitive data)
      logEvent('info', 'auth:token_stored', {
        tokenType: sanitizedToken.tokenType,
        scope: sanitizedToken.scope,
        expiresAt: sanitizedToken.expiresAt.toISOString(),
      });
    });
  }

  /**
   * Retrieve current stored token
   * @returns Token data if available, null if no token stored
   */
  async retrieve(): Promise<TokenData | null> {
    return await this.withLock(async () => {
      return this.tokenData ? { ...this.tokenData } : null;
    });
  }

  /**
   * Remove stored token and clear refresh timer
   */
  async clear(): Promise<void> {
    await this.withLock(async () => {
      // Clear refresh timer
      this.clearRefreshTimer();

      // Clear token data from memory
      this.tokenData = null;

      logEvent('info', 'auth:token_cleared', {});
    });
  }

  /**
   * Check if the current stored token is expired (with 5-minute buffer)
   * @returns true if token is expired or no token exists, false if valid
   */
  async isExpired(): Promise<boolean> {
    return await this.withLock(async () => {
      if (!this.tokenData) {
        return true;
      }

      return this.isTokenExpiredWithBuffer(this.tokenData);
    });
  }

  /**
   * Optional method to schedule token refresh
   * @param callback - Function to call when refresh is needed
   */
  scheduleRefresh(callback: () => Promise<void>): void {
    this.refreshCallback = callback;

    // If we have a token stored, reschedule refresh
    if (this.tokenData && !this.isTokenExpiredWithBuffer(this.tokenData)) {
      this.clearRefreshTimer();
      this.scheduleTokenRefresh(this.tokenData);
    }
  }

  /**
   * Dispose method for cleanup (used in tests)
   */
  async dispose(): Promise<void> {
    await this.clear();
    this.refreshCallback = null;
  }

  /**
   * Memory snapshot for testing (not part of interface)
   */
  _getMemorySnapshot(): unknown {
    return this.tokenData ? { hasToken: true } : { hasToken: false };
  }

  /**
   * Trigger error for testing (not part of interface)
   */
  async _triggerError(): Promise<void> {
    throw new Error('Test error - no sensitive data exposed');
  }

  /**
   * Validates token data before storage
   */
  private validateToken(token: TokenData): void {
    if (!token.accessToken?.trim()) {
      throw new Error('Access token cannot be empty');
    }

    if (!token.tokenType?.trim()) {
      throw new Error('Token type cannot be empty');
    }

    if (
      !(token.expiresAt instanceof Date) ||
      isNaN(token.expiresAt.getTime())
    ) {
      throw new Error('Invalid expiry date');
    }
  }

  /**
   * Sanitizes token data by trimming whitespace
   */
  private sanitizeToken(token: TokenData): TokenData {
    return {
      accessToken: token.accessToken.trim(),
      expiresAt: token.expiresAt,
      tokenType: token.tokenType.trim(),
      scope: token.scope?.trim(),
    };
  }

  /**
   * Checks if token is expired with buffer time for proactive refresh
   */
  private isTokenExpiredWithBuffer(token: TokenData): boolean {
    if (isNaN(token.expiresAt.getTime())) {
      return true;
    }

    const now = Date.now();
    const expiryWithBuffer =
      token.expiresAt.getTime() - MemoryTokenStorage.REFRESH_BUFFER_MS;

    return now >= expiryWithBuffer;
  }

  /**
   * Schedules token refresh before expiry
   */
  private scheduleTokenRefresh(token: TokenData): void {
    if (!this.refreshCallback) {
      return;
    }

    const now = Date.now();
    const expiryWithBuffer =
      token.expiresAt.getTime() - MemoryTokenStorage.REFRESH_BUFFER_MS;
    const delay = Math.max(0, expiryWithBuffer - now);

    // Don't schedule if already expired
    if (delay <= 0) {
      return;
    }

    this.refreshTimerId = setTimeout(async () => {
      try {
        if (this.refreshCallback) {
          await this.refreshCallback();
        }
      } catch (error) {
        // Log error without exposing token data
        logEvent('error', 'auth:token_refresh_failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, delay);
  }

  /**
   * Clears the refresh timer
   */
  private clearRefreshTimer(): void {
    if (this.refreshTimerId) {
      clearTimeout(this.refreshTimerId);
      this.refreshTimerId = null;
    }
  }

  /**
   * Provides basic thread safety using a simple lock mechanism
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    // Wait for any existing operation to complete
    while (this.operationLock) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }

    // Acquire lock
    this.operationLock = true;

    try {
      return await operation();
    } finally {
      // Release lock
      this.operationLock = false;
    }
  }
}

/**
 * Factory function to create a new MemoryTokenStorage instance
 */
export function createMemoryTokenStorage(): ITokenStorage {
  return new MemoryTokenStorage();
}
