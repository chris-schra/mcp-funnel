/**
 * Helper service for extracting type references from TypeDoc reflections
 *
 * Analyzes TypeDoc type structures to find all reflection IDs that are
 * referenced through:
 * - Direct type properties
 * - Extended/implemented types
 * - Type parameters
 * - Signature parameters and return types
 * - Child reflections
 *
 * Used by ImportGraphBuilder to construct file dependency graphs.
 */

import type {
  DeclarationReflection,
  ReferenceType,
  SomeType,
  ArrayType,
  UnionType,
  IntersectionType,
  TupleType,
  ConditionalType,
  IndexedAccessType,
  MappedType,
  ReflectionType,
  TypeOperatorType,
  TemplateLiteralType,
  QueryType,
  OptionalType,
  RestType,
  NamedTupleMember,
} from 'typedoc';

/**
 * Extracts reflection IDs from TypeDoc type structures
 */
export class TypeReferenceExtractor {
  /**
   * Extract all reflection IDs referenced by a symbol's types
   *
   * @param reflection - Declaration reflection to analyze
   * @returns Set of referenced reflection IDs
   */
  public extract(reflection: DeclarationReflection): Set<number> {
    const references = new Set<number>();

    this.extractFromReflectionTypes(reflection, references);
    this.extractFromSignatures(reflection, references);
    this.extractFromChildren(reflection, references);

    return references;
  }

  /**
   * Extract type references from reflection's direct types
   *
   * @param reflection - Declaration reflection to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromReflectionTypes(
    reflection: DeclarationReflection,
    references: Set<number>,
  ): void {
    if (reflection.type) {
      this.extractFromType(reflection.type, references);
    }

    if (reflection.extendedTypes) {
      for (const type of reflection.extendedTypes) {
        this.extractFromType(type, references);
      }
    }

    if (reflection.implementedTypes) {
      for (const type of reflection.implementedTypes) {
        this.extractFromType(type, references);
      }
    }

    if (reflection.typeParameters) {
      for (const typeParam of reflection.typeParameters) {
        if (typeParam.type) {
          this.extractFromType(typeParam.type, references);
        }
      }
    }
  }

  /**
   * Extract type references from function/method signatures
   *
   * @param reflection - Declaration reflection to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromSignatures(reflection: DeclarationReflection, references: Set<number>): void {
    if (!reflection.signatures) {
      return;
    }

    for (const sig of reflection.signatures) {
      if (sig.parameters) {
        for (const param of sig.parameters) {
          if (param.type) {
            this.extractFromType(param.type, references);
          }
        }
      }

      if (sig.type) {
        this.extractFromType(sig.type, references);
      }

      if (sig.typeParameters) {
        for (const typeParam of sig.typeParameters) {
          if (typeParam.type) {
            this.extractFromType(typeParam.type, references);
          }
        }
      }
    }
  }

  /**
   * Extract type references from child reflections recursively
   *
   * @param reflection - Declaration reflection to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromChildren(reflection: DeclarationReflection, references: Set<number>): void {
    if (!reflection.children) {
      return;
    }

    for (const child of reflection.children) {
      const childRefs = this.extract(child);
      for (const ref of childRefs) {
        references.add(ref);
      }
    }
  }

  /**
   * Recursively extract reflection IDs from a type
   *
   * @param type - Type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  // eslint-disable-next-line complexity -- Type dispatch pattern is inherently complex but well-organized
  private extractFromType(type: SomeType, references: Set<number>): void {
    switch (type.type) {
      case 'reference':
        this.extractFromReferenceType(type as ReferenceType, references);
        break;
      case 'union':
      case 'intersection':
        this.extractFromCompositeTypes(type as UnionType | IntersectionType, references);
        break;
      case 'array':
      case 'optional':
      case 'rest':
      case 'typeOperator':
        this.extractFromWrapperTypes(
          type as ArrayType | OptionalType | RestType | TypeOperatorType,
          references,
        );
        break;
      case 'tuple':
        this.extractFromTupleType(type as TupleType, references);
        break;
      case 'conditional':
        this.extractFromConditionalType(type as ConditionalType, references);
        break;
      case 'indexedAccess':
        this.extractFromIndexedAccessType(type as IndexedAccessType, references);
        break;
      case 'mapped':
        this.extractFromMappedType(type as MappedType, references);
        break;
      case 'reflection':
        this.extractFromReflectionType(type as ReflectionType, references);
        break;
      case 'templateLiteral':
        this.extractFromTemplateLiteralType(type as TemplateLiteralType, references);
        break;
      case 'query':
        this.extractFromType((type as QueryType).queryType, references);
        break;
      case 'namedTupleMember':
        this.extractFromType((type as NamedTupleMember).element, references);
        break;
      case 'intrinsic':
      case 'literal':
      case 'unknown':
      case 'inferred':
      case 'predicate':
        break;
    }
  }

  /**
   * Extract from reference type (points to other symbols)
   *
   * @param type - Reference type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromReferenceType(type: ReferenceType, references: Set<number>): void {
    const reflection = type.reflection;
    if (reflection && typeof reflection !== 'number') {
      references.add(reflection.id);
    }

    if (type.typeArguments) {
      for (const arg of type.typeArguments) {
        this.extractFromType(arg, references);
      }
    }
  }

  /**
   * Extract from composite types (union, intersection)
   *
   * @param type - Union or intersection type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromCompositeTypes(
    type: UnionType | IntersectionType,
    references: Set<number>,
  ): void {
    for (const t of type.types) {
      this.extractFromType(t, references);
    }
  }

  /**
   * Extract from wrapper types (array, optional, rest, typeOperator)
   *
   * @param type - Wrapper type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromWrapperTypes(
    type: ArrayType | OptionalType | RestType | TypeOperatorType,
    references: Set<number>,
  ): void {
    const elementType =
      'elementType' in type ? type.elementType : (type as TypeOperatorType).target;
    this.extractFromType(elementType, references);
  }

  /**
   * Extract from tuple type
   *
   * @param type - Tuple type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromTupleType(type: TupleType, references: Set<number>): void {
    for (const element of type.elements) {
      this.extractFromType(element, references);
    }
  }

  /**
   * Extract from conditional type
   *
   * @param type - Conditional type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromConditionalType(type: ConditionalType, references: Set<number>): void {
    this.extractFromType(type.checkType, references);
    this.extractFromType(type.extendsType, references);
    this.extractFromType(type.trueType, references);
    this.extractFromType(type.falseType, references);
  }

  /**
   * Extract from indexed access type
   *
   * @param type - Indexed access type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromIndexedAccessType(type: IndexedAccessType, references: Set<number>): void {
    this.extractFromType(type.objectType, references);
    this.extractFromType(type.indexType, references);
  }

  /**
   * Extract from mapped type
   *
   * @param type - Mapped type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromMappedType(type: MappedType, references: Set<number>): void {
    this.extractFromType(type.parameterType, references);
    this.extractFromType(type.templateType, references);
    if (type.nameType) {
      this.extractFromType(type.nameType, references);
    }
  }

  /**
   * Extract from reflection type (inline object/function types)
   *
   * @param type - Reflection type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromReflectionType(type: ReflectionType, references: Set<number>): void {
    const childRefs = this.extract(type.declaration);
    for (const ref of childRefs) {
      references.add(ref);
    }
  }

  /**
   * Extract from template literal type
   *
   * @param type - Template literal type to analyze
   * @param references - Set to accumulate reflection IDs
   */
  private extractFromTemplateLiteralType(type: TemplateLiteralType, references: Set<number>): void {
    for (const [t] of type.tail) {
      this.extractFromType(t, references);
    }
  }
}
