import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Creates a temporary test directory with a unique name.
 *
 * @returns Absolute path to the created temporary directory
 */
export function createTestDirectory(): string {
  const testDir = join(
    tmpdir(),
    `providers-real-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

/**
 * Creates a test environment file in the specified directory.
 *
 * @param dir - Directory path to write the file to
 * @param filename - Name of the .env file to create
 * @param content - Content to write to the file
 * @returns Absolute path to the created file
 */
export function createTestEnvFile(dir: string, filename: string, content: string): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Removes a test directory and all its contents.
 *
 * @param dir - Directory path to remove recursively
 */
export function cleanupTestDirectory(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}
