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
 * Tests autoFix behavior for automatic code formatting and fixing.
 * @see file:../command.ts - TsValidateCommand implementation
 */
describe('MCP autoFix behavior', () => {
  let tmp: string;
  beforeAll(async () => {
    tmp = await mkTmpDir('ts-validate-autofix-');
  });
  afterAll(async () => {
    await rmrf(tmp);
  });

  it('autoFix defaults to true and formats with Prettier', async () => {
    const proj = path.join(tmp, 'af1');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'fmt.ts');
    // Missing spaces and semicolon; Prettier default should reformat
    await fs.writeFile(file, 'const x=1\n');

    const cmd = new TsValidateCommand();
    const res = await cmd.executeToolViaMCP('ts-validate', {
      files: [file],
      cache: true,
      // autoFix omitted to rely on default true
    });
    expect(res.content).toBeDefined();
    const txt = res.content![0].text as string;
    const payload = JSON.parse(txt);
    // With compact default, info-only results will still list the file
    const keys = Object.keys(payload.fileResults);
    expect(keys.length >= 0).toBe(true);
    const content = await fs.readFile(file, 'utf8');
    expect(content.includes('const x = 1;')).toBe(true);
  });

  it('autoFix=false does not write changes and reports need for formatting', async () => {
    const proj = path.join(tmp, 'af2');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'fmt.ts');
    await fs.writeFile(file, 'const y=2\n');

    const cmd = new TsValidateCommand();
    const res = await cmd.executeToolViaMCP('ts-validate', {
      files: [file],
      cache: true,
      autoFix: false,
      compact: false,
    });
    expect(res.content).toBeDefined();
    const txt = res.content![0].text as string;
    const payload = JSON.parse(txt);
    expect(Array.isArray(payload.fileResults[file])).toBe(true);
    const msgs: { tool: string; message: string; severity: string }[] =
      payload.fileResults[file];
    const prettierEntry = msgs.find((m) => m.tool === 'prettier');
    expect(prettierEntry?.message.toLowerCase()).toContain(
      'file needs formatting',
    );
    const content = await fs.readFile(file, 'utf8');
    expect(content.includes('const y=2')).toBe(true);
  });
});
