/**
 * Symbol collector for extracting metadata from TypeDoc reflections
 * Cherry-picked from POC's enhancedLoader.ts
 */

import {
  type ProjectReflection,
  type Reflection,
  type DeclarationReflection,
  type SignatureReflection,
  type ParameterReflection,
  type SourceReference,
  ReflectionKind,
} from 'typedoc';
import { normalize } from 'path';
import type { SymbolMetadata } from '../types/index.js';

/**
 * Collects symbol metadata from TypeDoc reflections
 */
export class SymbolCollector {
  /**
   * Collect a single symbol from a reflection
   *
   * @param reflection - TypeDoc reflection to collect from
   * @returns Symbol metadata
   */
  public collect(reflection: Reflection): SymbolMetadata {
    const declReflection = reflection as DeclarationReflection;
    const sourceFile: SourceReference | undefined = declReflection.sources?.[0];
    const rawPath = sourceFile?.fullFileName || sourceFile?.fileName;
    const normalizedFilePath = this.normalizeFilePath(rawPath);

    return {
      id: this.generateStableId(reflection),
      name: reflection.name,
      kind: reflection.kind,
      kindString: ReflectionKind[reflection.kind] as string,
      filePath: normalizedFilePath,
      line: sourceFile?.line,
      column: sourceFile?.character,
      signature: this.generateSignature(declReflection),
      isExported: this.isExported(declReflection),
      parentId: reflection.parent ? this.generateStableId(reflection.parent) : null,
      childrenIds: declReflection.children?.map((c) => this.generateStableId(c)) || [],
    };
  }

  /**
   * Collect all symbols from a TypeDoc project
   *
   * @param project - TypeDoc project reflection
   * @returns Array of symbol metadata
   */
  public collectFromProject(project: ProjectReflection): SymbolMetadata[] {
    const reflections = project.getReflectionsByKind(ReflectionKind.All);
    return reflections.map((reflection) => this.collect(reflection));
  }

  /**
   * Generate an inline type signature for a symbol.
   * This provides a quick summary for AI consumption.
   *
   * @param reflection - Declaration reflection to generate signature for
   * @returns Type signature string
   */
  private generateSignature(reflection: DeclarationReflection): string {
    switch (reflection.kind) {
      case ReflectionKind.Class:
        return this.generateClassSignature(reflection);

      case ReflectionKind.Interface:
        return this.generateInterfaceSignature(reflection);

      case ReflectionKind.TypeAlias:
        return this.generateTypeAliasSignature(reflection);

      case ReflectionKind.Function:
        return this.generateFunctionSignature(reflection);

      case ReflectionKind.Variable:
        return this.generateVariableSignature(reflection);

      case ReflectionKind.Enum:
        return this.generateEnumSignature(reflection);

      case ReflectionKind.Namespace:
        return this.generateNamespaceSignature(reflection);

      case ReflectionKind.Method:
        return this.generateMethodSignature(reflection);

      case ReflectionKind.Property:
        return this.generatePropertySignature(reflection);

      default:
        // Fallback for unhandled kinds
        return reflection.type?.toString() || '';
    }
  }

  /**
   * Generate signature for a class declaration
   * Example: "class Foo<T> extends Base implements IFoo, IBar"
   *
   * @param reflection - Class reflection
   * @returns Class signature string
   */
  private generateClassSignature(reflection: DeclarationReflection): string {
    let signature = `class ${reflection.name}`;

    // Add type parameters if present
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Add extends clause
    if (reflection.extendedTypes && reflection.extendedTypes.length > 0) {
      signature += ` extends ${reflection.extendedTypes[0].toString()}`;
    }

    // Add implements clause
    if (reflection.implementedTypes && reflection.implementedTypes.length > 0) {
      const implemented = reflection.implementedTypes.map((t) => t.toString()).join(', ');
      signature += ` implements ${implemented}`;
    }

    return signature;
  }

  /**
   * Generate signature for an interface declaration
   * Example: "interface IFoo<T> extends Base"
   *
   * @param reflection - Interface reflection
   * @returns Interface signature string
   */
  private generateInterfaceSignature(reflection: DeclarationReflection): string {
    let signature = `interface ${reflection.name}`;

    // Add type parameters if present
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Add extends clause
    if (reflection.extendedTypes && reflection.extendedTypes.length > 0) {
      const extended = reflection.extendedTypes.map((t) => t.toString()).join(', ');
      signature += ` extends ${extended}`;
    }

    return signature;
  }

