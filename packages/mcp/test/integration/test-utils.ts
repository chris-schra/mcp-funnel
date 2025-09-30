import { beforeEach } from 'vitest';
import type {
  ProxyConfig,
  TargetServerZod,
  SecretProviderConfig,
} from '@mcp-funnel/schemas';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TestContext {
  // Empty for now, but available for future shared state
}

export const setupTestContext = (): TestContext => {
  return {};
};

export const useTestContext = (): (() => TestContext) => {
  let context: TestContext;

  beforeEach(() => {
    context = setupTestContext();
  });

  return () => context;
};

// Helper to create test server configurations
export const createTestServer = (
  overrides: Partial<TargetServerZod>,
): TargetServerZod => ({
  name: 'test-server',
  command: 'node',
  ...overrides,
});

// Helper to create test proxy configurations
export const createTestConfig = (
  overrides: Partial<ProxyConfig>,
): ProxyConfig => ({
  servers: [],
  ...overrides,
});

// Helper to create secret provider configs
export const createSecretProvider = (
  type: 'dotenv' | 'process' | 'inline',
  config: SecretProviderConfig['config'],
): SecretProviderConfig => {
  return { type, config } as SecretProviderConfig;
};
