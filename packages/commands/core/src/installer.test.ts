import { describe, it, expect, beforeEach } from 'vitest';
import type { CommandManifest } from './types/index.js';
import { findMatchingCommand } from './util/index.js';

describe('CommandInstaller - packageMatchesSpec', () => {
  let mockManifest: CommandManifest;
  const match = (manifest: CommandManifest, spec: string) => findMatchingCommand(manifest, spec);

  beforeEach(() => {
    // Create a mock manifest with various package types
    mockManifest = {
      commands: [
        {
          name: 'weather-tool',
          package: 'weather-tool',
          version: '1.0.0',
          installedAt: '2023-01-01T00:00:00.000Z',
          description: 'Weather information tool',
        },
        {
          name: 'scoped-tool',
          package: '@myorg/weather-helper',
          version: '2.1.0',
          installedAt: '2023-01-02T00:00:00.000Z',
          description: 'Scoped weather helper',
        },
        {
          name: 'git-tool',
          package: '@github/actions-toolkit',
          version: '1.0.0',
          installedAt: '2023-01-03T00:00:00.000Z',
          description: 'GitHub actions toolkit',
        },
        {
          name: 'simple-tool',
          package: 'lodash',
          version: '4.17.21',
          installedAt: '2023-01-04T00:00:00.000Z',
          description: 'Utility library',
        },
      ],
      updatedAt: '2023-01-04T00:00:00.000Z',
    };
  });

  describe('exact package name matches', () => {
    it('should match exact package names', () => {
      // Access the private method for direct testing
      const result = match(mockManifest, 'weather-tool');
      expect(result?.package).toBe('weather-tool');
    });

    it('should match exact scoped package names', () => {
      const result = match(mockManifest, '@myorg/weather-helper');
      expect(result?.package).toBe('@myorg/weather-helper');
    });

    it('should return undefined for non-existent packages', () => {
      const result = match(mockManifest, 'non-existent-package');
      expect(result).toBeUndefined();
    });
  });

  describe('version specifier handling', () => {
    it('should match package names with version specifiers', () => {
      const result = match(mockManifest, 'weather-tool@1.2.3');
      expect(result?.package).toBe('weather-tool');
    });

    it('should match scoped packages with version specifiers', () => {
      const result = match(mockManifest, '@myorg/weather-helper@3.0.0');
      expect(result?.package).toBe('@myorg/weather-helper');
    });

    it('should match packages with complex version specifiers', () => {
      const result = match(mockManifest, 'lodash@^4.17.0');
      expect(result?.package).toBe('lodash');
    });

    it('should match packages with pre-release versions', () => {
      const result = match(mockManifest, 'weather-tool@1.0.0-beta.1');
      expect(result?.package).toBe('weather-tool');
    });
  });

  describe('scoped package handling', () => {
    it('should match scoped packages without @ prefix', () => {
      const result = match(mockManifest, 'myorg/weather-helper');
      expect(result?.package).toBe('@myorg/weather-helper');
    });

    it('should match scoped packages without @ prefix with version', () => {
      const result = match(mockManifest, 'myorg/weather-helper@2.0.0');
      expect(result?.package).toBe('@myorg/weather-helper');
    });

    it('should not match scope-like strings for non-scoped packages', () => {
      const result = match(mockManifest, 'weather/tool');
      expect(result).toBeUndefined();
    });
  });

  describe('git URL handling', () => {
    it('should match git+https URLs containing scoped package path', () => {
      const result = match(mockManifest, 'git+https://github.com/github/actions-toolkit.git');
      expect(result?.package).toBe('@github/actions-toolkit');
    });

    it('should match https git URLs containing scoped package path', () => {
      const result = match(mockManifest, 'https://github.com/github/actions-toolkit.git');
      expect(result?.package).toBe('@github/actions-toolkit');
    });

    it('should match complex git URLs with additional path segments', () => {
      const result = match(mockManifest, 'git+https://github.com/github/actions-toolkit.git#main');
      expect(result?.package).toBe('@github/actions-toolkit');
    });

    it('should not match git URLs that do not contain the scoped package path', () => {
      const result = match(mockManifest, 'git+https://github.com/other/different-package.git');
      expect(result).toBeUndefined();
    });
  });

  describe('false positive prevention - the critical bug fix', () => {
    it('should NOT match substring of package name', () => {
      // This is the critical test case - "weather" should NOT match "weather-tool"
      const result = match(mockManifest, 'weather');
      expect(result).toBeUndefined();
    });

    it('should NOT match packages containing the spec as substring', () => {
      // "helper" should NOT match "@myorg/weather-helper"
      const result = match(mockManifest, 'helper');
      expect(result).toBeUndefined();
    });

    it('should NOT match packages where spec is contained within', () => {
      // "org" should NOT match "@myorg/weather-helper"
      const result = match(mockManifest, 'org');
      expect(result).toBeUndefined();
    });

    it('should NOT match partial scoped package names', () => {
      // "myorg" should NOT match "@myorg/weather-helper"
      const result = match(mockManifest, 'myorg');
      expect(result).toBeUndefined();
    });

    it('should NOT match suffix substrings', () => {
      // "tool" should NOT match "weather-tool"
      const result = match(mockManifest, 'tool');
      expect(result).toBeUndefined();
    });

    it('should NOT match middle substrings', () => {
      // "ther" should NOT match "weather-tool"
      const result = match(mockManifest, 'ther');
      expect(result).toBeUndefined();
    });

    it('should NOT match case-sensitive variations', () => {
      const result = match(mockManifest, 'Weather-Tool');
      expect(result).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should handle empty string specs', () => {
      const result = match(mockManifest, '');
      expect(result).toBeUndefined();
    });

    it('should handle specs with only @ symbol', () => {
      const result = match(mockManifest, '@');
      expect(result).toBeUndefined();
    });

    it('should handle specs with only version', () => {
      const result = match(mockManifest, '@1.0.0');
      expect(result).toBeUndefined();
    });

    it('should handle malformed scoped package specs', () => {
      const result = match(mockManifest, '@/package');
      expect(result).toBeUndefined();
    });

    it('should handle multiple @ symbols correctly', () => {
      // extractPackageNameFromSpec('weather-tool@@1.0.0') returns 'weather-tool'
      // This should match the installed package
      const result = match(mockManifest, 'weather-tool@@1.0.0');
      expect(result?.package).toBe('weather-tool');
    });

    it('should handle specs with special characters', () => {
      const result = match(mockManifest, 'weather-tool#tag');
      expect(result).toBeUndefined();
    });

    it('should handle very long package names', () => {
      const longName = 'a'.repeat(1000);
      const result = match(mockManifest, longName);
      expect(result).toBeUndefined();
    });
  });

  describe('complex scenarios', () => {
    it('should handle packages with similar names but different scopes', () => {
      const complexManifest: CommandManifest = {
        commands: [
          {
            name: 'tool1',
            package: '@org1/common-tool',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'tool2',
            package: '@org2/common-tool',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      const result1 = match(complexManifest, '@org1/common-tool');
      expect(result1?.package).toBe('@org1/common-tool');

      const result2 = match(complexManifest, '@org2/common-tool');
      expect(result2?.package).toBe('@org2/common-tool');

      // Should not match the common part
      const result3 = match(complexManifest, 'common-tool');
      expect(result3).toBeUndefined();
    });

    it('should handle packages where one name is prefix of another', () => {
      const prefixManifest: CommandManifest = {
        commands: [
          {
            name: 'tool1',
            package: 'test',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'tool2',
            package: 'test-utils',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'tool3',
            package: 'test-framework-utils',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      // Should match exactly
      const result1 = match(prefixManifest, 'test');
      expect(result1?.package).toBe('test');

      const result2 = match(prefixManifest, 'test-utils');
      expect(result2?.package).toBe('test-utils');

      // Should NOT match longer names even though they contain the spec
      const result3 = match(prefixManifest, 'utils');
      expect(result3).toBeUndefined();

      const result4 = match(prefixManifest, 'framework');
      expect(result4).toBeUndefined();
    });

    it('should correctly prioritize exact matches over partial matches', () => {
      const manifest: CommandManifest = {
        commands: [
          {
            name: 'weather-exact',
            package: 'weather',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'weather-extended',
            package: 'weather-extended-tool',
            version: '1.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      const result = match(manifest, 'weather');
      expect(result?.package).toBe('weather');
      expect(result?.name).toBe('weather-exact');
    });
  });

  describe('real-world package examples', () => {
    it('should handle popular npm packages correctly', () => {
      const realWorldManifest: CommandManifest = {
        commands: [
          {
            name: 'react',
            package: 'react',
            version: '18.2.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'react-dom',
            package: 'react-dom',
            version: '18.2.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
          {
            name: 'types-react',
            package: '@types/react',
            version: '18.0.0',
            installedAt: '2023-01-01T00:00:00.000Z',
          },
        ],
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      // Should match each exactly
      expect(match(realWorldManifest, 'react')?.package).toBe('react');
      expect(match(realWorldManifest, 'react-dom')?.package).toBe('react-dom');
      expect(match(realWorldManifest, '@types/react')?.package).toBe('@types/react');

      // Should handle versions
      expect(match(realWorldManifest, 'react@18.0.0')?.package).toBe('react');
      expect(match(realWorldManifest, '@types/react@17.0.0')?.package).toBe('@types/react');

      // Should handle scoped packages without @
      expect(match(realWorldManifest, 'types/react')?.package).toBe('@types/react');
    });
  });
});
