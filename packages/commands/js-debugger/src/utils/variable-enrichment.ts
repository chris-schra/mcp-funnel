/**
 * Utility functions for enriching and formatting variable values in debug sessions
 */

/**
 * Enrich variable value with type information and structure
 */
export async function enrichVariableValue(
  value: unknown,
  type: string,
  maxDepth: number,
  visitedObjects: Set<string>,
  currentDepth = 0,
): Promise<unknown> {
  // Prevent infinite recursion
  if (currentDepth >= maxDepth) {
    return `[Max depth ${maxDepth} reached]`;
  }

  // Handle primitive types
  if (type !== 'object' || value === null || value === undefined) {
    return formatPrimitiveValue(value, type);
  }

  // Handle circular references (simplified)
  const valueString = String(value);
  if (visitedObjects.has(valueString)) {
    return '[Circular]';
  }
  visitedObjects.add(valueString);

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length > 100) {
      return `[Array with ${value.length} items - too large to display]`;
    }

    return await Promise.all(
      value.slice(0, 50).map(async (item, index) => ({
        index: String(index),
        value: await enrichVariableValue(
          item,
          typeof item,
          maxDepth,
          new Set(visitedObjects),
          currentDepth + 1,
        ),
      })),
    );
  }

  // Handle special object types
  if (value instanceof Date) {
    return { __type: 'Date', value: value.toISOString() };
  }

  if (value instanceof RegExp) {
    return { __type: 'RegExp', value: value.toString() };
  }

  if (value instanceof Map) {
    return {
      __type: 'Map',
      size: value.size,
      entries: Array.from(value.entries()).slice(0, 20),
    };
  }

  if (value instanceof Set) {
    return {
      __type: 'Set',
      size: value.size,
      values: Array.from(value.values()).slice(0, 20),
    };
  }

  // Handle plain objects
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    const result: Record<string, unknown> = {};
    const maxProps = 50;
    const keysToProcess = keys.slice(0, maxProps);

    for (const key of keysToProcess) {
      try {
        const propValue = (value as Record<string, unknown>)[key];
        result[key] = await enrichVariableValue(
          propValue,
          typeof propValue,
          maxDepth,
          new Set(visitedObjects),
          currentDepth + 1,
        );
      } catch (error) {
        result[key] =
          `[Error: ${error instanceof Error ? error.message : 'Unknown error'}]`;
      }
    }

    if (keys.length > maxProps) {
      result['...'] = `[${keys.length - maxProps} more properties]`;
    }

    return result;
  }

  return value;
}

/**
 * Format primitive values based on their type
 */
export function formatPrimitiveValue(value: unknown, type: string): unknown {
  switch (type) {
    case 'string':
    case 'number':
    case 'boolean':
      return value;
    case 'undefined':
      return undefined;
    case 'symbol':
      return `[Symbol: ${String(value)}]`;
    case 'function':
      return `[Function: ${String(value)}]`;
    case 'bigint':
      return `${String(value)}n`;
    default:
      return value;
  }
}

/**
 * Simple path navigation for basic objects
 */
export function navigateSimplePath(
  currentValue: unknown,
  remainingPath: string[],
): { value: unknown; type: string } {
  if (remainingPath.length === 0) {
    return { value: currentValue, type: typeof currentValue };
  }

  if (typeof currentValue !== 'object' || currentValue === null) {
    throw new Error(
      `Cannot navigate property '${remainingPath[0]}' on non-object type '${typeof currentValue}'`,
    );
  }

  const nextPart = remainingPath[0];
  const nextValue = (currentValue as Record<string, unknown>)[nextPart];

  return navigateSimplePath(nextValue, remainingPath.slice(1));
}
