import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MonorepoValidator } from './validator.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

async function mkTmpDir(prefix: string): Promise<string> {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  return base;
}

async function rmrf(dir: string) {
  await fs.rm(dir, { recursive: true, force: true });
}

describe('MonorepoValidator local-first resolution', () => {
  let tmp: string;

  beforeAll(async () => {
    tmp = await mkTmpDir('ts-validate-');
  });

  afterAll(async () => {
    await rmrf(tmp);
  });

  it('handles empty folder gracefully (no files)', async () => {
    const v = new MonorepoValidator();
    const summary = await v.validate({
      glob: path.join(tmp, '**/*.{ts,tsx,js,jsx,json}'),
    });
    expect(summary.totalFiles).toBe(0);
    expect(summary.filesWithErrors).toBe(0);
  });

  it('handles missing ESLint and tsconfig gracefully', async () => {
    const proj = path.join(tmp, 'proj1');
    await fs.mkdir(proj, { recursive: true });
    const file = path.join(proj, 'index.ts');
    await fs.writeFile(file, 'const x: number = 1\n');

    const v = new MonorepoValidator();
    const summary = await v.validate({ files: [file] });
    const statuses = summary.toolStatuses.reduce(
      (acc, s) => {
        acc[s.tool] = s;
        return acc;
      },
      {} as Record<string, (typeof summary.toolStatuses)[number]>,
    );

    expect(statuses['prettier']).toBeTruthy();
    expect(['ok', 'failed']).toContain(statuses['prettier'].status);
    expect(statuses['eslint']).toBeTruthy();
    expect(['ok', 'skipped', 'failed']).toContain(statuses['eslint'].status);
    expect(statuses['typescript']).toBeTruthy();
    expect(statuses['typescript'].status).toBe('skipped');
    expect(statuses['typescript'].reason).toBe('no-tsconfig');
  });

  it('uses available prettier and eslint locally when compatible', async () => {
    const proj = path.join(tmp, 'proj2');
    await fs.mkdir(proj, { recursive: true });
    const nm = path.join(proj, 'node_modules');
    const prettierDir = path.join(nm, 'prettier');
    const eslintDir = path.join(nm, 'eslint');
    await fs.mkdir(prettierDir, { recursive: true });
    await fs.mkdir(eslintDir, { recursive: true });

    // Local ESM prettier stub
    await fs.writeFile(
      path.join(prettierDir, 'index.mjs'),
      [
        'export async function getFileInfo(_) { return { ignored: false }; }',
        'export async function resolveConfig(_) { return {}; }',
        'export async function format(source, _opts) { return source; }',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(prettierDir, 'package.json'),
      JSON.stringify(
        { name: 'prettier', version: '3.2.0', module: 'index.mjs' },
        null,
        2,
      ),
    );

    // Local ESM eslint stub
    await fs.writeFile(
      path.join(eslintDir, 'index.mjs'),
      [
        'export class ESLint {',
        '  constructor(_opts) {}',
        '  async isPathIgnored(_f) { return false; }',
        '  async lintFiles(files) {',
        '    return files.map(f => ({ filePath: f, output: undefined, messages: [], fixableErrorCount: 0, fixableWarningCount: 0 }));',
        '  }',
        '}',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(eslintDir, 'package.json'),
      JSON.stringify(
        { name: 'eslint', version: '9.10.0', module: 'index.mjs' },
        null,
        2,
      ),
    );

    const file = path.join(proj, 'index.ts');
    await fs.writeFile(file, 'const y: number = 2\n');

    // Ensure our process CWD is the project for local resolution
    const prevCwd = process.cwd();
    try {
      process.chdir(proj);
      const v = new MonorepoValidator();
      const summary = await v.validate({ files: [file] });
      const statuses = summary.toolStatuses.reduce(
        (acc, s) => {
          acc[s.tool] = s;
          return acc;
        },
        {} as Record<string, (typeof summary.toolStatuses)[number]>,
      );

      expect(statuses['prettier']).toBeTruthy();
      expect(statuses['prettier'].status).toBe('ok');
      expect(statuses['eslint']).toBeTruthy();
      expect(statuses['eslint'].status).toBe('ok');
    } finally {
      process.chdir(prevCwd);
    }
  });
});
