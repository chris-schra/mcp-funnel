import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { logEvent, ValidationUtils } from '@mcp-funnel/core';
import type { ITokenStorage, TokenData } from '@mcp-funnel/core';
import {
  getFilename,
  parseStoredToken,
  serializeToken,
} from './util/keychain-utils.js';

const execFileAsync = promisify(execFile);

/**
 * Token storage implementation using OS-native keychain/credential storage
 *
 * Platform Support:
 * - macOS: Uses `security` command for Keychain access
 * - Windows: Uses `cmdkey` for storage/deletion and PowerShell PasswordVault API for retrieval
 * - Linux: Falls back to encrypted file storage with restrictive permissions
 *
 * No external dependencies - uses OS built-in commands and APIs following security protocols
 * @remarks
 * Security: All command execution uses execFile with argument arrays to prevent
 * command injection attacks. ServerIds are validated against a strict regex.
 * @example
 * ```typescript
 * const storage = new KeychainTokenStorage('my-server-id');
 * await storage.store({
 *   accessToken: 'token123',
 *   expiresAt: new Date(Date.now() + 3600000)
 * });
 * const token = await storage.retrieve();
 * ```
 * @public
 * @see file:./util/keychain-utils.ts - Utility functions for token serialization
 */
export class KeychainTokenStorage implements ITokenStorage {
  private readonly serviceName = 'mcp-funnel';
  private readonly fallbackDir = join(homedir(), '.mcp-funnel', 'tokens');

  public constructor(private readonly serverId: string) {
    // Validate and sanitize serverId to prevent command injection
    ValidationUtils.sanitizeServerId(serverId);
  }

  /**
   * Store token data securely using OS keychain
   * @param token - Token data to store including access token and expiry
   * @throws {Error} When neither keychain storage nor file fallback succeeds
   * @public
   */
  public async store(token: TokenData): Promise<void> {
    const key = `${this.serviceName}:${this.serverId}`;
    const value = serializeToken(token);

    try {
      await this.storeInKeychain(key, value);

      logEvent('debug', 'auth:token_stored_keychain', {
        serverId: this.serverId,
        platform: process.platform,
        expiresAt: token.expiresAt.toISOString(),
      });
    } catch (error) {
      logEvent('warn', 'auth:keychain_store_failed', {
        serverId: this.serverId,
        error: error instanceof Error ? error.message : String(error),
        fallbackUsed: true,
      });

      // Fallback to secure file storage
      await this.storeInFile(key, value);
    }
  }

  /**
   * Retrieve token data from OS keychain
   * @returns Token data if found, null if not found or retrieval failed
   * @public
   */
  public async retrieve(): Promise<TokenData | null> {
    const key = `${this.serviceName}:${this.serverId}`;

    try {
      // Try keychain first
      const value = await this.retrieveFromKeychain(key);
      return parseStoredToken(value);
    } catch (keychainError) {
      try {
        // Fallback to file storage
        const value = await this.retrieveFromFile(key);
        return parseStoredToken(value);
      } catch (fileError) {
        logEvent('debug', 'auth:token_retrieve_failed', {
          serverId: this.serverId,
          keychainError:
            keychainError instanceof Error
              ? keychainError.message
              : String(keychainError),
          fileError:
            fileError instanceof Error ? fileError.message : String(fileError),
        });
        return null;
      }
    }
  }

