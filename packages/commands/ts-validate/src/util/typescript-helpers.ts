/**
 * Gets a suggested fix message for common TypeScript diagnostic errors.
 *
 * Maps TypeScript error codes to human-readable fix suggestions for common
 * issues like missing imports, type mismatches, and property errors.
 *
 * @param diagnostic - TypeScript diagnostic to analyze
 * @returns Suggested fix message, or undefined if no common fix is available
 *
 * @example
 * ```typescript
 * const diagnostic = program.getSemanticDiagnostics()[0];
 * const fix = getTypeScriptFix(diagnostic);
 * if (fix) {
 *   console.log(`Suggested fix: ${fix}`);
 * }
 * ```
 *
 * @public
 */
export function getTypeScriptFix(diagnostic: import('typescript').Diagnostic): string | undefined {
  // This could be expanded to detect common fixable patterns
  // For now, just identify some common cases
  const code = diagnostic.code;

  // Common auto-fixable TypeScript errors
  const fixableErrors: Record<number, string> = {
    2304: 'Add missing import',
    2339: 'Add property to type/interface',
    2345: 'Fix type mismatch',
    2551: 'Fix typo in property name',
    7006: 'Add type annotation',
    2741: 'Add missing properties',
    2322: 'Fix type assignment',
    2769: 'Fix overload signature',
  };

  return fixableErrors[code];
}
