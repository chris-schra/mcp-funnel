/**
 * Signature generation utilities for TypeDoc reflections
 * Extracted from SymbolCollector to maintain file size limits
 */

import type { DeclarationReflection, SignatureReflection, ParameterReflection } from 'typedoc';
import { ReflectionKind } from 'typedoc';

/**
 * Generate an inline type signature for a symbol.
 * This provides a quick summary for AI consumption.
 *
 * @param reflection - Declaration reflection to generate signature for
 * @returns Type signature string
 */
export function generateSignature(reflection: DeclarationReflection): string {
  switch (reflection.kind) {
    case ReflectionKind.Class:
      return generateClassSignature(reflection);

    case ReflectionKind.Interface:
      return generateInterfaceSignature(reflection);

    case ReflectionKind.TypeAlias:
      return generateTypeAliasSignature(reflection);

    case ReflectionKind.Function:
      return generateFunctionSignature(reflection);

    case ReflectionKind.Variable:
      return generateVariableSignature(reflection);

    case ReflectionKind.Enum:
      return generateEnumSignature(reflection);

    case ReflectionKind.Namespace:
      return generateNamespaceSignature(reflection);

    case ReflectionKind.Method:
      return generateMethodSignature(reflection);

    case ReflectionKind.Constructor:
      return generateConstructorSignature(reflection);

    case ReflectionKind.Property:
      return generatePropertySignature(reflection);

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
function generateClassSignature(reflection: DeclarationReflection): string {
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
function generateInterfaceSignature(reflection: DeclarationReflection): string {
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
function generateTypeAliasSignature(reflection: DeclarationReflection): string {
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
function generateFunctionSignature(reflection: DeclarationReflection): string {
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
function generateVariableSignature(reflection: DeclarationReflection): string {
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
function generateEnumSignature(reflection: DeclarationReflection): string {
  return `enum ${reflection.name}`;
}

/**
 * Generate signature for a namespace declaration
 * Example: "namespace Foo"
 *
 * @param reflection - Namespace reflection
 * @returns Namespace signature string
 */
function generateNamespaceSignature(reflection: DeclarationReflection): string {
  return `namespace ${reflection.name}`;
}

/**
 * Generate signature for a method
 * Example: "expand(type: Type): TypeExpansionResult"
 *
 * @param reflection - Method reflection
 * @returns Method signature string
 */
function generateMethodSignature(reflection: DeclarationReflection): string {
  if (reflection.signatures && reflection.signatures.length > 0) {
    const sig: SignatureReflection = reflection.signatures[0];

    let signature = reflection.name;

    // Add type parameters if present
    if (sig.typeParameters && sig.typeParameters.length > 0) {
      const params = sig.typeParameters.map((tp) => tp.name).join(', ');
      signature += `<${params}>`;
    }

    // Build parameter list
    const params = sig.parameters
      ?.map(
        (p: ParameterReflection) =>
          `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`,
      )
      .join(', ');

    signature += `(${params || ''})`;

    // Build return type
    const returnType = sig.type?.toString() || 'void';
    signature += `: ${returnType}`;

    return signature;
  }

  return reflection.type?.toString() || '';
}

/**
 * Generate signature for a constructor
 * Example: "constructor(config: TypeExpanderConfig)"
 *
 * @param reflection - Constructor reflection
 * @returns Constructor signature string
 */
function generateConstructorSignature(reflection: DeclarationReflection): string {
  if (reflection.signatures && reflection.signatures.length > 0) {
    const sig: SignatureReflection = reflection.signatures[0];

    // Build parameter list
    const params = sig.parameters
      ?.map(
        (p: ParameterReflection) =>
          `${p.name}${p.flags?.isOptional ? '?' : ''}: ${p.type?.toString() || 'any'}`,
      )
      .join(', ');

    return `constructor(${params || ''})`;
  }

  return 'constructor()';
}

/**
 * Generate signature for a property
 * Example: "readonly name: string"
 *
 * @param reflection - Property reflection
 * @returns Property signature string
 */
function generatePropertySignature(reflection: DeclarationReflection): string {
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
