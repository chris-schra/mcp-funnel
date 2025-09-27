/**
 * Test fixtures for registry integration tests.
 * Contains mock data structures that simulate real API responses.
 */

import type {
  ServerDetail,
  Package,
  Remote,
  KeyValueInput,
  EnvironmentVariable,
  RegistryServer,
} from '../types/registry.types.js';

export const createMockEnvironmentVariables = (): EnvironmentVariable[] => [
  { name: 'NODE_ENV', value: 'production', is_required: false },
  { name: 'API_KEY', is_required: true },
];

export const createMockHeaders = (): KeyValueInput[] => [
  {
    name: 'Authorization',
    value: 'Bearer ${API_TOKEN}',
    is_required: true,
    is_secret: true,
  },
  {
    name: 'Content-Type',
    value: 'text/event-stream',
    is_required: false,
  },
  { name: 'Accept', value: 'text/event-stream', is_required: false },
];

export const createNpmPackage = (overrides?: Partial<Package>): Package => ({
  identifier: '@mcp/example-server',
  registry_type: 'npm',
  package_arguments: ['--config', 'production.json'],
  environment_variables: createMockEnvironmentVariables(),
  ...overrides,
});

export const createPypiPackage = (overrides?: Partial<Package>): Package => ({
  identifier: 'mcp-python-server',
  registry_type: 'pypi',
  package_arguments: ['--verbose', '--host', '0.0.0.0'],
  environment_variables: [
    { name: 'PYTHONPATH', value: '/opt/mcp' },
    { name: 'LOG_LEVEL', value: 'DEBUG' },
  ],
  ...overrides,
});

export const createOciPackage = (overrides?: Partial<Package>): Package => ({
  identifier: 'ghcr.io/example/mcp-server:v1.0.0',
  registry_type: 'oci',
  package_arguments: ['--config', '/app/config.json'],
  environment_variables: [
    { name: 'CONTAINER_PORT', value: '8080' },
    { name: 'ENV', value: 'production' },
  ],
  ...overrides,
});

export const createGithubPackage = (overrides?: Partial<Package>): Package => ({
  identifier: 'owner/repo',
  registry_type: 'github',
  package_arguments: ['start', '--production'],
  environment_variables: [
    { name: 'GITHUB_TOKEN', is_required: true },
    { name: 'NODE_ENV', value: 'production' },
  ],
  ...overrides,
});

export const createRemote = (overrides?: Partial<Remote>): Remote => ({
  type: 'sse',
  url: 'https://api.example.com/mcp/events',
  headers: createMockHeaders(),
  ...overrides,
});

export const createServerDetail = (
  overrides?: Partial<ServerDetail>,
): ServerDetail => ({
  id: 'npm-example-server',
  _meta: {
    'io.modelcontextprotocol.registry/official': {
      id: 'npm-example-registry-id',
      published_at: '2025-01-01T00:00:00Z',
      updated_at: '2025-01-01T00:00:00Z',
    },
  },
  name: 'NPM Example Server',
  description: 'Example MCP server from NPM registry',
  packages: [createNpmPackage()],
  tools: ['file-reader', 'api-client'],
  ...overrides,
});

