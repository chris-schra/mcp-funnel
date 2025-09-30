/**
 * Shared test utilities for registry integration tests
 */

import { beforeEach, afterEach, vi } from 'vitest';
import { RegistryContext } from '../../registry-context.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

export { RegistryContext } from '../../registry-context.js';
export { MCPRegistryClient } from '../../registry-client.js';
export { generateConfigSnippet } from '../../config-generator.js';

export type {
  RegistryServer,
  Package,
  Remote,
  KeyValueInput,
  EnvironmentVariable,
  ServerDetail,
} from '../../types/registry.types.js';

export type { ProxyConfig } from '@mcp-funnel/schemas';

// Mock fetch globally
export const mockFetch = vi.fn();
global.fetch = mockFetch;

/**
 * Setup function for registry integration tests
 */
export function setupRegistryIntegrationTest() {
  let mockProxyConfig: ProxyConfig = {
    servers: [],
    registries: ['https://registry.modelcontextprotocol.io'],
  } as ProxyConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    RegistryContext.reset();

    mockProxyConfig = {
      servers: [],
      registries: ['https://registry.modelcontextprotocol.io'],
    } as ProxyConfig;
  });

  afterEach(() => {
    RegistryContext.reset();
  });

  return {
    get mockProxyConfig() {
      return mockProxyConfig;
    },
    mockFetch,
  };
}
