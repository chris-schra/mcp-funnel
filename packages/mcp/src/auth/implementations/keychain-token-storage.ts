import { execFile } from 'child_process';
import { promisify } from 'util';
import { promises as fs } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { createHash } from 'crypto';
import type {
  ITokenStorage,
  TokenData,
} from '../interfaces/token-storage.interface.js';
import { logEvent } from '../../logger.js';
import { ValidationUtils } from '../../utils/validation-utils.js';

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
 *
 * Security: All command execution uses execFile with argument arrays to prevent
 * command injection attacks. ServerIds are validated against a strict regex.
 */
export class KeychainTokenStorage implements ITokenStorage {
  private readonly serviceName = 'mcp-funnel';
  private readonly fallbackDir = join(homedir(), '.mcp-funnel', 'tokens');

  constructor(private readonly serverId: string) {
    // Validate and sanitize serverId to prevent command injection
    ValidationUtils.sanitizeServerId(serverId);
  }

  /**
   * Store token data securely using OS keychain
   */
  async store(token: TokenData): Promise<void> {
    const key = `${this.serviceName}:${this.serverId}`;
    const value = JSON.stringify({
      accessToken: token.accessToken,
      expiresAt: token.expiresAt.toISOString(),
      tokenType: token.tokenType,
      scope: token.scope,
    });

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
   */
  async retrieve(): Promise<TokenData | null> {
    const key = `${this.serviceName}:${this.serverId}`;

    try {
      // Try keychain first
      const value = await this.retrieveFromKeychain(key);
      return this.parseStoredToken(value);
    } catch (keychainError) {
      try {
        // Fallback to file storage
        const value = await this.retrieveFromFile(key);
        return this.parseStoredToken(value);
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
   */
  async clear(): Promise<void> {
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
   */
  async isExpired(): Promise<boolean> {
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
   */
  private async storeInFile(key: string, value: string): Promise<void> {
    const filename = this.getFilename(key);
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
   */
  private async retrieveFromFile(key: string): Promise<string> {
    const filename = this.getFilename(key);
    const filepath = join(this.fallbackDir, filename);

    const value = await fs.readFile(filepath, 'utf8');
    return value.trim();
  }

  /**
   * Remove token from secure file fallback
   */
  private async removeFromFile(key: string): Promise<void> {
    const filename = this.getFilename(key);
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

  /**
   * Generate secure filename from key
   */
  private getFilename(key: string): string {
    // Simple hash to avoid filesystem issues with special characters
    const hash = createHash('sha256').update(key).digest('hex');
    return `token-${hash.substring(0, 16)}.json`;
  }

  /**
   * Parse stored token JSON back to TokenData
   */
  private parseStoredToken(jsonString: string): TokenData {
    const parsed = JSON.parse(jsonString);

    return {
      accessToken: parsed.accessToken,
      expiresAt: new Date(parsed.expiresAt),
      tokenType: parsed.tokenType || 'Bearer',
      scope: parsed.scope,
    };
  }
}
