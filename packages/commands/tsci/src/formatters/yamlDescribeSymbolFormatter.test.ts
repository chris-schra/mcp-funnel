/**
 * Test for YAMLDescribeSymbolFormatter
 *
 * Tests YAML output format for symbol metadata
 */

import { describe, it, expect } from 'vitest';
import { YAMLDescribeSymbolFormatter } from './yamlDescribeSymbolFormatter.js';
import { SymbolIndex } from '../core/symbolIndex.js';
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

  it('should include usages with correct line formatting and kind field', () => {
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
        { file: '/path/to/usage1.ts', lines: [15, 20, 25], kind: 'usage' },
        { file: '/path/to/usage2.ts', lines: [5], kind: 'import' },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    expect(yaml).toContain('usages:');
    expect(yaml).toContain('lines: "[15,20,25]"');
    expect(yaml).toContain('lines: "[5]"');
    // kind field only appears for imports
    expect(yaml.split('usage1.ts')[1].split('usage2.ts')[0]).not.toContain('kind:');
    expect(yaml.split('usage2.ts')[1]).toContain('kind: "import"');
  });

  it('should include references when available', () => {
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

    expect(yaml).toContain('references:');
    expect(yaml).toContain('name: "BaseClass"');
    expect(yaml).toContain('kind: "class"');
    expect(yaml).toContain('name: "IInterface"');
  });

  it('should exclude sections when options are set to false', () => {
    const symbol: SymbolMetadata = {
      id: 'test123',
      name: 'myFunction',
      kind: 64,
      kindString: 'Function',
      filePath: '/path/to/source.ts',
      line: 10,
      signature: 'function myFunction()',
      isExported: true,
      usages: [{ file: '/path/to/usage1.ts', lines: [15, 20], kind: 'usage' }],
      references: [
        {
          name: 'BaseClass',
          kind: 'class',
          from: '/path/to/base.ts',
          line: 10,
          module: './base.js',
        },
      ],
      summary: 'A test function',
    };

    const formatter1 = new YAMLDescribeSymbolFormatter({ includeUsages: false });
    expect(formatter1.format(symbol)).not.toContain('usages:');

    const formatter2 = new YAMLDescribeSymbolFormatter({ includeReferences: false });
    expect(formatter2.format(symbol)).not.toContain('references:');

    const formatter3 = new YAMLDescribeSymbolFormatter({ includeSummary: false });
    expect(formatter3.format(symbol)).not.toContain('summary:');
  });

  it('should include summary when available', () => {
    const symbol: SymbolMetadata = {
      id: 'summary123',
      name: 'MyInterface',
      kind: 256,
      kindString: 'Interface',
      filePath: '/path/to/interface.ts',
      line: 5,
      signature: 'interface MyInterface',
      summary: 'An example interface',
      isExported: true,
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(symbol);

    expect(yaml).toContain('summary: "An example interface"');
  });

  it('should handle symbols with missing optional fields', () => {
    const symbol1: SymbolMetadata = {
      id: 'minimal123',
      name: 'minimalSymbol',
      kind: 64,
      kindString: 'Function',
      isExported: false,
    };

    const symbol2: SymbolMetadata = {
      id: 'fallback123',
      name: 'unknownSymbol',
      kind: 1,
      kindString: 'Unknown',
      isExported: true,
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml1 = formatter.format(symbol1);
    const yaml2 = formatter.format(symbol2);

    expect(yaml1).toContain('id: "minimal123"');
    expect(yaml1).not.toContain('members:');
    expect(yaml2).toContain('inline: "Unknown unknownSymbol"');
  });

  it('should extract and format members when symbolIndex is provided', () => {
    // Create symbol index
    const symbolIndex = new SymbolIndex();

    // Create parent symbol (class with members)
    const parentSymbol: SymbolMetadata = {
      id: 'parent123',
      name: 'TypeExpander',
      kind: 128, // Class
      kindString: 'Class',
      filePath: '/path/to/typeExpander.ts',
      line: 92,
      signature: 'class TypeExpander',
      isExported: true,
      childrenIds: ['child1', 'child2', 'child3'],
    };

    // Create child symbols (members)
    const child1: SymbolMetadata = {
      id: 'child1',
      name: 'expand',
      kind: 2048, // Method
      kindString: 'Method',
      filePath: '/path/to/typeExpander.ts',
      line: 155,
      signature: 'expand(type: Type): TypeExpansionResult',
      isExported: true,
      parentId: 'parent123',
    };

    const child2: SymbolMetadata = {
      id: 'child2',
      name: 'expandByType',
      kind: 2048, // Method
      kindString: 'Method',
      filePath: '/path/to/typeExpander.ts',
      line: 237,
      signature:
        'expandByType(type: Type, depth: number, visitedTypes: Set<string>): TypeExpansionResult',
      isExported: true,
      parentId: 'parent123',
    };

    const child3: SymbolMetadata = {
      id: 'child3',
      name: 'config',
      kind: 1024, // Property
      kindString: 'Property',
      filePath: '/path/to/typeExpander.ts',
      line: 94,
      signature: 'config: Required<TypeExpanderConfig>',
      isExported: true,
      parentId: 'parent123',
    };

    // Add symbols to index
    symbolIndex.add(parentSymbol);
    symbolIndex.add(child1);
    symbolIndex.add(child2);
    symbolIndex.add(child3);

    // Create formatter with symbolIndex
    const formatter = new YAMLDescribeSymbolFormatter({ symbolIndex });
    const yaml = formatter.format(parentSymbol);

    // Verify members are included
    expect(yaml).toContain('members:');
    expect(yaml).toContain('expand(type: Type): TypeExpansionResult #L155');
    expect(yaml).toContain(
      'expandByType(type: Type, depth: number, visitedTypes: Set<string>): TypeExpansionResult #L237',
    );
    expect(yaml).toContain('config: Required<TypeExpanderConfig> #L94');
  });

  it('should extract members for interface symbols', () => {
    const symbolIndex = new SymbolIndex();

    // Create interface with properties
    const interfaceSymbol: SymbolMetadata = {
      id: 'interface123',
      name: 'IOptions',
      kind: 256, // Interface
      kindString: 'Interface',
      filePath: '/path/to/types.ts',
      line: 10,
      signature: 'interface IOptions',
      isExported: true,
      childrenIds: ['prop1', 'prop2'],
    };

    const prop1: SymbolMetadata = {
      id: 'prop1',
      name: 'maxDepth',
      kind: 1024, // Property
      kindString: 'Property',
      filePath: '/path/to/types.ts',
      line: 11,
      signature: 'maxDepth: number',
      isExported: true,
      parentId: 'interface123',
    };

    const prop2: SymbolMetadata = {
      id: 'prop2',
      name: 'includePrivate',
      kind: 1024, // Property
      kindString: 'Property',
      filePath: '/path/to/types.ts',
      line: 12,
      signature: 'includePrivate?: boolean',
      isExported: true,
      parentId: 'interface123',
    };

    symbolIndex.add(interfaceSymbol);
    symbolIndex.add(prop1);
    symbolIndex.add(prop2);

    const formatter = new YAMLDescribeSymbolFormatter({ symbolIndex });
    const yaml = formatter.format(interfaceSymbol);

    expect(yaml).toContain('members:');
    expect(yaml).toContain('maxDepth: number #L11');
    expect(yaml).toContain('includePrivate?: boolean #L12');
  });

  it('should not include members when symbolIndex is not provided or includeMembers is false', () => {
    const symbol: SymbolMetadata = {
      id: 'parent456',
      name: 'MyClass',
      kind: 128,
      kindString: 'Class',
      filePath: '/path/to/myClass.ts',
      line: 20,
      signature: 'class MyClass',
      isExported: true,
      childrenIds: ['child1', 'child2'],
    };

    // Test 1: Without symbolIndex
    const formatter1 = new YAMLDescribeSymbolFormatter();
    const yaml1 = formatter1.format(symbol);
    expect(yaml1).not.toContain('members:');

    // Test 2: With symbolIndex but includeMembers: false
    const symbolIndex = new SymbolIndex();
    symbolIndex.add(symbol);
    const formatter2 = new YAMLDescribeSymbolFormatter({ symbolIndex, includeMembers: false });
    const yaml2 = formatter2.format(symbol);
    expect(yaml2).not.toContain('members:');
  });

  it('should handle edge cases in member formatting', () => {
    const symbolIndex = new SymbolIndex();

    const parentSymbol: SymbolMetadata = {
      id: 'parent999',
      name: 'MyClass',
      kind: 128,
      kindString: 'Class',
      isExported: true,
      childrenIds: ['child1', 'child2'],
    };

    // Member without line number
    const child1: SymbolMetadata = {
      id: 'child1',
      name: 'property',
      kind: 1024,
      kindString: 'Property',
      signature: 'property: string',
      isExported: true,
      parentId: 'parent999',
    };

    // Member without signature
    const child2: SymbolMetadata = {
      id: 'child2',
      name: 'unknownMember',
      kind: 1024,
      kindString: 'Property',
      line: 42,
      isExported: true,
      parentId: 'parent999',
    };

    symbolIndex.add(parentSymbol);
    symbolIndex.add(child1);
    symbolIndex.add(child2);

    const formatter = new YAMLDescribeSymbolFormatter({ symbolIndex });
    const yaml = formatter.format(parentSymbol);

    expect(yaml).toContain('members:');
    expect(yaml).toContain('property: string #L0'); // Missing line defaults to 0
    expect(yaml).toContain('unknownMember #L42'); // Missing signature uses name
  });
});
