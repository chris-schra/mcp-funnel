import { writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

export function createTestDirectory(): string {
  const testDir = join(
    tmpdir(),
    `providers-real-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
  );
  mkdirSync(testDir, { recursive: true });
  return testDir;
}

export function createTestEnvFile(
  dir: string,
  filename: string,
  content: string,
): string {
  const filePath = join(dir, filename);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

export function cleanupTestDirectory(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}