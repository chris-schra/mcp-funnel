import { describe, it, expect } from 'vitest';
import { parseTestSelection } from '../parsers.js';

describe('parseTestSelection', () => {
  describe('file detection heuristic', () => {
    it('should classify paths with slashes as files', () => {
      const result = parseTestSelection(['src/utils.test.ts', 'lib/parser.ts']);

      expect(result).toEqual({
        files: ['src/utils.test.ts', 'lib/parser.ts'],
        namePatterns: undefined,
      });
    });

    it('should classify .ts extensions as files', () => {
      const result = parseTestSelection(['utils.ts', 'parser.ts']);

      expect(result).toEqual({
        files: ['utils.ts', 'parser.ts'],
        namePatterns: undefined,
      });
    });

    it('should classify .js extensions as files', () => {
      const result = parseTestSelection(['script.js', 'module.js']);

      expect(result).toEqual({
        files: ['script.js', 'module.js'],
        namePatterns: undefined,
      });
    });

    it('should classify .tsx extensions as files', () => {
      const result = parseTestSelection(['Component.tsx']);

      expect(result).toEqual({
        files: ['Component.tsx'],
        namePatterns: undefined,
      });
    });

    it('should classify .jsx extensions as files', () => {
      const result = parseTestSelection(['Widget.jsx']);

      expect(result).toEqual({
        files: ['Widget.jsx'],
        namePatterns: undefined,
      });
    });

    it('should classify strings without slashes or extensions as name patterns', () => {
      const result = parseTestSelection(['should work correctly', 'edge case']);

      expect(result).toEqual({
        files: undefined,
        namePatterns: ['should work correctly', 'edge case'],
      });
    });

    it('should handle mixed files and name patterns', () => {
      const result = parseTestSelection([
        'src/utils.test.ts',
        'should handle errors',
        'parser.js',
        'validates input',
      ]);

      expect(result).toEqual({
        files: ['src/utils.test.ts', 'parser.js'],
        namePatterns: ['should handle errors', 'validates input'],
      });
    });
  });

  describe('edge cases', () => {
    it('should return empty object for undefined input', () => {
      const result = parseTestSelection(undefined);

      expect(result).toEqual({});
    });

    it('should return empty object for empty array', () => {
      const result = parseTestSelection([]);

      expect(result).toEqual({});
    });

    it('should handle single file', () => {
      const result = parseTestSelection(['test.ts']);

      expect(result).toEqual({
        files: ['test.ts'],
        namePatterns: undefined,
      });
    });

    it('should handle single name pattern', () => {
      const result = parseTestSelection(['my test']);

      expect(result).toEqual({
        files: undefined,
        namePatterns: ['my test'],
      });
    });

    it('should classify relative paths as files', () => {
      const result = parseTestSelection(['./test.spec.ts', '../lib/utils']);

      expect(result).toEqual({
        files: ['./test.spec.ts', '../lib/utils'],
        namePatterns: undefined,
      });
    });

    it('should classify absolute paths as files', () => {
      const result = parseTestSelection(['/home/user/project/test']);

      expect(result).toEqual({
        files: ['/home/user/project/test'],
        namePatterns: undefined,
      });
    });

    it('should not return arrays when no items match category', () => {
      const filesOnly = parseTestSelection(['test.ts']);
      expect(filesOnly.namePatterns).toBeUndefined();

      const patternsOnly = parseTestSelection(['my pattern']);
      expect(patternsOnly.files).toBeUndefined();
    });
  });
});
