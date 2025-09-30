import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  resolveSecretsFromConfig,
  clearSecretManagerCache,
} from './secret-resolver.js';
import type { SecretProviderConfig } from './provider-configs.js';

/**
 * Creates a DotEnv provider configuration for testing.
 * @param path - Path to the .env file
 * @param name - Optional name for the provider
 * @returns DotEnv provider configuration object
 */
function createDotEnvConfig(path: string, name?: string): SecretProviderConfig {
  return {
    name,
    type: 'dotenv',
    config: {
      path,
    },
  } as const;
}

describe('secret-resolver caching', () => {
  let workDir: string;

  beforeEach(() => {
    clearSecretManagerCache();
    workDir = mkdtempSync(join(tmpdir(), 'secret-resolver-test-'));
  });

  afterEach(() => {
    rmSync(workDir, { recursive: true, force: true });
    clearSecretManagerCache();
  });

  it('reuses cached SecretManager instances for identical configurations', async () => {
    const envPath = join(workDir, '.env');
    writeFileSync(envPath, 'CACHE_VALUE=initial', 'utf-8');

    const providers: SecretProviderConfig[] = [
      createDotEnvConfig(envPath, 'cached-env'),
    ];

    const first = await resolveSecretsFromConfig(providers, workDir);
    expect(first.CACHE_VALUE).toBe('initial');

    writeFileSync(envPath, 'CACHE_VALUE=updated', 'utf-8');

    const second = await resolveSecretsFromConfig(providers, workDir);
    expect(second.CACHE_VALUE).toBe('initial');
  });
});
