/**
 * Test for YAMLDescribeSymbolFormatter
 *
 * Tests YAML output format for symbol metadata
 */

import { describe, it, expect } from 'vitest';
import { YAMLDescribeSymbolFormatter } from './yamlDescribeSymbolFormatter.js';
import type { SymbolMetadata } from '../types/symbols.js';

describe('YAMLDescribeSymbolFormatter', () => {
  it('should format basic symbol metadata as YAML', () => {
    const symbol: SymbolMetadata = {
      id: 'aB3xYz9p',
      name: 'TypeExpander',
      kind: 128, // Class
      kindString: 'Class',
      filePath: '/path/to/typeExpander.ts',
      line: 92,
      signature: 'class TypeExpander',
      isExported: true,
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Verify YAML structure includes all required fields
    expect(yaml).toContain('id: "aB3xYz9p"');
    expect(yaml).toContain('inline: "class TypeExpander"');
    expect(yaml).toContain('line: 92');
  });

  it('should include usages when available', () => {
    const symbol: SymbolMetadata = {
      id: 'test123',
      name: 'myFunction',
      kind: 64, // Function
      kindString: 'Function',
      filePath: '/path/to/source.ts',
      line: 10,
      signature: 'function myFunction()',
      isExported: true,
      usages: [
        {
          file: '/path/to/usage1.ts',
          lines: [15, 20, 25],
          kind: 'usage',
        },
        {
          file: '/path/to/usage2.ts',
          lines: [5],
          kind: 'import',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Verify usages are included
    expect(yaml).toContain('usages:');
    expect(yaml).toContain('file: "/path/to/usage1.ts"');
    expect(yaml).toContain('lines: "[15,20,25]"');
    expect(yaml).toContain('file: "/path/to/usage2.ts"');
    expect(yaml).toContain('lines: "[5]"');

    // Verify kind field only appears for imports
    const usageBlocks = yaml.split('file: "/path/to/usage1.ts"');
    const usage1Block = usageBlocks[1].split('file: "/path/to/usage2.ts"')[0];
    const usage2Block = usageBlocks[1].split('file: "/path/to/usage2.ts"')[1];

    expect(usage1Block).not.toContain('kind:');
    expect(usage2Block).toContain('kind: "import"');
  });

  it('should include references when available', () => {
    const symbol: SymbolMetadata = {
      id: 'ref123',
      name: 'MyClass',
      kind: 128, // Class
      kindString: 'Class',
      filePath: '/path/to/myClass.ts',
      line: 20,
      signature: 'class MyClass',
      isExported: true,
      references: [
        {
          name: 'BaseClass',
          kind: 'class',
          from: '/path/to/baseClass.ts',
          line: 10,
          module: './base/BaseClass.js',
        },
        {
          name: 'IInterface',
          kind: 'interface',
          from: '/path/to/interface.ts',
          line: 5,
          module: './interfaces/IInterface.js',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Verify references are included
    expect(yaml).toContain('references:');
    expect(yaml).toContain('name: "BaseClass"');
    expect(yaml).toContain('kind: "class"');
    expect(yaml).toContain('from: "/path/to/baseClass.ts"');
    expect(yaml).toContain('line: 10');
    expect(yaml).toContain('module: "./base/BaseClass.js"');
    expect(yaml).toContain('name: "IInterface"');
    expect(yaml).toContain('kind: "interface"');
  });

  it('should exclude usages when includeUsages is false', () => {
    const symbol: SymbolMetadata = {
      id: 'test123',
      name: 'myFunction',
      kind: 64,
      kindString: 'Function',
      filePath: '/path/to/source.ts',
      line: 10,
      signature: 'function myFunction()',
      isExported: true,
      usages: [
        {
          file: '/path/to/usage1.ts',
          lines: [15, 20],
          kind: 'usage',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter({ includeUsages: false });
    const yaml = formatter.format(symbol);

    // Verify usages are NOT included
    expect(yaml).not.toContain('usages:');
    expect(yaml).not.toContain('/path/to/usage1.ts');
  });

  it('should exclude references when includeReferences is false', () => {
    const symbol: SymbolMetadata = {
      id: 'ref123',
      name: 'MyClass',
      kind: 128,
      kindString: 'Class',
      filePath: '/path/to/myClass.ts',
      line: 20,
      signature: 'class MyClass',
      isExported: true,
      references: [
        {
          name: 'BaseClass',
          kind: 'class',
          from: '/path/to/baseClass.ts',
          line: 10,
          module: './base/BaseClass.js',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter({ includeReferences: false });
    const yaml = formatter.format(symbol);

    // Verify references are NOT included
    expect(yaml).not.toContain('references:');
    expect(yaml).not.toContain('BaseClass');
  });

  it('should format line arrays correctly', () => {
    const symbol: SymbolMetadata = {
      id: 'lines123',
      name: 'testFunction',
      kind: 64,
      kindString: 'Function',
      filePath: '/path/to/test.ts',
      line: 1,
      signature: 'function testFunction()',
      isExported: true,
      usages: [
        {
          file: '/path/to/single.ts',
          lines: [42],
          kind: 'usage',
        },
        {
          file: '/path/to/multiple.ts',
          lines: [10, 20, 30, 40],
          kind: 'usage',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Verify line array formatting
    expect(yaml).toContain('lines: "[42]"');
    expect(yaml).toContain('lines: "[10,20,30,40]"');
  });

  it('should generate summary from signature', () => {
    const symbol: SymbolMetadata = {
      id: 'summary123',
      name: 'MyInterface',
      kind: 256, // Interface
      kindString: 'Interface',
      filePath: '/path/to/interface.ts',
      line: 5,
      signature: 'interface MyInterface extends BaseInterface',
      isExported: true,
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Verify summary is included
    expect(yaml).toContain('summary:');
    expect(yaml).toContain('MyInterface');
  });

  it('should exclude summary when includeSummary is false', () => {
    const symbol: SymbolMetadata = {
      id: 'summary123',
      name: 'MyInterface',
      kind: 256,
      kindString: 'Interface',
      filePath: '/path/to/interface.ts',
      line: 5,
      signature: 'interface MyInterface',
      isExported: true,
    };

    const formatter = new YAMLDescribeSymbolFormatter({ includeSummary: false });
    const yaml = formatter.format(symbol);

    // Verify summary is NOT included
    expect(yaml).not.toContain('summary:');
  });

  it('should handle symbols without optional fields', () => {
    const symbol: SymbolMetadata = {
      id: 'minimal123',
      name: 'minimalSymbol',
      kind: 64,
      kindString: 'Function',
      isExported: false,
      // No filePath, line, signature, usages, references
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Should still produce valid YAML
    expect(yaml).toContain('id: "minimal123"');
    expect(yaml).toContain('inline:');

    // Should not include optional sections
    expect(yaml).not.toContain('usages:');
    expect(yaml).not.toContain('references:');
    expect(yaml).not.toContain('members:');
  });

  it('should use fallback inline signature when signature is missing', () => {
    const symbol: SymbolMetadata = {
      id: 'fallback123',
      name: 'unknownSymbol',
      kind: 1,
      kindString: 'Unknown',
      isExported: true,
      // No signature
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    // Should generate fallback signature
    expect(yaml).toContain('inline: "Unknown unknownSymbol"');
  });
});
