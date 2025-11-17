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
    // Paths are relative after stripping common base
    expect(yaml).toContain('usage1.ts');
    expect(yaml).toContain('usage2.ts');
    // kind field only appears for imports
    expect(yaml.split('usage1.ts')[1].split('usage2.ts')[0]).not.toContain('kind:');
    expect(yaml.split('usage2.ts')[1]).toContain('kind: "import"');
  });

  it('should include references in compact format when available', () => {
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
    // Check for compact format with relative paths: "{kind} {name} from {file}:L{line} module {module}"
    expect(yaml).toContain('class BaseClass from baseClass.ts:L10 module ./base/BaseClass.js');
    expect(yaml).toContain(
      'interface IInterface from interface.ts:L5 module ./interfaces/IInterface.js',
    );
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

  it('should handle optional fields (summary, missing fields)', () => {
    const formatter = new YAMLDescribeSymbolFormatter();

    const withSummary: SymbolMetadata = {
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
    expect(formatter.format(withSummary)).toContain('summary: "An example interface"');

    const minimal: SymbolMetadata = {
      id: 'minimal123',
      name: 'minimalSymbol',
      kind: 64,
      kindString: 'Function',
      isExported: false,
    };
    const yaml1 = formatter.format(minimal);
    expect(yaml1).toContain('id: "minimal123"');
    expect(yaml1).not.toContain('members:');

    const fallback: SymbolMetadata = {
      id: 'fallback123',
      name: 'unknownSymbol',
      kind: 1,
      kindString: 'Unknown',
      isExported: true,
    };
    expect(formatter.format(fallback)).toContain('inline: "Unknown unknownSymbol"');
  });

  it('should extract and format members when symbolIndex is provided', () => {
    const symbolIndex = new SymbolIndex();
    const parentSymbol: SymbolMetadata = {
      id: 'parent123',
      name: 'TypeExpander',
      kind: 128,
      kindString: 'Class',
      filePath: '/path/to/typeExpander.ts',
      line: 92,
      signature: 'class TypeExpander',
      isExported: true,
      childrenIds: ['child1', 'child2', 'child3'],
    };

    const child1: SymbolMetadata = {
      id: 'child1',
      name: 'expand',
      kind: 2048,
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
      kind: 2048,
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
      kind: 1024,
      kindString: 'Property',
      filePath: '/path/to/typeExpander.ts',
      line: 94,
      signature: 'config: Required<TypeExpanderConfig>',
      isExported: true,
      parentId: 'parent123',
    };

    symbolIndex.add(parentSymbol);
    symbolIndex.add(child1);
    symbolIndex.add(child2);
    symbolIndex.add(child3);

    const formatter = new YAMLDescribeSymbolFormatter({ symbolIndex });
    const yaml = formatter.format(parentSymbol);

    expect(yaml).toContain('members:');
    expect(yaml).toContain('expand(type: Type): TypeExpansionResult #L155');
    expect(yaml).toContain(
      'expandByType(type: Type, depth: number, visitedTypes: Set<string>): TypeExpansionResult #L237',
    );
    expect(yaml).toContain('config: Required<TypeExpanderConfig> #L94');
  });

  it('should extract members for interface symbols', () => {
    const symbolIndex = new SymbolIndex();
    const interfaceSymbol: SymbolMetadata = {
      id: 'interface123',
      name: 'IOptions',
      kind: 256,
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
      kind: 1024,
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
      kind: 1024,
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

    const formatter1 = new YAMLDescribeSymbolFormatter();
    expect(formatter1.format(symbol)).not.toContain('members:');

    const symbolIndex = new SymbolIndex();
    symbolIndex.add(symbol);
    const formatter2 = new YAMLDescribeSymbolFormatter({ symbolIndex, includeMembers: false });
    expect(formatter2.format(symbol)).not.toContain('members:');
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

    const child1: SymbolMetadata = {
      id: 'child1',
      name: 'property',
      kind: 1024,
      kindString: 'Property',
      signature: 'property: string',
      isExported: true,
      parentId: 'parent999',
    };

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
    expect(yaml).toContain('property: string #L0');
    expect(yaml).toContain('unknownMember #L42');
  });

  it('should format references with optional fields in compact format', () => {
    const withPreview: SymbolMetadata = {
      id: 'preview123',
      name: 'MyClass',
      kind: 128,
      kindString: 'Class',
      filePath: '/path/to/myClass.ts',
      line: 20,
      signature: 'class MyClass',
      isExported: true,
      references: [
        {
          name: 'ExpansionResult',
          kind: 'interface',
          from: '/path/to/types.ts',
          line: 44,
          module: './module.js',
          preview: '⟶ { expanded: string; truncated: boolean; ... }',
        },
        {
          name: 'LocalType',
          kind: 'type',
          from: '/path/to/localTypes.ts',
          line: 15,
          module: '',
        },
      ],
    };

    const formatter = new YAMLDescribeSymbolFormatter();
    const yaml = formatter.format(withPreview);

    expect(yaml).toContain('references:');
    // Preview no longer includes redundant type name, and paths are relative
    expect(yaml).toContain(
      'interface ExpansionResult from types.ts:L44 module ./module.js ⟶ { expanded: string; truncated: boolean; ... }',
    );
    expect(yaml).toContain('type LocalType from localTypes.ts:L15');
    expect(yaml).not.toContain('module ""');
  });
});
