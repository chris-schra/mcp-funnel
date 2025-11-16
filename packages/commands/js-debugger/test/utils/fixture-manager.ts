import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_ROOT = path.resolve(__dirname, '..', 'fixtures');

/**
 * Handle for managing temporary test fixture files.
 *
 * Provides access to both the original fixture source and the temporary copy,
 * along with cleanup capability to remove temporary artifacts after testing.
 * @public
 * @see file:./fixture-manager.ts:70 - prepareFixture implementation
 */
export interface FixtureHandle {
  /** Absolute path to the copied fixture inside the temp directory */
  tempPath: string;
  /** Absolute path to the temporary directory containing the copied fixture */
  tempDir: string;
  /** Absolute path to the original fixture in the repository */
  sourcePath: string;
  /** Removes the temporary directory and all copied artifacts */
  cleanup(): Promise<void>;
}

/**
 * Verifies that a fixture file or directory exists at the specified path.
 * @param sourcePath - Absolute path to the fixture file or directory
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
  return fs.mkdtemp(path.join(tmpdir(), 'js-debugger-fixture-'));
}

/**
 * Recursively copies a file or directory tree from source to destination.
 *
 * Handles both files and directories, creating intermediate directories as needed.
 * Preserves directory structure during the copy operation.
 * @param source - Absolute path to the source file or directory
 * @param destination - Absolute path where the copy should be created
 * @internal
 */
async function copyRecursive(source: string, destination: string): Promise<void> {
  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source);
    for (const entry of entries) {
      await copyRecursive(path.join(source, entry), path.join(destination, entry));
    }
    return;
  }

  await fs.copyFile(source, destination);
}

/**
 * Prepares a test fixture by copying it to a temporary directory.
 *
 * Creates an isolated copy of the fixture in a temporary location to allow
 * tests to modify files without affecting the original fixtures. The returned
 * handle includes a cleanup function to remove temporary artifacts.
 * @param relativePath - Path relative to the fixtures root directory
 * @returns Promise resolving to a handle for accessing and cleaning up the fixture
 * @throws When the fixture does not exist at the specified path
 * @internal
 */
async function prepareFixture(relativePath: string): Promise<FixtureHandle> {
  const sourcePath = path.join(FIXTURES_ROOT, relativePath);
  await ensureExists(sourcePath);

  const tempDir = await makeTempDir();
  const destinationPath = path.join(tempDir, path.basename(sourcePath));

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

/**
 * Prepares a Node.js test fixture for read-only debugging.
 *
 * Returns the original fixture path without copying, since debugger tests
 * are read-only and don't modify fixtures. This avoids module resolution
 * issues that arise from running TypeScript in isolated temp directories.
 * @param fixtureName - Name of the fixture file (e.g., 'console-output.js', 'breakpoint-script.ts')
 * @returns Promise resolving to a handle with the original fixture path
 * @throws When the fixture does not exist in the node fixtures directory
 * @example
 * ```typescript
 * const fixture = await prepareNodeFixture('console-output.js');
 * const session = await manager.debug(\{ platform: 'node', target: fixture.sourcePath \});
 * // ... run tests (read-only) ...
 * await fixture.cleanup(); // no-op for read-only fixtures
 * ```
 * @public
 */
export async function prepareNodeFixture(fixtureName: string): Promise<FixtureHandle> {
  const sourcePath = path.join(FIXTURES_ROOT, 'node', fixtureName);
  await ensureExists(sourcePath);

  // For read-only debugger tests, return the original path without copying
  // This preserves module resolution context (node_modules, tsconfig.json)
  return {
    tempPath: sourcePath, // No temp - use original
    tempDir: path.dirname(sourcePath),
    sourcePath,
    cleanup: async () => {
      // No-op: nothing to clean up for read-only fixtures
    },
  };
}

/**
 * Prepares a browser test fixture by copying it to a temporary directory.
 *
 * Creates an isolated copy of a browser fixture (HTML, JavaScript, or related files)
 * from the `test/fixtures/browser` directory. Tests can modify the copied fixture
 * without affecting the original source.
 * @param fixtureName - Name of the fixture file (e.g., 'simple-script.js', 'index.html')
 * @returns Promise resolving to a handle for accessing and cleaning up the fixture
 * @throws When the fixture does not exist in the browser fixtures directory
 * @example
 * ```typescript
 * const fixture = await prepareBrowserFixture('simple-script.js');
 * const session = await manager.debug(\{ platform: 'browser', target: fixture.tempPath \});
 * // ... run tests ...
 * await fixture.cleanup();
 * ```
 * @public
 */
export async function prepareBrowserFixture(fixtureName: string): Promise<FixtureHandle> {
  return prepareFixture(path.join('browser', fixtureName));
}

/**
 * Prepares the entire browser fixtures directory by copying it to a temporary location.
 *
 * Creates an isolated copy of all browser fixtures for tests that need access to multiple
 * fixture files or need to serve fixtures from a directory. This is particularly useful
 * for browser integration tests that require a full directory structure.
 * @returns Promise resolving to a handle for accessing the fixtures root and cleaning up
 * @throws When the browser fixtures directory does not exist
 * @example
 * ```typescript
 * const fixturesRoot = await prepareBrowserFixturesRoot();
 * // Serve all fixtures from fixturesRoot.tempPath
 * const server = await serveDirectory(fixturesRoot.tempPath);
 * // ... run tests ...
 * await fixturesRoot.cleanup();
 * ```
 * @public
 * @see file:../../src/adapters/browser-adapter.integration.test.ts:166 - Usage example
 */
export async function prepareBrowserFixturesRoot(): Promise<FixtureHandle> {
  return prepareFixture('browser');
}
