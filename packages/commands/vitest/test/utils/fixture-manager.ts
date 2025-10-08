import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_ROOT = path.resolve(__dirname, '..', 'fixtures');

/**
 * Handle for managing temporary test fixture projects.
 *
 * Provides access to both the original fixture source and the temporary copy,
 * along with cleanup capability to remove temporary artifacts after testing.
 * @public
 */
export interface FixtureHandle {
  /** Absolute path to the copied fixture project root inside the temp directory */
  tempPath: string;
  /** Absolute path to the temporary directory containing the copied fixture */
  tempDir: string;
  /** Absolute path to the original fixture in the repository */
  sourcePath: string;
  /** Removes the temporary directory and all copied artifacts */
  cleanup(): Promise<void>;
}

/**
 * Verifies that a fixture directory exists at the specified path.
 * @param sourcePath - Absolute path to the fixture directory
 * @throws When the fixture does not exist
 * @internal
 */
async function ensureExists(sourcePath: string): Promise<void> {
  try {
    await fs.access(sourcePath);
  } catch (_error) {
    throw new Error(`Fixture not found: ${sourcePath}`);
  }
}

/**
 * Creates a temporary directory with a unique name for fixture isolation.
 * @returns Promise resolving to the absolute path of the created temporary directory
 * @internal
 */
async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'vitest-fixture-'));
}

/**
 * Recursively copies a directory tree from source to destination.
 *
 * Handles both files and directories, creating intermediate directories as needed.
 * Preserves directory structure during the copy operation.
 * Skips node_modules (for performance) and config files (loaded from source for isolation).
 * @param source - Absolute path to the source directory
 * @param destination - Absolute path where the copy should be created
 * @internal
 */
async function copyRecursive(source: string, destination: string): Promise<void> {
  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source);
    for (const entry of entries) {
      // Skip node_modules to allow vitest to resolve from parent project
      if (entry === 'node_modules') {
        continue;
      }
      // Skip vitest config files - fixtures are designed to run WITHOUT their local configs
      // This allows testing with vitest's default behavior and prevents config conflicts
      if (
        entry === 'vitest.config.ts' ||
        entry === 'vitest.config.js' ||
        entry === 'vite.config.ts' ||
        entry === 'vite.config.js'
      ) {
        continue;
      }
      await copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  await fs.copyFile(source, destination);
}

/**
 * Prepares a vitest fixture project by copying it to a temporary directory.
 *
 * Creates an isolated copy of a complete vitest project (including package.json,
 * vitest.config.ts, tsconfig.json, and source files) in a temporary location.
 * This allows vitest to write output files (.vitest directory, coverage, etc.)
 * without affecting the original fixtures.
 * @param fixtureName - Name of the fixture directory (e.g., 'basic-project', 'failing-tests')
 * @returns Promise resolving to a handle for accessing and cleaning up the fixture
 * @throws When the fixture does not exist at the specified path
 * @example
 * ```typescript
 * const fixture = await prepareVitestFixture('basic-project');
 * const session = await manager.startSession({
 *   tests: [fixture.tempPath],
 * });
 * // ... run tests ...
 * await fixture.cleanup();
 * ```
 * @public
 */
export async function prepareVitestFixture(fixtureName: string): Promise<FixtureHandle> {
  const sourcePath = path.join(FIXTURES_ROOT, fixtureName);
  await ensureExists(sourcePath);

  const tempDir = await makeTempDir();
  const destinationPath = path.join(tempDir, fixtureName);

  await copyRecursive(sourcePath, destinationPath);

  return {
    tempPath: destinationPath,
    tempDir,
    sourcePath,
    cleanup: async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    },
  };
}
