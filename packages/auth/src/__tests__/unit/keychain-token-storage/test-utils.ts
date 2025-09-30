import { vi } from 'vitest';
import { promises as fs } from 'fs';
import type { TokenData } from '@mcp-funnel/core';

// Create a mock function for execFileAsync that can be shared
const execFileAsyncMock = vi.fn();

// Mock child_process module
vi.mock('child_process', () => ({
  execFile: vi.fn(),
}));

// Mock util.promisify to return our mock function
vi.mock('util', () => ({
  promisify: () => execFileAsyncMock,
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

export const mockedFs = vi.mocked(fs);
export const mockExecFileAsync = execFileAsyncMock;

// Create a mock token for testing
export function createMockToken(expiresInMs: number = 3600000): TokenData {
  return {
    accessToken: 'test-access-token',
    expiresAt: new Date(Date.now() + expiresInMs),
    tokenType: 'Bearer',
    scope: 'read write',
  };
}

// Setup standard mocks for successful operations
export function setupSuccessfulMocks(): void {
  mockedFs.mkdir.mockResolvedValue(undefined);
  mockedFs.writeFile.mockResolvedValue(undefined);
  mockedFs.readFile.mockResolvedValue(
    Buffer.from(JSON.stringify(createMockToken())),
  );
  mockedFs.unlink.mockResolvedValue(undefined);
  mockExecFileAsync.mockResolvedValue({ stdout: '', stderr: '' });
}
