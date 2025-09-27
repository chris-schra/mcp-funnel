import {
  RegistryServer,
  Package,
  Remote,
  EnvironmentVariable,
} from '../types/registry.types.js';

// Common environment variables
export const ENV_VARS = {
  NODE_ENV: { name: 'NODE_ENV', value: 'production' },
  API_KEY_REQUIRED: { name: 'API_KEY', is_required: true },
  DEBUG: { name: 'DEBUG', value: 'false' },
  PORT: { name: 'PORT', value: '8080' },
  PYTHONPATH: { name: 'PYTHONPATH', value: '/opt/mcp' },
  LOG_LEVEL: { name: 'LOG_LEVEL', value: 'INFO' },
  SECRET_KEY_REQUIRED: { name: 'SECRET_KEY', is_required: true },
  HOST: { name: 'HOST', value: '0.0.0.0' },
} as const;

// Package fixtures by registry type
export const PACKAGES = {
  npm: {
    simple: {
      identifier: 'simple-mcp-server',
      registry_type: 'npm' as const,
    },
    withArgs: {
      identifier: '@mcp/example-server',
      registry_type: 'npm' as const,
      runtime_hint: 'node',
      package_arguments: ['--config', 'production.json'],
      environment_variables: [ENV_VARS.NODE_ENV, ENV_VARS.API_KEY_REQUIRED],
    },
    withYarn: {
      identifier: '@test/server',
      registry_type: 'npm' as const,
      runtime_hint: 'yarn',
      package_arguments: ['--production'],
    },
    withPnpm: {
      identifier: '@test/server',
      registry_type: 'npm' as const,
      runtime_hint: 'pnpm',
    },
    withCustomRuntime: {
      identifier: '@test/server',
      registry_type: 'npm' as const,
      runtime_hint: 'bunx',
      package_arguments: ['--env', 'production'],
    },
    withRuntimeArgs: {
      identifier: '@test/server',
      registry_type: 'npm' as const,
      runtime_hint: 'npx',
      runtime_arguments: ['-y', '--no-install'],
      package_arguments: ['--verbose'],
    },
    withQuotedArgs: {
      identifier: '@quote/server',
      registry_type: 'npm' as const,
      package_arguments: ['--flag="value"'],
    },
  },
  pypi: {
    simple: {
      identifier: 'basic-python-server',
      registry_type: 'pypi' as const,
      package_arguments: ['--minimal'],
    },
    withEnv: {
      identifier: 'mcp-python-server',
      registry_type: 'pypi' as const,
      runtime_hint: 'python',
      package_arguments: ['--verbose', '--port', '8080'],
      environment_variables: [ENV_VARS.PYTHONPATH, ENV_VARS.LOG_LEVEL],
    },
  },
  oci: {
    simple: {
      identifier: 'docker.io/mcp/server:latest',
      registry_type: 'oci' as const,
    },
    withEnv: {
      identifier: 'ghcr.io/example/mcp-server:v1.2.3',
      registry_type: 'oci' as const,
      package_arguments: ['--port', '3000', '--host', '0.0.0.0'],
      environment_variables: [
        { name: 'PORT', value: '3000' },
        { name: 'HOST', value: '0.0.0.0' },
        ENV_VARS.SECRET_KEY_REQUIRED,
      ],
    },
  },
  github: {
    simple: {
      identifier: 'owner/repo',
      registry_type: 'github' as const,
      runtime_hint: 'node',
      package_arguments: ['start', '--production'],
      environment_variables: [ENV_VARS.NODE_ENV],
    },
  },
  unknown: {
    identifier: 'unknown-package',
    registry_type: 'custom-registry' as 'npm',
    package_arguments: ['--custom'],
  },
} as const;

// Remote fixtures
export const REMOTES = {
  sse: {
    type: 'sse',
    url: 'https://api.example.com/mcp/events',
    headers: [
      { name: 'Authorization', value: 'Bearer ${API_TOKEN}' },
      { name: 'Content-Type', value: 'text/event-stream' },
      { name: 'Accept', value: 'text/event-stream' },
    ],
  },
  websocket: {
    type: 'websocket',
    url: 'wss://websocket.example.com/mcp',
    headers: [
      { name: 'Authorization', value: 'Bearer ${WS_TOKEN}' },
      { name: 'Sec-WebSocket-Protocol', value: 'mcp-v1' },
    ],
  },
  stdio: {
    type: 'stdio',
    url: 'http://localhost:3000/mcp',
  },
  withQuotedHeaders: {
    type: 'sse',
    url: 'https://remote.example.com/mcp',
    headers: [
      { name: 'Authorization', value: 'Bearer "token"' },
      { name: 'X-Custom-Header', value: 'Value with "quotes"' },
    ],
  },
} as const;