  /**
   * Remove token from OS keychain
   * @remarks
   * Attempts to remove from both keychain and file storage.
   * Does not throw if removal fails - logs failures as debug events.
   * @public
   */
  public async clear(): Promise<void> {
    const key = `${this.serviceName}:${this.serverId}`;

    try {
      await this.removeFromKeychain(key);
    } catch (error) {
      // Even if keychain removal fails, try file removal
      logEvent('debug', 'auth:keychain_clear_failed', {
        serverId: this.serverId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      await this.removeFromFile(key);
    } catch (error) {
      // File removal failure is not critical
      logEvent('debug', 'auth:file_clear_failed', {
        serverId: this.serverId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    logEvent('debug', 'auth:token_cleared', { serverId: this.serverId });
  }

  /**
   * Check if stored token is expired
   * @returns True if token is expired or not found, false if valid token exists
   * @public
   */
  public async isExpired(): Promise<boolean> {
    const token = await this.retrieve();
    if (!token) {
      return true;
    }

    const now = new Date();
    const expiresAt = new Date(token.expiresAt);
    return now >= expiresAt;
  }

  /**
   * Store token in OS keychain using platform-specific commands
   * Uses execFile with argument arrays to prevent command injection
   * @param key - Storage key in format serviceName:serverId
   * @param value - Serialized token data to store
   * @throws {Error} When keychain command fails or platform is unsupported
   * @internal
   */
  private async storeInKeychain(key: string, value: string): Promise<void> {
    if (process.platform === 'darwin') {
      // macOS: Use security command with argument array to prevent injection
      await execFileAsync('security', [
        'add-generic-password',
        '-a',
        key,
        '-s',
        this.serviceName,
        '-w',
        value,
        '-U',
      ]);
    } else if (process.platform === 'win32') {
      // Windows: Use cmdkey command with argument array to prevent injection
      await execFileAsync('cmdkey', [
        `/generic:${key}`,
        `/user:${this.serviceName}`,
        `/pass:${value}`,
      ]);
    } else {
      // Linux/other: No keychain command available, will fallback to file
      throw new Error('No keychain available for this platform');
    }
  }

  /**
   * Retrieve token from OS keychain using platform-specific commands
   * Uses execFile with argument arrays to prevent command injection
   * @param key - Storage key in format serviceName:serverId
   * @returns Serialized token data from keychain
   * @throws {Error} When keychain command fails or platform is unsupported
   * @internal
   */
  private async retrieveFromKeychain(key: string): Promise<string> {
    if (process.platform === 'darwin') {
      // macOS: Use security command with argument array to prevent injection
      const { stdout } = await execFileAsync('security', [
        'find-generic-password',
        '-a',
        key,
        '-s',
        this.serviceName,
        '-w',
      ]);
      return stdout.trim();
    } else if (process.platform === 'win32') {
      // Windows: Use PowerShell PasswordVault API to retrieve stored credentials
      // This accesses the same Windows Credential Manager that cmdkey writes to
      const powershellScript = [
        'try {',
        '  $vault = New-Object Windows.Security.Credentials.PasswordVault;',
        `  $cred = $vault.Retrieve("${this.serviceName}", "${key}");`,
        '  $cred.RetrievePassword();',
        '  Write-Output $cred.Password',
        '} catch {',
        '  Write-Error "Credential not found: $_";',
        '  exit 1',
        '}',
      ].join(' ');

      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        powershellScript,
      ]);

      return stdout.trim();
    } else {
      // Linux/other: No keychain command available
      throw new Error('No keychain available for this platform');
    }
  }

  /**
   * Remove token from OS keychain using platform-specific commands
   * Uses execFile with argument arrays to prevent command injection
   * @param key - Storage key in format serviceName:serverId
   * @throws {Error} When keychain command fails or platform is unsupported
   * @internal
   */
  private async removeFromKeychain(key: string): Promise<void> {
    if (process.platform === 'darwin') {
      // macOS: Use security command with argument array to prevent injection
      await execFileAsync('security', [
        'delete-generic-password',
        '-a',
        key,
        '-s',
        this.serviceName,
      ]);
    } else if (process.platform === 'win32') {
      // Windows: Use cmdkey command with argument array to prevent injection
      await execFileAsync('cmdkey', [`/delete:${key}`]);
    } else {
      // Linux/other: No keychain command available
      throw new Error('No keychain available for this platform');
    }
  }

  /**
   * Store token in secure file as fallback (Linux/when keychain fails)
   * @param key - Storage key in format serviceName:serverId
   * @param value - Serialized token data to store
   * @throws {Error} When file system operations fail
   * @internal
   */
  private async storeInFile(key: string, value: string): Promise<void> {
    const filename = getFilename(key);
    const filepath = join(this.fallbackDir, filename);

    // Ensure directory exists with restrictive permissions
    await fs.mkdir(this.fallbackDir, { recursive: true, mode: 0o700 });

    // Write file with user-only permissions
    await fs.writeFile(filepath, value, { mode: 0o600 });

    logEvent('debug', 'auth:token_stored_file', {
      serverId: this.serverId,
      filepath: filepath,
    });
  }

  /**
   * Retrieve token from secure file fallback
   * @param key - Storage key in format serviceName:serverId
   * @returns Serialized token data from file
   * @throws {Error} When file read fails or file doesn't exist
   * @internal
   */
  private async retrieveFromFile(key: string): Promise<string> {
    const filename = getFilename(key);
    const filepath = join(this.fallbackDir, filename);

    const value = await fs.readFile(filepath, 'utf8');
    return value.trim();
  }

  /**
   * Remove token from secure file fallback
   * @param key - Storage key in format serviceName:serverId
   * @throws {Error} When file deletion fails (ignores ENOENT)
   * @internal
   */
  private async removeFromFile(key: string): Promise<void> {
    const filename = getFilename(key);
    const filepath = join(this.fallbackDir, filename);

    try {
      await fs.unlink(filepath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, which is fine
    }
  }
}
