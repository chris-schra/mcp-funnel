import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import { resolve } from 'path';
import { createBackup } from './backup.js';

describe('createBackup', () => {
  const testDir = resolve(process.cwd(), '.tmp/test-backup');
  const testFile = resolve(testDir, 'test-config.json');
  const testContent = '{"servers": {"test": {"command": "echo"}}}';

  beforeEach(async () => {
    // Create test directory and file
    await fs.mkdir(testDir, { recursive: true });
    await fs.writeFile(testFile, testContent, 'utf8');
  });

  afterEach(async () => {
    // Clean up test directory
    try {
      const files = await fs.readdir(testDir);
      for (const file of files) {
        await fs.unlink(resolve(testDir, file));
      }
      await fs.rmdir(testDir);
    } catch {
      // Ignore cleanup errors
    }
  });

  it('creates timestamp-based backup when file exists', async () => {
    const before = Date.now();
    const backupPath = await createBackup(testFile);
    const after = Date.now();

    expect(backupPath).toBeTruthy();
    expect(backupPath).toMatch(/\.backup\.\d+$/);

    // Check that backup was created
    const backupExists = await fs.access(backupPath!).then(
      () => true,
      () => false,
    );
    expect(backupExists).toBe(true);

    // Check that timestamp is in expected range
    const timestamp = parseInt(backupPath!.split('.').pop()!);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(after);

    // Check that backup contains same content
    const backupContent = await fs.readFile(backupPath!, 'utf8');
    expect(backupContent).toBe(testContent);
  });

  it('returns null for non-existent files', async () => {
    const nonExistentFile = resolve(testDir, 'does-not-exist.json');
    const result = await createBackup(nonExistentFile);
    expect(result).toBeNull();
  });

  it('creates multiple backups with different timestamps', async () => {
    const backup1 = await createBackup(testFile);

    // Wait a bit to ensure different timestamps
    await new Promise((resolve) => setTimeout(resolve, 10));

    const backup2 = await createBackup(testFile);

    expect(backup1).toBeTruthy();
    expect(backup2).toBeTruthy();
    expect(backup1).not.toBe(backup2);

    // Both backups should exist
    const backup1Exists = await fs.access(backup1!).then(
      () => true,
      () => false,
    );
    const backup2Exists = await fs.access(backup2!).then(
      () => true,
      () => false,
    );
    expect(backup1Exists).toBe(true);
    expect(backup2Exists).toBe(true);
  });
});
