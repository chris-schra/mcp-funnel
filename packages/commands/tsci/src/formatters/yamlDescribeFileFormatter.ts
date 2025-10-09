/**
 * YAML formatter for describe_file tool output
 *
 * Formats TypeDoc reflections as YAML with structure optimized for AI consumption.
 * Includes inline signatures, line numbers, JSDoc summaries, and members.
 *
 * Output format (from PLAN.md):
 * ```yaml
 * symbols:
 *   - inline: "function foo(x: string): number"
 *     line: 42
 *     docLines: 30-41  # Optional - only if JSDoc exists
 *     summary: Optional JSDoc summary
 *     members:  # Only for interfaces/classes/types
 *       - "bar: string #L45"
 * ```
 */

/* eslint-disable max-lines */
// Complex formatter with multiple signature builders for different TypeDoc reflection kinds

import type { DeclarationReflection, ParameterReflection, Reflection } from 'typedoc';
import { ReflectionKind } from 'typedoc';
import { stringify as yamlStringify } from 'yaml';
import type { SummaryExtractor } from '../core/summaryExtractor.js';
import { PassthroughSummaryExtractor } from '../core/summaryExtractor.js';
import { getSymbolEndLine } from '../util/astPositions.js';

/**
 * Symbol data structure for YAML output
 */
interface YAMLSymbol {
  inline: string;
  lines: string; // Line range: "42" or "42-50"
  docLines?: string;
  summary?: string;
  members?: string[];
}

/**
 * YAML formatter output structure
 */
interface YAMLOutput {
  symbols: YAMLSymbol[];
}

/**
 * Options for YAML formatting
 */
export interface YAMLFormatOptions {
  /**
   * Custom summary extractor (defaults to PassthroughSummaryExtractor)
   */
  summaryExtractor?: SummaryExtractor;

  /**
   * Include members for interfaces/classes/types (default: true)
   */
  includeMembers?: boolean;
}

/**
 * YAML formatter for TypeDoc reflections
 *
 * Transforms DeclarationReflection[] into YAML format for AI-optimized file structure preview.
 */
export class YAMLDescribeFileFormatter {
  private summaryExtractor: SummaryExtractor;

  public constructor(options: YAMLFormatOptions = {}) {
    this.summaryExtractor = options.summaryExtractor || new PassthroughSummaryExtractor();
  }

  /**
   * Format reflections as YAML
   *
   * @param reflections - Array of TypeDoc declaration reflections
   * @param options - Formatting options
   * @returns YAML formatted string
   */
  public format(reflections: DeclarationReflection[], options: YAMLFormatOptions = {}): string {
    const includeMembers = options.includeMembers ?? true;

    const symbols: YAMLSymbol[] = reflections
      .filter((reflection) => this.shouldIncludeSymbol(reflection))
      .map((reflection) => this.formatSymbol(reflection, includeMembers));

    const output: YAMLOutput = { symbols };

    return yamlStringify(output, {
      lineWidth: 0, // Disable line wrapping for long signatures
      defaultStringType: 'QUOTE_DOUBLE',
      defaultKeyType: 'PLAIN',
    });
  }

  /**
   * Format a single reflection into YAML symbol structure
   *
   * @param reflection - TypeDoc declaration reflection
   * @param includeMembers - Whether to include members for interfaces/classes/types
   * @returns YAML symbol object
   */
  private formatSymbol(reflection: DeclarationReflection, includeMembers: boolean): YAMLSymbol {
    // Calculate line range using TypeScript AST parsing
    const lines = this.calculateLineRange(reflection);

    const symbol: YAMLSymbol = {
      inline: this.createInlineSignature(reflection),
      lines,
    };

    // For functions, docs are stored on the first signature child, not the function itself
    // Use signature reflection for doc extraction if available
    const docsReflection =
      reflection.kind === ReflectionKind.Function && reflection.signatures?.[0]
        ? reflection.signatures[0]
        : reflection;

    // Add docLines if JSDoc comment exists
    const docLines = this.calculateDocLines(docsReflection);
    if (docLines) {
      symbol.docLines = docLines;
    }

    // Add summary if available
    const summary = this.summaryExtractor.extract(docsReflection);
    if (summary) {
      symbol.summary = summary;
    }

    // Add members for interfaces/classes/types
    if (includeMembers && this.shouldIncludeMembers(reflection)) {
      const members = this.extractMembers(reflection);
      if (members.length > 0) {
        symbol.members = members;
      }
    }

    return symbol;
  }

