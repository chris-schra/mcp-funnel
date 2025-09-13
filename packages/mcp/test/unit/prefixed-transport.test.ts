import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';

// Create a mock process type that extends EventEmitter with ChildProcess properties
type MockProcess = EventEmitter & {
  stderr: PassThrough;
  stdout: PassThrough;
  stdin: PassThrough;
  kill: ReturnType<typeof vi.fn>;
};

// Mock child_process
vi.mock('child_process');

describe('PrefixedStdioClientTransport', () => {
  let mockProcess: MockProcess;
  let stderrStream: PassThrough;
  let stdoutStream: PassThrough;
  let stdinStream: PassThrough;

  beforeEach(() => {
    // Create mock streams
    stderrStream = new PassThrough();
    stdoutStream = new PassThrough();
    stdinStream = new PassThrough();

    // Create mock process
    mockProcess = Object.assign(new EventEmitter(), {
      stderr: stderrStream,
      stdout: stdoutStream,
      stdin: stdinStream,
      kill: vi.fn(),
    });

    // Mock spawn to return our mock process
    vi.mocked(spawn).mockReturnValue(mockProcess as unknown as ChildProcess);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Transport Creation', () => {
    it('should spawn process with correct arguments', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test-server', {
        command: 'npx',
        args: ['-y', '@test/mcp-server'],
        env: { TEST_VAR: 'value' },
      });

      await transport.start();

      expect(spawn).toHaveBeenCalledWith(
        'npx',
        ['-y', '@test/mcp-server'],
        expect.objectContaining({
          env: expect.objectContaining({ TEST_VAR: 'value' }),
          stdio: ['pipe', 'pipe', 'pipe'],
        }),
      );
    });
  });

  describe('Stderr Prefixing', () => {
    it('should prefix stderr output with server name', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const transport = new PrefixedStdioClientTransport('github', {
        command: 'test',
        args: [],
      });

      await transport.start();

      // Simulate stderr output
      stderrStream.write('GitHub MCP Server running on stdio\n');
      stderrStream.write('Connecting to API...\n');

      // Wait for stream processing
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[github] GitHub MCP Server running on stdio',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[github] Connecting to API...',
      );

      consoleErrorSpy.mockRestore();
    });

    it('should ignore empty lines in stderr', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const transport = new PrefixedStdioClientTransport('memory', {
        command: 'test',
        args: [],
      });

      await transport.start();

      stderrStream.write('Line with content\n');
      stderrStream.write('\n');
      stderrStream.write('   \n');
      stderrStream.write('Another line\n');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[memory] Line with content',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('[memory] Another line');

      consoleErrorSpy.mockRestore();
    });
  });

  describe('MCP Message Handling', () => {
    it('should parse and forward valid JSON-RPC messages', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      const messageHandler = vi.fn();
      transport.onmessage = messageHandler;

      await transport.start();

      const message = {
        jsonrpc: '2.0',
        method: 'tools/list',
        id: 1,
      };

      stdoutStream.write(JSON.stringify(message) + '\n');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should prefix non-JSON stdout as server logs', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const transport = new PrefixedStdioClientTransport('filesystem', {
        command: 'test',
        args: [],
      });

      await transport.start();

      stdoutStream.write('Not a JSON message\n');
      stdoutStream.write('Another log line\n');

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[filesystem] Not a JSON message',
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[filesystem] Another log line',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Transport Methods', () => {
    it('should send messages through stdin', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      await transport.start();

      const message = {
        jsonrpc: '2.0' as const,
        method: 'initialize',
        params: {},
        id: 1,
      };

      const stdinWriteSpy = vi.spyOn(stdinStream, 'write');

      await transport.send(message);

      expect(stdinWriteSpy).toHaveBeenCalledWith(
        JSON.stringify(message) + '\n',
      );
    });

    it('should throw error when sending before start', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      const message = { jsonrpc: '2.0' as const, method: 'test', id: 1 };

      await expect(transport.send(message)).rejects.toThrow(
        'Transport not started',
      );
    });

    it('should handle process close event', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      const closeHandler = vi.fn();
      transport.onclose = closeHandler;

      await transport.start();

      mockProcess.emit('close');

      expect(closeHandler).toHaveBeenCalled();
    });

    it('should handle process error event', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      const errorHandler = vi.fn();
      transport.onerror = errorHandler;

      await transport.start();

      const error = new Error('Process failed');
      mockProcess.emit('error', error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should kill process on close', async () => {
      const { PrefixedStdioClientTransport } = await import('../../src');

      const transport = new PrefixedStdioClientTransport('test', {
        command: 'test',
        args: [],
      });

      await transport.start();
      await transport.close();

      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });
});
