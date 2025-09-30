import { type ITokenStorage, logEvent, type TokenData } from '@mcp-funnel/core';

/**
 * In-memory token storage implementation
 * Provides MVP token storage that is lost on application restart
 * Includes automatic refresh scheduling and thread safety
 */
export class MemoryTokenStorage implements ITokenStorage {
  private tokenData: TokenData | null = null;
  private refreshCallback: (() => Promise<void>) | null = null;
  private refreshTimerId: ReturnType<typeof setTimeout> | null = null;
  private operationQueue: Array<() => Promise<void>> = [];
  private operationInProgress = false;

  // Buffer time in milliseconds (5 minutes)
  private static readonly REFRESH_BUFFER_MS = 5 * 60 * 1000;

  /**
   * Store token with metadata and schedule refresh if callback is set
   * @param token - Token data to store
   */
  public async store(token: TokenData): Promise<void> {
    await this.withLock(async () => {
      // Validate token
      this.validateToken(token);

      // Sanitize token data
      const sanitizedToken = this.sanitizeToken(token);

      // Clear any existing refresh timer
      this.clearRefreshTimer();

      // Store the token
      this.tokenData = sanitizedToken;

      // Schedule refresh if callback is set and token is valid (not past actual expiry)
      if (
        this.refreshCallback &&
        sanitizedToken.expiresAt.getTime() > Date.now()
      ) {
        this.scheduleTokenRefresh(sanitizedToken);
      }

      // Log successful storage (without sensitive data)
      const logData: Record<string, unknown> = {
        tokenType: sanitizedToken.tokenType,
        scope: sanitizedToken.scope,
      };

      try {
        logData.expiresAt = sanitizedToken.expiresAt.toISOString();
      } catch {
        logData.expiresAt = 'invalid-date';
      }

      logEvent('info', 'auth:token_stored', logData);
    });
  }

  /**
   * Retrieve current stored token
   * @returns Token data if available, null if no token stored
   */
  public async retrieve(): Promise<TokenData | null> {
    return await this.withLock(async () => {
      return this.tokenData ? { ...this.tokenData } : null;
    });
  }

  /**
   * Remove stored token and clear refresh timer
   */
  public async clear(): Promise<void> {
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
  public async isExpired(): Promise<boolean> {
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
  public scheduleRefresh(callback: () => Promise<void>): void {
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
  public async dispose(): Promise<void> {
    await this.clear();
    this.refreshCallback = null;
  }

  /**
   * Memory snapshot for testing (not part of interface)
   * @returns Object indicating whether a token is currently stored
   * @internal
   */
  public _getMemorySnapshot(): unknown {
    return this.tokenData ? { hasToken: true } : { hasToken: false };
  }

  /**
   * Trigger error for testing (not part of interface)
   * @throws \{Error\} Always throws a test error
   * @internal
   */
  public async _triggerError(): Promise<void> {
    throw new Error('Test error - no sensitive data exposed');
  }

  /**
   * Validates token data before storage
   * @param token - Token data to validate
   * @throws \{Error\} When access token or token type is empty
   */
  private validateToken(token: TokenData): void {
    if (!token.accessToken?.trim()) {
      throw new Error('Access token cannot be empty');
    }

    if (!token.tokenType?.trim()) {
      throw new Error('Token type cannot be empty');
    }

    // Allow invalid dates but they will be treated as expired
  }

  /**
   * Sanitizes token data by trimming whitespace (conservative approach)
   * @param token - Token data to sanitize
   * @returns Sanitized copy of the token data
   */
  private sanitizeToken(token: TokenData): TokenData {
    // Return a copy to avoid modifying the original
    return {
      accessToken: token.accessToken,
      expiresAt: token.expiresAt,
      tokenType: token.tokenType,
      scope: token.scope,
    };
  }

  /**
   * Checks if token is expired with buffer time for proactive refresh
   * @param token - Token data to check for expiration
   * @returns true if token is expired or has invalid date, false otherwise
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
   * @param token - Token data used to calculate refresh timing
   */
  private scheduleTokenRefresh(token: TokenData): void {
    if (!this.refreshCallback) {
      return;
    }

    const now = Date.now();
    const expiryWithBuffer =
      token.expiresAt.getTime() - MemoryTokenStorage.REFRESH_BUFFER_MS;
    const delay = Math.max(0, expiryWithBuffer - now);

    // Schedule immediately if delay is 0 or negative
    // but don't schedule if token is already expired without buffer
    if (now >= token.expiresAt.getTime()) {
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
   * Provides basic thread safety using a queue-based approach
   * @param operation - Async operation to execute with lock protection
   * @returns Promise resolving to the operation result
   */
  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const task = async () => {
        try {
          const result = await operation();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.processNextOperation();
        }
      };

      this.operationQueue.push(task);

      if (!this.operationInProgress) {
        this.processNextOperation();
      }
    });
  }

  /**
   * Processes the next operation in the queue
   */
  private processNextOperation(): void {
    if (this.operationQueue.length === 0) {
      this.operationInProgress = false;
      return;
    }

    this.operationInProgress = true;
    const nextTask = this.operationQueue.shift();
    if (nextTask) {
      nextTask();
    }
  }
}

/**
 * Factory function to create a new MemoryTokenStorage instance
 * @returns New instance of MemoryTokenStorage
 */
export function createMemoryTokenStorage(): ITokenStorage {
  return new MemoryTokenStorage();
}
