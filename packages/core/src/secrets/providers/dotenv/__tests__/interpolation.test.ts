import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DotEnvProvider } from '../index.js';
import {
  createTestDirectory,
  createTestEnvFile,
  cleanupTestDirectory,
} from './test-utils.js';

describe('DotEnvProvider - Variable Interpolation', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = createTestDirectory();
  });

  afterEach(() => {
    cleanupTestDirectory(testDir);
  });

  it('should handle variable interpolation', async () => {
    // Arrange
    const envContent = [
      'HOME=/home/user',
      'PATH_WITH_VAR="$HOME/bin:$PATH"',
      'BRACED_VAR="${HOME}/projects"',
      'MIXED_VAR="$HOME/bin:${PATH}"',
      'PATH=/usr/bin:/bin',
    ].join('\n');

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.interpolation',
      envContent,
    );
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      HOME: '/home/user',
      PATH_WITH_VAR: '/home/user/bin:/usr/bin:/bin',
      BRACED_VAR: '/home/user/projects',
      MIXED_VAR: '/home/user/bin:/usr/bin:/bin',
      PATH: '/usr/bin:/bin',
    });
  });

  it('should handle undefined variable references gracefully', async () => {
    // Arrange
    const envContent = [
      'DEFINED_VAR=defined_value',
      'UNDEFINED_REF="Value with $UNDEFINED_VAR reference"',
      'BRACED_UNDEFINED="Value with ${ALSO_UNDEFINED} reference"',
      'MIXED="$DEFINED_VAR and $UNDEFINED_VAR"',
    ].join('\n');

    const envFilePath = createTestEnvFile(
      testDir,
      '.env.undefined',
      envContent,
    );
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      DEFINED_VAR: 'defined_value',
      UNDEFINED_REF: 'Value with  reference',
      BRACED_UNDEFINED: 'Value with  reference',
      MIXED: 'defined_value and ',
    });
  });

  it('should handle circular variable references', async () => {
    // Arrange
    const envContent = [
      'CIRCULAR_A="$CIRCULAR_B"',
      'CIRCULAR_B="$CIRCULAR_A"',
      'SELF_REF="$SELF_REF"',
      'NORMAL_VAR=normal_value',
    ].join('\n');

    const envFilePath = createTestEnvFile(testDir, '.env.circular', envContent);
    const provider = new DotEnvProvider({ path: envFilePath });

    // Act
    const secrets = await provider.resolveSecrets();

    // Assert
    expect(secrets).toEqual({
      CIRCULAR_A: '',
      CIRCULAR_B: '',
      SELF_REF: '',
      NORMAL_VAR: 'normal_value',
    });
  });
});