  /**
   * Calculate line range for a symbol using TypeScript AST.
   *
   * Returns:
   * - "42" for single-line symbols
   * - "42-50" for multi-line symbols
   * - "0" if source information is missing
   *
   * @param reflection - TypeDoc declaration reflection
   * @returns Line range string
   */
  private calculateLineRange(reflection: DeclarationReflection): string {
    const source = reflection.sources?.[0];
    if (!source || !source.line) {
      return '0';
    }

    const startLine = source.line;
    const filePath = source.fullFileName;
    const character = source.character;

    try {
      const endLine = getSymbolEndLine(filePath, startLine, character);

      // Return single line number or range
      return startLine === endLine ? `${startLine}` : `${startLine}-${endLine}`;
    } catch (_error) {
      // Fallback: just return start line if AST parsing fails
      return `${startLine}`;
    }
  }

  /**
   * Create inline signature for a reflection
   *
   * Examples:
   * - "function foo(x: string): number"
   * - "interface Bar"
   * - "class Baz extends Base"
   * - "type Qux = string | number"
   *
   * @param reflection - TypeDoc declaration reflection
   * @returns Inline signature string
   */
  private createInlineSignature(reflection: DeclarationReflection): string {
    const kind = ReflectionKind[reflection.kind] || 'unknown';

    switch (reflection.kind) {
      case ReflectionKind.Function:
        return this.createFunctionSignature(reflection);

      case ReflectionKind.Class:
        return this.createClassSignature(reflection);

      case ReflectionKind.Interface:
        return this.createInterfaceSignature(reflection);

      case ReflectionKind.TypeAlias:
        return this.createTypeAliasSignature(reflection);

      case ReflectionKind.Enum:
        return `enum ${reflection.name}`;

      case ReflectionKind.Variable:
        return this.createVariableSignature(reflection);

      case ReflectionKind.Namespace:
        return `namespace ${reflection.name}`;

      default:
        return `${kind.toLowerCase()} ${reflection.name}`;
    }
  }

  /**
   * Create function signature
   *
   * @param reflection - Function reflection
   * @returns Signature string
   */
  private createFunctionSignature(reflection: DeclarationReflection): string {
    let signature = `function ${reflection.name}`;

    if (reflection.signatures && reflection.signatures.length > 0) {
      const sig = reflection.signatures[0];

      // Type parameters
      if (sig.typeParameters && sig.typeParameters.length > 0) {
        const params = sig.typeParameters.map((tp) => tp.name).join(', ');
        signature += `<${params}>`;
      }

      // Parameters
      const params =
        sig.parameters
          ?.map((p) => `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`)
          .join(', ') || '';
      signature += `(${params})`;

      // Return type
      const returnType = sig.type?.toString() || 'void';
      signature += `: ${returnType}`;
    } else {
      signature += '()';
    }

    return signature;
  }

  /**
   * Create class signature
   *
   * @param reflection - Class reflection
   * @returns Signature string
   */
  private createClassSignature(reflection: DeclarationReflection): string {
    let signature = `class ${reflection.name}`;

    // Type parameters
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Extends
    if (reflection.extendedTypes && reflection.extendedTypes.length > 0) {
      signature += ` extends ${reflection.extendedTypes[0].toString()}`;
    }

    // Implements
    if (reflection.implementedTypes && reflection.implementedTypes.length > 0) {
      const implemented = reflection.implementedTypes.map((t) => t.toString()).join(', ');
      signature += ` implements ${implemented}`;
    }

    return signature;
  }