// Predefined server fixtures for common test scenarios
export const testServers = {
  npm: createServerDetail(),

  remoteSSE: createServerDetail({
    id: 'remote-sse-server',
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        id: 'remote-sse-registry-id',
        published_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      },
    },
    name: 'Remote SSE Server',
    description: 'Server accessed via Server-Sent Events',
    packages: undefined,
    remotes: [createRemote()],
    tools: ['remote-api', 'event-stream'],
  }),

  uuid: createServerDetail({
    id: 'a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d',
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        id: 'a8a5c761-c1dc-4d1d-9100-b57df4c9ec0d',
        published_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-01T00:00:00Z',
      },
    },
    name: 'mcp-funnel-server',
    description: 'MCP proxy server',
    packages: [
      createNpmPackage({
        identifier: '@chris-schra/mcp-funnel',
        runtime_hint: 'npx',
        environment_variables: [],
        package_arguments: undefined,
      }),
    ],
    tools: undefined,
  }),

  legacy: createServerDetail({
    id: 'legacy-server-id',
    _meta: undefined,
    name: 'Legacy Server',
    description: 'Server without _meta field for backward compatibility',
    packages: [
      createNpmPackage({
        identifier: 'legacy-package',
        environment_variables: undefined,
        package_arguments: undefined,
      }),
    ],
    tools: undefined,
  }),

  multipleClient: [
    createServerDetail({
      id: 'client-server-1',
      _meta: {
        'io.modelcontextprotocol.registry/official': {
          id: 'client-registry-1',
          published_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      },
      name: 'Client Server 1',
      description: 'First server from client',
      packages: [createNpmPackage({ identifier: 'client-pkg-1' })],
      tools: undefined,
    }),
    createServerDetail({
      id: 'client-server-2',
      _meta: {
        'io.modelcontextprotocol.registry/official': {
          id: 'client-registry-2',
          published_at: '2025-01-01T00:00:00Z',
          updated_at: '2025-01-01T00:00:00Z',
        },
      },
      name: 'Client Server 2',
      description: 'Second server from client',
      packages: undefined,
      remotes: [
        createRemote({
          type: 'sse',
          url: 'https://example.com/sse',
          headers: undefined,
        }),
      ],
      tools: undefined,
    }),
  ],
} as const;

// Test registry server objects for config validation tests
export const configTestServers = {
  npm: {
    id: 'npm-validation',
    name: 'NPM Validation Server',
    description: 'Server for NPM config validation',
    packages: [
      createNpmPackage({
        identifier: '@validation/server',
        package_arguments: ['--flag1', '--flag2'],
        environment_variables: undefined,
      }),
    ],
  } as RegistryServer,

  pypi: {
    id: 'pypi-validation',
    name: 'PyPI Validation Server',
    description: 'Server for PyPI config validation',
    packages: [
      createPypiPackage({
        identifier: 'validation-server',
        package_arguments: ['--debug', '--port', '5000'],
        environment_variables: undefined,
      }),
    ],
  } as RegistryServer,

  oci: {
    id: 'oci-validation',
    name: 'OCI Validation Server',
    description: 'Server for OCI config validation',
    packages: [
      createOciPackage({
        identifier: 'registry.example.com/validation:latest',
        package_arguments: ['--mount', '/data'],
        environment_variables: undefined,
      }),
    ],
  } as RegistryServer,

  remote: {
    id: 'remote-validation',
    name: 'Remote Validation Server',
    description: 'Server for remote config validation',
    remotes: [
      createRemote({
        type: 'sse',
        url: 'https://validation.example.com/events',
        headers: [
          {
            name: 'X-Auth-Token',
            value: 'secret123',
            is_required: true,
            is_secret: true,
          },
          {
            name: 'Content-Type',
            value: 'application/json',
            is_required: false,
          },
        ],
      }),
    ],
  } as RegistryServer,

  env: {
    id: 'env-validation',
    name: 'Environment Validation Server',
    description: 'Server for environment variable validation',
    packages: [
      createNpmPackage({
        identifier: 'env-server',
        environment_variables: [
          { name: 'REQUIRED_VAR', is_required: true },
          { name: 'OPTIONAL_VAR', value: 'default_value', is_required: false },
          { name: 'ANOTHER_REQUIRED', is_required: true },
          { name: 'WITH_VALUE', value: 'some_value' },
        ],
        package_arguments: undefined,
      }),
    ],
  } as RegistryServer,

  simple: {
    id: 'simple-server',
    name: 'Simple Server',
    description: 'Server with package without env vars',
    packages: [
      createNpmPackage({
        identifier: 'simple-package',
        package_arguments: ['--simple'],
        environment_variables: undefined,
      }),
    ],
  } as RegistryServer,

  simpleRemote: {
    id: 'simple-remote',
    name: 'Simple Remote Server',
    description: 'Remote server without headers',
    remotes: [
      createRemote({
        type: 'stdio',
        url: 'http://localhost:3000/mcp',
        headers: undefined,
      }),
    ],
  } as RegistryServer,

  oldFormat: {
    id: 'old-format-server',
    name: 'Old Format Server',
    description: 'Server with old package format',
    packages: [
      {
        identifier: 'unknown-package',
        // Missing registry_type field to trigger _raw_metadata fallback
        package_arguments: ['--legacy'],
      } as Package,
    ],
  } as RegistryServer,
} as const;