// Server fixtures
export function createServer(
  id: string,
  name: string,
  description: string,
  config: { packages?: Package[]; remotes?: Remote[] },
): RegistryServer {
  return {
    id,
    name,
    description,
    ...config,
  };
}

// Test cases for parameterized tests
export const NPM_RUNTIME_TEST_CASES = [
  {
    name: 'npm with node runtime',
    package: PACKAGES.npm.withArgs,
    expected: {
      command: 'node',
      args: ['@mcp/example-server', '--config', 'production.json'],
      env: { NODE_ENV: 'production' },
    },
  },
  {
    name: 'npm with yarn runtime',
    package: PACKAGES.npm.withYarn,
    expected: {
      command: 'yarn',
      args: ['@test/server', '--production'],
    },
  },
  {
    name: 'npm with pnpm runtime',
    package: PACKAGES.npm.withPnpm,
    expected: {
      command: 'pnpm',
      args: ['@test/server'],
    },
  },
  {
    name: 'npm with custom runtime',
    package: PACKAGES.npm.withCustomRuntime,
    expected: {
      command: 'bunx',
      args: ['@test/server', '--env', 'production'],
    },
  },
] as const;

export const REGISTRY_TYPE_TEST_CASES = [
  {
    registryType: 'npm' as const,
    package: PACKAGES.npm.simple,
    expected: {
      command: 'npx',
      args: ['-y', 'simple-mcp-server'],
    },
  },
  {
    registryType: 'pypi' as const,
    package: PACKAGES.pypi.simple,
    expected: {
      command: 'uvx',
      args: ['basic-python-server', '--minimal'],
    },
  },
  {
    registryType: 'oci' as const,
    package: PACKAGES.oci.simple,
    expected: {
      command: 'docker',
      args: ['run', '-i', '--rm', 'docker.io/mcp/server:latest'],
    },
  },
] as const;

export const COMPLEX_ENV_VARS: EnvironmentVariable[] = [
  { name: 'VAR1', value: 'value1' },
  { name: 'VAR2', value: 'value2', is_required: false },
  { name: 'VAR3', is_required: true }, // No default value
  { name: 'VAR4', value: '', is_required: false }, // Empty string value
  { name: 'VAR5' }, // No value, no required flag
];

export const INSTALL_INSTRUCTION_TEST_CASES = [
  {
    name: 'npm packages',
    server: createServer(
      'npm-instructions',
      'NPM Instructions Server',
      'Test npm instructions',
      {
        packages: [
          {
            identifier: '@example/mcp-server',
            registry_type: 'npm' as const,
            environment_variables: [ENV_VARS.API_KEY_REQUIRED, ENV_VARS.DEBUG],
          },
        ],
      },
    ),
    expectedContent: [
      'npm',
      '@example/mcp-server',
      'API_KEY',
      'required',
      'environment variable',
    ],
  },
  {
    name: 'pypi packages',
    server: createServer(
      'pypi-instructions',
      'PyPI Instructions Server',
      'Test PyPI instructions',
      {
        packages: [
          {
            identifier: 'mcp-python-server',
            registry_type: 'pypi' as const,
            environment_variables: [{ name: 'PYTHON_PATH', is_required: true }],
          },
        ],
      },
    ),
    expectedContent: ['pip', 'mcp-python-server', 'PYTHON_PATH', 'uvx'],
  },
  {
    name: 'oci containers',
    server: createServer(
      'oci-instructions',
      'OCI Instructions Server',
      'Test OCI instructions',
      {
        packages: [
          {
            identifier: 'ghcr.io/example/server:latest',
            registry_type: 'oci' as const,
            environment_variables: [{ name: 'CONTAINER_PORT', value: '3000' }],
          },
        ],
      },
    ),
    expectedContent: [
      'Docker',
      'container',
      'ghcr.io/example/server:latest',
      'docker pull',
    ],
  },
] as const;
