import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TsValidateCommand } from './command.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

/**
 * Creates a temporary directory for test isolation.
 * @param prefix - Prefix for the temporary directory name
 * @returns Promise resolving to the temporary directory path
 * @internal
 */
async function mkTmpDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

/**
 * Recursively removes a directory and all its contents.
 * @param dir - Directory path to remove
 * @internal
 */
async function rmrf(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Tests compact output mode behavior for validation results.
 * @see file:../command.ts - TsValidateCommand implementation
 */
describe('MCP output compact option', () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await mkTmpDir('ts-validate-compact-');
  });
  afterAll(async () => {
    await rmrf(tmp);
  });

  it('omits clean files when compact=true (default)', async () => {
    const proj = path.join(tmp, 'clean1');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'ok.ts');
    await fs.writeFile(file, 'export const A = 1;\n');

    const cmd = new TsValidateCommand();
    const res = await cmd.executeToolViaMCP('ts-validate', {
      files: [file],
      fix: false,
      cache: true,
    });
    expect(res.content).toBeDefined();
    const txt = res.content![0].text as string;
    const payload = JSON.parse(txt);
    expect(payload.fileResults).toBeDefined();
    expect(Object.keys(payload.fileResults).length).toBe(0);
  });

  it('includes clean files when compact=false', async () => {
    const proj = path.join(tmp, 'clean2');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'ok.ts');
    await fs.writeFile(file, 'export const B = 2;\n');

    const cmd = new TsValidateCommand();
    const res = await cmd.executeToolViaMCP('ts-validate', {
      files: [file],
      fix: false,
      cache: true,
      compact: false,
    });
    expect(res.content).toBeDefined();
    const txt = res.content![0].text as string;
    const payload = JSON.parse(txt);
    expect(payload.fileResults).toBeDefined();
    expect(Object.keys(payload.fileResults)).toContain(file);
    expect(Array.isArray(payload.fileResults[file])).toBe(true);
    expect(payload.fileResults[file].length).toBe(0);
  });
});