  /**
   * Create interface signature
   *
   * @param reflection - Interface reflection
   * @returns Signature string
   */
  private createInterfaceSignature(reflection: DeclarationReflection): string {
    let signature = `interface ${reflection.name}`;

    // Type parameters
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Extends
    if (reflection.extendedTypes && reflection.extendedTypes.length > 0) {
      const extended = reflection.extendedTypes.map((t) => t.toString()).join(', ');
      signature += ` extends ${extended}`;
    }

    return signature;
  }

  /**
   * Create type alias signature
   *
   * @param reflection - Type alias reflection
   * @returns Signature string
   */
  private createTypeAliasSignature(reflection: DeclarationReflection): string {
    let signature = `type ${reflection.name}`;

    // Type parameters
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Type definition
    if (reflection.type) {
      signature += ` = ${reflection.type.toString()}`;
    }

    return signature;
  }

  /**
   * Create variable signature
   *
   * @param reflection - Variable reflection
   * @returns Signature string
   */
  private createVariableSignature(reflection: DeclarationReflection): string {
    let signature = `const ${reflection.name}`;

    if (reflection.type) {
      signature += `: ${reflection.type.toString()}`;
    }

    return signature;
  }

  /**
   * Calculate JSDoc line range (docLines field)
   *
   * Strategy:
   * 1. Get comment text from reflection
   * 2. Count newlines in comment
   * 3. Subtract from declaration line to get start line
   * 4. Return range as "start-end" or undefined if no comment
   *
   * Accepts any Reflection type (DeclarationReflection, SignatureReflection, etc.)
   * since comment extraction works on the base Reflection type.
   *
   * @param reflection - TypeDoc reflection (any type)
   * @returns Line range string (e.g., "30-41") or undefined
   */
  private calculateDocLines(reflection: Reflection): string | undefined {
    const comment = reflection.comment;
    if (!comment || !comment.summary || comment.summary.length === 0) {
      return undefined;
    }

    // sources exists on DeclarationReflection and SignatureReflection
    const sources = (reflection as DeclarationReflection).sources;
    const declarationLine = sources?.[0]?.line;
    if (!declarationLine) {
      return undefined;
    }

    // Get full comment text (summary + block tags)
    const summaryText = comment.summary.map((part) => part.text).join('');
    const blockText =
      comment.blockTags?.map((tag) => tag.content.map((part) => part.text).join('')).join('\n') ||
      '';
    const fullCommentText = summaryText + (blockText ? '\n' + blockText : '');

    // Count newlines in comment (including opening /** and closing */)
    const newlineCount = (fullCommentText.match(/\n/g) || []).length;

    // JSDoc typically has:
    // - /** opening (1 line)
    // - content (N lines)
    // - */ closing (might be on last content line or separate)
    // So total lines = newlineCount + 2 (for /** and */)
    const commentLines = newlineCount + 2;

    const startLine = declarationLine - commentLines;
    const endLine = declarationLine - 1;

    // Sanity check
    if (startLine < 1 || endLine < startLine) {
      return undefined;
    }

    return `${startLine}-${endLine}`;
  }

  /**
   * Extract members from a reflection (for interfaces/classes/types)
   *
   * Format: "name: Type #L<line>" for properties
   *         "name(params): ReturnType #L<line>" for methods
   *
   * @param reflection - TypeDoc declaration reflection
   * @returns Array of member strings
   */
  private extractMembers(reflection: DeclarationReflection): string[] {
    if (!reflection.children || reflection.children.length === 0) {
      return [];
    }

    return reflection.children.map((child) => this.formatMember(child));
  }

  /**
   * Format a single member (property, method, or constructor)
   *
   * @param child - Child reflection representing a member
   * @returns Formatted member string
   */
  private formatMember(child: DeclarationReflection): string {
    const lineRef = this.getLineReference(child);

    // Handle constructors and methods (both have signatures)
    if (this.isCallableMethod(child)) {
      return this.formatCallableMember(child, lineRef);
    }

    // Handle properties
    return this.formatPropertyMember(child, lineRef);
  }