  /**
   * Generate signature for a type alias
   * Example: "type Foo<T> = string | number"
   *
   * @param reflection - Type alias reflection
   * @returns Type alias signature string
   */
  private generateTypeAliasSignature(reflection: DeclarationReflection): string {
    let signature = `type ${reflection.name}`;

    // Add type parameters if present
    if (reflection.typeParameters && reflection.typeParameters.length > 0) {
      const params = reflection.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Add type body
    if (reflection.type) {
      signature += ` = ${reflection.type.toString()}`;
    }

    return signature;
  }

  /**
   * Generate signature for a function declaration
   * Example: "function foo(x: number): string"
   *
   * @param reflection - Function reflection
   * @returns Function signature string
   */
  private generateFunctionSignature(reflection: DeclarationReflection): string {
    let signature = `function ${reflection.name}`;

    if (reflection.signatures && reflection.signatures.length > 0) {
      const sig: SignatureReflection = reflection.signatures[0];

      // Add type parameters if present
      if (sig.typeParameters && sig.typeParameters.length > 0) {
        const params = sig.typeParameters.map((tp) => tp.name).join(', ');
        signature += `<${params}>`;
      }

      // Add parameters
      const params = sig.parameters
        ?.map(
          (p: ParameterReflection) =>
            `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`,
        )
        .join(', ');
      signature += `(${params || ''})`;

      // Add return type
      const returnType = sig.type?.toString() || 'void';
      signature += `: ${returnType}`;
    } else {
      signature += '()';
    }

    return signature;
  }

  /**
   * Generate signature for a variable/constant declaration
   * Example: "const foo: string"
   *
   * @param reflection - Variable reflection
   * @returns Variable signature string
   */
  private generateVariableSignature(reflection: DeclarationReflection): string {
    let signature = `const ${reflection.name}`;

    if (reflection.type) {
      signature += `: ${reflection.type.toString()}`;
    }

    return signature;
  }

  /**
   * Generate signature for an enum declaration
   * Example: "enum Status"
   *
   * @param reflection - Enum reflection
   * @returns Enum signature string
   */
  private generateEnumSignature(reflection: DeclarationReflection): string {
    return `enum ${reflection.name}`;
  }

  /**
   * Generate signature for a namespace declaration
   * Example: "namespace Foo"
   *
   * @param reflection - Namespace reflection
   * @returns Namespace signature string
   */
  private generateNamespaceSignature(reflection: DeclarationReflection): string {
    return `namespace ${reflection.name}`;
  }

  /**
   * Generate signature for a method
   * Example: "(x: number) =\> string"
   *
   * @param reflection - Method reflection
   * @returns Method signature string
   */
  private generateMethodSignature(reflection: DeclarationReflection): string {
    if (reflection.signatures && reflection.signatures.length > 0) {
      const sig: SignatureReflection = reflection.signatures[0];

      // Build parameter list
      const params = sig.parameters
        ?.map(
          (p: ParameterReflection) =>
            `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`,
        )
        .join(', ');

      // Build return type
      const returnType = sig.type?.toString() || 'void';

      return `(${params || ''}) => ${returnType}`;
    }

    return reflection.type?.toString() || '';
  }

  /**
   * Generate signature for a property
   * Example: "readonly name: string"
   *
   * @param reflection - Property reflection
   * @returns Property signature string
   */
  private generatePropertySignature(reflection: DeclarationReflection): string {
    let signature = '';

    // Add readonly modifier if present
    if (reflection.flags?.isReadonly) {
      signature += 'readonly ';
    }

    // Add property name
    signature += reflection.name;

    // Add optional marker if present
    if (reflection.flags?.isOptional) {
      signature += '?';
    }

    // Add type
    if (reflection.type) {
      signature += `: ${reflection.type.toString()}`;
    }

    return signature;
  }

  /**
   * Generate a stable ID for a reflection.
   * Format: path.to.symbol:kind:file:line
   *
   * @param reflection - Reflection to generate ID for
   * @returns Stable identifier string
   */
  private generateStableId(reflection: Reflection): string {
    const parts: string[] = [];
    let current: Reflection | undefined = reflection;

    while (current) {
      if (current.name && current.name !== '') {
        parts.unshift(current.name);
      }
      current = current.parent;
    }

    const path = parts.join('.');
    const kind = reflection.kind;
    const declReflection = reflection as DeclarationReflection;
    const sourceFile: SourceReference | undefined = declReflection.sources?.[0];
    const location = sourceFile ? `${sourceFile.fileName}:${sourceFile.line}` : '';

    return `${path}:${kind}:${location}`;
  }

  /**
   * Check if a symbol is exported
   *
   * @param reflection - Declaration reflection to check
   * @returns True if the symbol is exported
   */
  private isExported(reflection: DeclarationReflection): boolean {
    // Check if the reflection has the exported flag
    // Note: TypeDoc doesn't have a direct isExported flag on ReflectionFlags,
    // so we check if the reflection is not private/protected and has a parent
    return !reflection.flags.isPrivate && !reflection.flags.isProtected;
  }

  /**
   * Normalize file paths to absolute paths
   *
   * @param filePath - File path to normalize
   * @returns Normalized file path or undefined
   */
  private normalizeFilePath(filePath?: string): string | undefined {
    if (!filePath) {
      return undefined;
    }
    return normalize(filePath);
  }
}
