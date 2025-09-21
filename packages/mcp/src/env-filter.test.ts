import { describe, it, expect } from 'vitest';
import {
  getDefaultPassthroughEnv,
  WINDOWS_REQUIRED_ENV,
} from './env-filter.js';

describe('env-filter', () => {
  it('includes core defaults on non-Windows platforms', () => {
    const defaults = getDefaultPassthroughEnv('linux');

    expect(defaults).toContain('PATH');
    expect(defaults).toContain('NODE_ENV');
    expect(defaults).not.toContain('SystemRoot');
  });

  it('adds Windows required environment variables', () => {
    const windowsDefaults = getDefaultPassthroughEnv('win32');

    expect(windowsDefaults).toContain('PATH');
    for (const variableName of WINDOWS_REQUIRED_ENV) {
      expect(windowsDefaults).toContain(variableName);
    }

    expect(new Set(windowsDefaults).size).toBe(windowsDefaults.length);
  });

  it('returns a new array instance per invocation', () => {
    const first = getDefaultPassthroughEnv('linux');
    const second = getDefaultPassthroughEnv('linux');

    expect(first).not.toBe(second);
  });
});
