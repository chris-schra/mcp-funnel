/**
 * Shared test utilities for unit tests
 */

import { vi } from 'vitest';
import type { IAuthProvider } from '@mcp-funnel/core';
import type { MCPProxy } from '../../src/index.js';

/**
 * Creates a mock auth provider for testing
 */
export function createMockAuthProvider(): IAuthProvider {
  return {
    getHeaders: vi.fn().mockResolvedValue({
      Authorization: 'Bearer mock-token',
    }),
    refresh: vi.fn().mockResolvedValue(undefined),
    isValid: vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Ensures a server is connected for testing
 */
export async function ensureServerConnected(
  proxy: MCPProxy,
  serverName: string,
): Promise<void> {
  const status = proxy.getServerStatus(serverName);
  if (status.status !== 'connected') {
    await proxy.reconnectServer(serverName);
  }
}

/**
 * Ensures a server is disconnected for testing
 */
export async function ensureServerDisconnected(
  proxy: MCPProxy,
  serverName: string,
): Promise<void> {
  const status = proxy.getServerStatus(serverName);
  if (status.status === 'connected') {
    await proxy.disconnectServer(serverName);
  }
}
