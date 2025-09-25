import { promises as fs } from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURES_ROOT = path.resolve(__dirname, '..', 'fixtures');

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

async function ensureExists(sourcePath: string): Promise<void> {
  try {
    await fs.access(sourcePath);
  } catch (_error) {
    throw new Error(`Fixture not found: ${sourcePath}`);
  }
}

async function makeTempDir(): Promise<string> {
  return fs.mkdtemp(path.join(tmpdir(), 'js-debugger-fixture-'));
}

async function copyRecursive(
  source: string,
  destination: string,
): Promise<void> {
  const stat = await fs.stat(source);

  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    const entries = await fs.readdir(source);
    for (const entry of entries) {
      await copyRecursive(
        path.join(source, entry),
        path.join(destination, entry),
      );
    }
    return;
  }

  await fs.copyFile(source, destination);
}

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

export async function prepareNodeFixture(
  fixtureName: string,
): Promise<FixtureHandle> {
  return prepareFixture(path.join('node', fixtureName));
}

export async function prepareBrowserFixture(
  fixtureName: string,
): Promise<FixtureHandle> {
  return prepareFixture(path.join('browser', fixtureName));
}

export async function prepareBrowserFixturesRoot(): Promise<FixtureHandle> {
  return prepareFixture('browser');
}