  /**
   * Get line reference for a member
   *
   * @param child - Child reflection
   * @returns Line reference string (e.g., "#L42")
   */
  private getLineReference(child: DeclarationReflection): string {
    const line = child.sources?.[0]?.line || 0;
    return `#L${line}`;
  }

  /**
   * Check if a member is a callable (constructor or method with signatures)
   *
   * @param child - Child reflection
   * @returns true if callable
   */
  private isCallableMethod(child: DeclarationReflection): boolean {
    return (
      (child.kind === ReflectionKind.Constructor || child.kind === ReflectionKind.Method) &&
      !!child.signatures
    );
  }

  /**
   * Format a callable member (constructor or method)
   *
   * @param child - Child reflection
   * @param lineRef - Line reference string
   * @returns Formatted callable member string
   */
  private formatCallableMember(child: DeclarationReflection, lineRef: string): string {
    const sig = child.signatures![0];
    const params = this.formatParameters(sig.parameters);

    // Constructors don't have return types in member list
    if (child.kind === ReflectionKind.Constructor) {
      return `${child.name}(${params}) ${lineRef}`;
    }

    // Methods include return type
    const returnType = sig.type?.toString() || 'void';
    return `${child.name}(${params}): ${returnType} ${lineRef}`;
  }

  /**
   * Format a property member
   *
   * @param child - Child reflection
   * @param lineRef - Line reference string
   * @returns Formatted property member string
   */
  private formatPropertyMember(child: DeclarationReflection, lineRef: string): string {
    const optional = child.flags?.isOptional ? '?' : '';
    const type = child.type?.toString() || 'any';
    return `${child.name}${optional}: ${type} ${lineRef}`;
  }

  /**
   * Format parameters for a callable member
   *
   * @param parameters - Array of parameter reflections
   * @returns Formatted parameters string
   */
  private formatParameters(parameters: ParameterReflection[] | undefined): string {
    return (
      parameters
        ?.map((p) => `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`)
        .join(', ') || ''
    );
  }

  /**
   * Check if a reflection should be included in output
   *
   * Filters out:
   * - Private/protected members (already handled by TypeDoc excludePrivate option)
   * - Internal members (excluded by TypeDoc excludeInternal option)
   * - Non-exported symbols (depends on use case)
   *
   * @param reflection - TypeDoc declaration reflection
   * @returns true if symbol should be included
   */
  private shouldIncludeSymbol(reflection: DeclarationReflection): boolean {
    // Filter out private/protected
    if (reflection.flags.isPrivate || reflection.flags.isProtected) {
      return false;
    }

    // Include all others (exported and non-exported)
    return true;
  }

  /**
   * Check if a reflection should include members
   *
   * Only interfaces, classes, and type aliases with properties have members
   *
   * @param reflection - TypeDoc declaration reflection
   * @returns true if members should be extracted
   */
  private shouldIncludeMembers(reflection: DeclarationReflection): boolean {
    return (
      reflection.kind === ReflectionKind.Interface ||
      reflection.kind === ReflectionKind.Class ||
      reflection.kind === ReflectionKind.TypeAlias
    );
  }
}

/**
 * Create a YAML formatter instance
 *
 * @param options - Formatter options
 * @returns YAMLDescribeFileFormatter instance
 */
export function createYAMLDescribeFileFormatter(
  options: YAMLFormatOptions = {},
): YAMLDescribeFileFormatter {
  return new YAMLDescribeFileFormatter(options);
}

/**
 * Format reflections as YAML (convenience function)
 *
 * @param reflections - Array of TypeDoc declaration reflections
 * @param options - Formatting options
 * @returns YAML formatted string
 */
export function formatAsYAML(
  reflections: DeclarationReflection[],
  options: YAMLFormatOptions = {},
): string {
  const formatter = createYAMLDescribeFileFormatter(options);
  return formatter.format(reflections, options);
}
