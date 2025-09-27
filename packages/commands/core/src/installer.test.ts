import { describe, it, expect, beforeEach } from 'vitest';
import { type CommandManifest } from './installer.js';
import { TestableCommandInstaller } from './installer.test-harness.js';

// Test data helpers
const createBasicManifest = (): CommandManifest => ({
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
});

const createScopedManifest = (): CommandManifest => ({
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
});

const createPrefixManifest = (): CommandManifest => ({
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
});

const createRealWorldManifest = (): CommandManifest => ({
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
});

describe('CommandInstaller - packageMatchesSpec', () => {
  let mockManifest: CommandManifest;
  let installer: TestableCommandInstaller;

  // Test utilities
  const expectMatch = (spec: string, expectedPackage: string) => {
    const result = installer.testFindMatchingCommand(mockManifest, spec);
    expect(result?.package).toBe(expectedPackage);
  };

  const expectNoMatch = (spec: string) => {
    const result = installer.testFindMatchingCommand(mockManifest, spec);
    expect(result).toBeUndefined();
  };

  beforeEach(() => {
    installer = new TestableCommandInstaller();
    mockManifest = createBasicManifest();
  });

  describe('package name matching and version handling', () => {
    it('should match exact package names', () => {
      expectMatch('weather-tool', 'weather-tool');
      expectMatch('@myorg/weather-helper', '@myorg/weather-helper');
    });

    it('should return undefined for non-existent packages', () => {
      expectNoMatch('non-existent-package');
    });

    it('should match package names with version specifiers', () => {
      expectMatch('weather-tool@1.2.3', 'weather-tool');
      expectMatch('@myorg/weather-helper@3.0.0', '@myorg/weather-helper');
      expectMatch('lodash@^4.17.0', 'lodash');
      expectMatch('weather-tool@1.0.0-beta.1', 'weather-tool');
    });
  });

  describe('scoped package handling', () => {
    it('should match scoped packages without @ prefix', () => {
      expectMatch('myorg/weather-helper', '@myorg/weather-helper');
      expectMatch('myorg/weather-helper@2.0.0', '@myorg/weather-helper');
    });

    it('should not match scope-like strings for non-scoped packages', () => {
      expectNoMatch('weather/tool');
    });
  });

  describe('git URL handling', () => {
    const gitUrlTestCases = [
      'git+https://github.com/github/actions-toolkit.git',
      'https://github.com/github/actions-toolkit.git',
      'git+https://github.com/github/actions-toolkit.git#main',
    ];

    gitUrlTestCases.forEach((url) => {
      it(`should match ${url.includes('git+https') ? 'git+https' : 'https'} URLs`, () => {
        expectMatch(url, '@github/actions-toolkit');
      });
    });

    it('should not match git URLs that do not contain the scoped package path', () => {
      expectNoMatch('git+https://github.com/other/different-package.git');
    });

    it('should NOT match git URLs with additional path segments (false positive prevention)', () => {
      expectNoMatch('git+https://github.com/other/myorg/weather-helper.git');
      expectNoMatch('git+https://github.com/org/github/actions-toolkit.git');
    });

    it('should NOT match git URLs where package appears as substring', () => {
      expectNoMatch('git+https://github.com/bigmyorg/weather-helper-tools.git');
    });
  });

  describe('false positive prevention - the critical bug fix', () => {
    const falsePositiveTestCases = [
      { spec: 'weather', description: 'substring of package name' },
      {
        spec: 'helper',
        description: 'packages containing the spec as substring',
      },
      { spec: 'org', description: 'packages where spec is contained within' },
      { spec: 'myorg', description: 'partial scoped package names' },
      { spec: 'tool', description: 'suffix substrings' },
      { spec: 'ther', description: 'middle substrings' },
      { spec: 'Weather-Tool', description: 'case-sensitive variations' },
    ];

    falsePositiveTestCases.forEach(({ spec, description }) => {
      it(`should NOT match ${description}`, () => {
        expectNoMatch(spec);
      });
    });
  });

  describe('edge cases', () => {
    const edgeCaseTestCases = [
      { spec: '', description: 'empty string specs' },
      { spec: '@', description: 'specs with only @ symbol' },
      { spec: '@1.0.0', description: 'specs with only version' },
      { spec: '@/package', description: 'malformed scoped package specs' },
      {
        spec: 'weather-tool#tag',
        description: 'specs with special characters',
      },
      { spec: 'a'.repeat(1000), description: 'very long package names' },
    ];

    edgeCaseTestCases.forEach(({ spec, description }) => {
      it(`should handle ${description}`, () => {
        expectNoMatch(spec);
      });
    });

    it('should handle multiple @ symbols correctly', () => {
      expectMatch('weather-tool@@1.0.0', 'weather-tool');
    });
  });

  describe('complex scenarios', () => {
    it('should handle packages with similar names but different scopes', () => {
      const scopedManifest = createScopedManifest();
      expect(
        installer.testFindMatchingCommand(scopedManifest, '@org1/common-tool')
          ?.package,
      ).toBe('@org1/common-tool');
      expect(
        installer.testFindMatchingCommand(scopedManifest, '@org2/common-tool')
          ?.package,
      ).toBe('@org2/common-tool');
      expect(
        installer.testFindMatchingCommand(scopedManifest, 'common-tool'),
      ).toBeUndefined();
    });

    it('should handle packages where one name is prefix of another', () => {
      const prefixManifest = createPrefixManifest();
      expect(
        installer.testFindMatchingCommand(prefixManifest, 'test')?.package,
      ).toBe('test');
      expect(
        installer.testFindMatchingCommand(prefixManifest, 'test-utils')
          ?.package,
      ).toBe('test-utils');
      expect(
        installer.testFindMatchingCommand(prefixManifest, 'utils'),
      ).toBeUndefined();
      expect(
        installer.testFindMatchingCommand(prefixManifest, 'framework'),
      ).toBeUndefined();
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

      const result = installer.testFindMatchingCommand(manifest, 'weather');
      expect(result?.package).toBe('weather');
      expect(result?.name).toBe('weather-exact');
    });
  });

  describe('real-world package examples', () => {
    it('should handle popular npm packages correctly', () => {
      const realWorldManifest = createRealWorldManifest();
      const testCases = [
        { spec: 'react', expected: 'react' },
        { spec: 'react-dom', expected: 'react-dom' },
        { spec: '@types/react', expected: '@types/react' },
        { spec: 'react@18.0.0', expected: 'react' },
        { spec: '@types/react@17.0.0', expected: '@types/react' },
        { spec: 'types/react', expected: '@types/react' },
      ];

      testCases.forEach(({ spec, expected }) => {
        expect(
          installer.testFindMatchingCommand(realWorldManifest, spec)?.package,
        ).toBe(expected);
      });
    });
  });
});
