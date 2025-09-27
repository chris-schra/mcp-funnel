/**
 * Test helpers for integration tests.
 * Provides utilities for environment setup, provider configuration, and assertions.
 */

import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SecretManager } from './secret-manager.js';
import { SecretProviderRegistry } from './secret-provider-registry.js';
import { ISecretProvider } from './types.js';
import { ProcessEnvProvider } from './process-env-provider.js';
import { DotEnvProvider } from './providers/dotenv/index.js';
import { InlineProvider } from './inline-provider.js';

/**
 * Test environment manager for isolated test setup and cleanup
 */
export class TestEnvironmentManager {
  private testDir: string;
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.testDir = this.createTestDirectory();
    this.originalEnv = { ...process.env };
  }

  private createTestDirectory(): string {
    const testDir = join(
      tmpdir(),
      `integration-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    );
    mkdirSync(testDir, { recursive: true });
    return testDir;
  }

  /**
   * Sets up the process environment with test values
   */
  setupEnvironment(envVars: Record<string, string>): void {
    process.env = { ...this.originalEnv, ...envVars };
  }

  /**
   * Creates a test .env file with specified content
   */
  createEnvFile(filename: string, content: string): string {
    const filePath = join(this.testDir, filename);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  /**
   * Gets the test directory path
   */
  getTestDir(): string {
    return this.testDir;
  }

  /**
   * Cleans up test environment and restores original state
   */
  cleanup(): void {
    process.env = this.originalEnv;
    try {
      rmSync(this.testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Secret manager builder for fluent test setup
 */
export class SecretManagerBuilder {
  private providers: ISecretProvider[] = [];
  private registry?: SecretProviderRegistry;
  private options?: { cacheTtl?: number };

  /**
   * Adds a provider to the manager
   */
  withProvider(provider: ISecretProvider): this {
    this.providers.push(provider);
    return this;
  }

  /**
   * Adds multiple providers to the manager
   */
  withProviders(providers: ISecretProvider[]): this {
    this.providers.push(...providers);
    return this;
  }

  /**
   * Sets the registry for dynamic provider management
   */
  withRegistry(registry: SecretProviderRegistry): this {
    this.registry = registry;
    return this;
  }

  /**
   * Configures caching options
   */
  withCaching(cacheTtl: number): this {
    this.options = { cacheTtl };
    return this;
  }

  /**
   * Builds and returns the configured SecretManager
   */
  build(): SecretManager {
    return new SecretManager(this.providers, this.registry, this.options);
  }
}

/**
 * Registry builder for fluent registry setup
 */
export class RegistryBuilder {
  private providers: Map<string, ISecretProvider> = new Map();

  /**
   * Registers a provider with the given name
   */
  withProvider(name: string, provider: ISecretProvider): this {
    this.providers.set(name, provider);
    return this;
  }

  /**
   * Builds and returns the configured registry
   */
  build(): SecretProviderRegistry {
    const registry = new SecretProviderRegistry();
    for (const [name, provider] of this.providers) {
      registry.register(name, provider);
    }
    return registry;
  }
}

/**
 * Cache testing utilities
 */
export const cacheHelpers = {
  /**
   * Waits for cache to expire
   */
  async waitForCacheExpiration(timeoutMs: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, timeoutMs + 5));
  },

  /**
   * Tests cache behavior with environment changes
   */
  async testCacheBehavior(
    manager: SecretManager,
    envKey: string,
    initialValue: string,
    changedValue: string,
  ): Promise<{
    beforeChange: Record<string, string>;
    afterChangeWithCache: Record<string, string>;
    afterCacheClear: Record<string, string>;
  }> {
    // Initial resolution
    const beforeChange = await manager.resolveSecrets();

    // Change environment
    process.env[envKey] = changedValue;

    // Resolution with cache (should still return old value)
    const afterChangeWithCache = await manager.resolveSecrets();

    // Clear cache and resolve again
    manager.clearCache();
    const afterCacheClear = await manager.resolveSecrets();

    return { beforeChange, afterChangeWithCache, afterCacheClear };
  },
};

/**
 * Common assertion helpers
 */
export const assertionHelpers = {
  /**
   * Asserts that secrets match expected values exactly
   */
  expectSecretsToEqual(
    actual: Record<string, string>,
    expected: Record<string, string>,
  ): void {
    expect(actual).toEqual(expected);
  },

  /**
   * Asserts that all expected secrets are present (allows extra secrets)
   */
  expectSecretsToContain(
    actual: Record<string, string>,
    expectedSubset: Record<string, string>,
  ): void {
    for (const [key, value] of Object.entries(expectedSubset)) {
      expect(actual).toHaveProperty(key, value);
    }
  },

  /**
   * Asserts that provider names are correct
   */
  expectProviderNames(manager: SecretManager, expectedNames: string[]): void {
    const providerNames = manager.getProviderNames();
    for (const name of expectedNames) {
      expect(providerNames).toContain(name);
    }
  },
};

/**
 * Test scenario runner for parameterized tests
 */
export interface TestScenario<T> {
  name: string;
  setup: T;
  expectedResult: Record<string, string>;
}

export async function runTestScenarios<T>(
  scenarios: TestScenario<T>[],
  setupFunction: (
    setup: T,
    envManager: TestEnvironmentManager,
  ) => Promise<SecretManager>,
): Promise<void> {
  for (const scenario of scenarios) {
    const envManager = new TestEnvironmentManager();
    try {
      const manager = await setupFunction(scenario.setup, envManager);
      const result = await manager.resolveSecrets();
      assertionHelpers.expectSecretsToEqual(result, scenario.expectedResult);
    } finally {
      envManager.cleanup();
    }
  }
}

/**
 * Provider setup utilities
 */
export const providerSetup = {
  /**
   * Creates a failing provider for error testing
   */
  createFailingProvider(invalidPath: string) {
    return new DotEnvProvider({ path: invalidPath });
  },

  /**
   * Creates providers for mixed success/failure scenarios
   */
  createMixedProviders(
    envManager: TestEnvironmentManager,
    workingEnv: Record<string, string>,
    failurePath: string,
    allowedKeys?: string[],
  ): ISecretProvider[] {
    envManager.setupEnvironment(workingEnv);

    const processProvider = allowedKeys
      ? new ProcessEnvProvider({
          type: 'process',
          config: { allowlist: allowedKeys },
        })
      : new ProcessEnvProvider({
          type: 'process',
          config: { prefix: 'WORKING_' },
        });

    return [
      processProvider,
      new DotEnvProvider({ path: failurePath }),
      new InlineProvider({
        type: 'inline',
        config: { values: { INLINE_SECRET: 'inline-secret' } },
      }),
    ];
  },
};
