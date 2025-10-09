/**
 * Symbol collector for extracting metadata from TypeDoc reflections
 * Cherry-picked from POC's enhancedLoader.ts
 */

import {
  type ProjectReflection,
  type Reflection,
  type DeclarationReflection,
  type SourceReference,
  ReflectionKind,
} from 'typedoc';
import { normalize, relative, isAbsolute } from 'path';
import { createHash } from 'crypto';
import type { SymbolMetadata } from '../types/index.js';
import { generateSignature } from './signatureGenerator.js';

/**
 * Collects symbol metadata from TypeDoc reflections
 */
export class SymbolCollector {
  /**
   * Create a new SymbolCollector
   *
   * @param projectRoot - Absolute path to project root (used for making paths relative in IDs)
   */
  public constructor(private projectRoot?: string) {}
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

    // Extract JSDoc summary
    // For functions and methods, docs are stored on the first signature, not the function/method itself
    const docsReflection =
      (declReflection.kind === ReflectionKind.Function ||
        declReflection.kind === ReflectionKind.Method) &&
      declReflection.signatures?.[0]
        ? declReflection.signatures[0]
        : declReflection;

    const summary = this.extractJSDocSummary(docsReflection);

    return {
      id: this.generateStableId(reflection),
      name: reflection.name,
      kind: reflection.kind,
      kindString: ReflectionKind[reflection.kind] as string,
      filePath: normalizedFilePath,
      line: sourceFile?.line,
      column: sourceFile?.character,
      signature: generateSignature(declReflection),
      summary,
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
   * Generate a stable hashed ID for a reflection.
   * Uses SHA-256 hash of symbolPath:kind:relativeFilePath (without line number)
   * and returns 8-char base64url encoding of first 6 bytes (48 bits).
   *
   * Token savings: ~58 chars → 8 chars (e.g., "aB3xYz9p")
   *
   * @param reflection - Reflection to generate ID for
   * @returns Stable 8-character hash identifier
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

    const symbolPath = parts.join('.');
    const kind = reflection.kind;
    const declReflection = reflection as DeclarationReflection;
    const sourceFile: SourceReference | undefined = declReflection.sources?.[0];

    // Use relative path (without line number) for deterministic hashing
    const filePath = sourceFile?.fullFileName || sourceFile?.fileName;
    const relativeFilePath = filePath ? this.makeRelativePath(filePath) : '';

    // Hash input: symbolPath:kind:relativeFilePath (WITHOUT line number for stability)
    const hashInput = `${symbolPath}:${kind}:${relativeFilePath}`;

    // Generate 48-bit hash (6 bytes) and encode as base64url (8 chars)
    const hash = createHash('sha256').update(hashInput).digest();
    return hash.subarray(0, 6).toString('base64url'); // First 6 bytes = 48 bits, URL-safe
  }

  /**
   * Convert an absolute path to a relative path from project root
   *
   * @param absolutePath - Absolute file path
   * @returns Relative path from project root, or original path if no project root set
   */
  private makeRelativePath(absolutePath: string): string {
    if (!this.projectRoot || !isAbsolute(absolutePath)) {
      return absolutePath;
    }
    return relative(this.projectRoot, absolutePath);
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
   * Extract JSDoc summary from a reflection's comment
   *
   * @param reflection - Reflection to extract JSDoc from
   * @returns Summary text or undefined if no comment
   */
  private extractJSDocSummary(reflection: Reflection): string | undefined {
    // TypeDoc stores JSDoc comments in reflection.comment
    // summary is a CommentDisplayPart array that needs to be concatenated
    const summaryParts = reflection.comment?.summary;
    if (!summaryParts || summaryParts.length === 0) {
      return undefined;
    }

    // Concatenate all summary parts into single string and trim
    const summaryText = summaryParts
      .map((part) => part.text)
      .join('')
      .trim();
    return summaryText || undefined;
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
