/**
 * Utility functions for ScopeInspector.
 *
 * Contains helper functions for value extraction, type mapping, and variable creation
 * used during CDP scope inspection operations.
 * @internal
 */

import type { Scope, Variable } from '../../types/index.js';
import type {
  CDPScope,
  CDPPropertyDescriptor,
  CDPValue,
} from './scope-inspector-types.js';

/**
 * Maps CDP scope types to our Scope interface types.
 *
 * CDP supports more granular scope types (module, script, eval, block) than
 * our public Scope interface. These are mapped to their closest equivalent,
 * with less common types defaulting to 'local'.
 * @param cdpType - CDP scope type from callFrame.scopeChain[].type
 * @returns Mapped scope type matching Scope['type'] union
 * @internal
 */
export function mapScopeType(cdpType: CDPScope['type']): Scope['type'] {
  switch (cdpType) {
    case 'global':
      return 'global';
    case 'local':
      return 'local';
    case 'closure':
      return 'closure';
    case 'with':
      return 'with';
    case 'catch':
      return 'catch';
    // Map less common CDP types to closest equivalent
    case 'module':
    case 'script':
    case 'eval':
    case 'block':
      return 'local'; // Treat as local scope
    default:
      return 'local'; // Default fallback
  }
}

/**
 * Extracts the actual value from a CDP value object.
 *
 * CDP represents values differently depending on their type:
 * - Primitives (string, number, boolean, undefined): value field contains the actual value
 * - null: Special case with type='object' and value=null
 * - Complex objects with objectId: Returns description string (full object inspection requires separate call)
 * - Simple objects without objectId: Returns value or description
 * @param cdpValue - CDP value object from property descriptors or evaluation results
 * @returns Extracted JavaScript value - primitives as-is, complex objects as description strings
 * @internal
 */
export function extractValue(cdpValue: CDPValue): unknown {
  // For primitive types, use the value directly
  if (
    cdpValue.type === 'string' ||
    cdpValue.type === 'number' ||
    cdpValue.type === 'boolean' ||
    cdpValue.type === 'undefined'
  ) {
    return cdpValue.value;
  }

  // For null, return null regardless of the value field
  if (cdpValue.type === 'object' && cdpValue.value === null) {
    return null;
  }

  // For objects without objectId, use description or value
  if (cdpValue.type === 'object' && !cdpValue.objectId) {
    return cdpValue.value ?? cdpValue.description ?? '[Object]';
  }

  // For complex objects, arrays, functions, etc., use description
  // The objectId would be used for further inspection if needed
  if (cdpValue.objectId) {
    return cdpValue.description || `[${cdpValue.className || cdpValue.type}]`;
  }

  // Fallback to value or description
  return cdpValue.value ?? cdpValue.description ?? `[${cdpValue.type}]`;
}

/**
 * Creates a Variable object from a CDP property descriptor.
 *
 * Filters out properties that shouldn't be shown as variables:
 * - Getters/setters without resolved values
 * - Properties that threw exceptions during access
 * - Properties without value descriptors
 * @param prop - CDP property descriptor from Runtime.getProperties result
 * @returns Variable object or null if property should be filtered out
 * @internal
 */
export function createVariableFromProperty(
  prop: CDPPropertyDescriptor,
): Variable | null {
  // Skip getters/setters without values
  if (!prop.value && (prop.get || prop.set)) {
    return null;
  }

  // Skip properties that threw during access
  if (prop.wasThrown) {
    return null;
  }

  const value = prop.value;
  if (!value) {
    return null;
  }

  return {
    name: prop.name,
    value: extractValue(value),
    type: value.type,
    configurable: prop.configurable,
    enumerable: prop.enumerable,
  };
}
