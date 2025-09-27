import type { ProxyConfig } from '../../config.js';
import type { ServerConfig } from '../interfaces/temp-server.interface.js';
import type { RegistryServer } from '../types/registry.types.js';

/**
 * Test fixtures for registry context tests
 */

// Mock configurations
export const mockConfig: ProxyConfig = {
  servers: [
    {
      name: 'test-server',
      command: 'echo',
      args: ['test'],
    },
  ],
};

export const emptyConfig: ProxyConfig = { servers: [] };

export const configWithRegistries: ProxyConfig & { registries: string[] } = {
  ...mockConfig,
  registries: [
    'https://registry.example.com/api',
    'https://backup-registry.example.com/api',
  ],
};

export const malformedConfig = {} as ProxyConfig;

export const invalidConfig: ProxyConfig = {
  servers: [
    {
      name: 'test',
      command: 'echo',
    },
  ],
};

// Server configurations for temporary server tests
export const tempServerConfigs = {
  basic: {
    name: 'temp-test',
    command: 'node',
    args: ['server.js'],
  } as ServerConfig,

  withEnv: {
    name: 'temp-test',
    command: 'python',
    args: ['-m', 'server'],
    env: { PYTHON_PATH: '/opt/python' },
  } as ServerConfig,

  docker: {
    name: 'temp-to-persist',
    command: 'docker',
    args: ['run', 'server-image'],
  } as ServerConfig,

  simple: {
    name: 'already-persisted',
    command: 'test',
  } as ServerConfig,
};

// Mock registry servers
export const mockRegistryServers = {
  filesystem: {
    name: 'filesystem-server',
    description: 'MCP server for filesystem operations',
    id: 'fs-001',
    registry_type: 'npm',
  } as RegistryServer,

  detailed: {
    name: 'fs-001',
    description: 'MCP server for filesystem operations',
    id: 'fs-001',
    registry_type: 'npm',
    tools: ['read_file', 'write_file', 'list_directory'],
  } as RegistryServer,

  official: {
    name: 'official-server',
    description: 'Server from official registry',
    id: 'official-server',
    registry_type: 'official',
    tools: ['test_tool'],
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        id: 'official-server',
      },
    },
  } as RegistryServer,

  basic: {
    name: 'test-server',
    description: 'Test server',
    id: 'test-001',
    registry_type: 'npm',
    tools: ['test_tool'],
  } as RegistryServer,
};

// Mock response structures
export const mockResponses = {
  empty: {
    servers: [],
    metadata: {
      count: 0,
      next_cursor: null,
    },
  },

  singleServer: {
    servers: [mockRegistryServers.filesystem],
    metadata: {
      count: 1,
      next_cursor: null,
    },
  },

  detailedServer: {
    servers: [mockRegistryServers.detailed],
    metadata: {
      count: 1,
      next_cursor: null,
    },
  },

  officialServer: {
    servers: [mockRegistryServers.official],
    metadata: {
      count: 1,
      next_cursor: null,
    },
  },
};

// Error messages for testing
export const errorMessages = {
  registryUnavailable: 'Registry unavailable',
  networkTimeout: 'Network timeout',
  invalidJson: 'Invalid JSON response',
  tempServerNotFound: (name: string) => `Temporary server '${name}' not found`,
  noRegistryFound: (registry: string) =>
    `No registry found matching: ${registry}`,
};

// Test data sets for parameterized tests
export const registryTestCases = [
  {
    name: 'official registry mapping',
    registryId: 'official',
    shouldCallFetch: true,
    expectedUrl: 'https://registry.modelcontextprotocol.io',
  },
  {
    name: 'URL substring matching',
    registryId: 'modelcontextprotocol',
    shouldCallFetch: true,
    expectedUrl: 'https://registry.modelcontextprotocol.io',
  },
  {
    name: 'unknown registry',
    registryId: 'nonexistent-registry',
    shouldCallFetch: false,
    expectedMessage: 'No registry found matching: nonexistent-registry',
  },
];

export const errorTestCases = [
  {
    name: 'network timeout',
    error: new Error('Network timeout'),
    expectedMessage: 'Network timeout',
  },
  {
    name: 'registry unavailable',
    error: new Error('Registry unavailable'),
    expectedMessage: 'Registry unavailable',
  },
  {
    name: 'invalid JSON',
    error: new Error('Invalid JSON response'),
    expectedMessage: 'Invalid JSON response',
  },
];
