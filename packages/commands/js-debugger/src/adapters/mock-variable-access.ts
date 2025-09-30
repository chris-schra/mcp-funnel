import type { CallToolResult } from '../types/index.js';
import type { MockVariableScopes } from './mock-variable-generator.js';

/**
 * Handle mock variable path access
 */
export function handleMockPathAccess(
  sessionId: string,
  path: string,
  frameId: number,
  mockVariables: MockVariableScopes,
): CallToolResult {
  const pathParts = path.split('.');
  let current: unknown = mockVariables;
  let found = true;

  try {
    for (const part of pathParts) {
      if (
        current &&
        typeof current === 'object' &&
        part in (current as Record<string, unknown>)
      ) {
        current = (current as Record<string, unknown>)[part];
      } else {
        found = false;
        break;
      }
    }

    const result = {
      found,
      value: found ? current : undefined,
      type: found
        ? Array.isArray(current)
          ? 'array'
          : typeof current
        : undefined,
      error: found
        ? undefined
        : `Variable path '${path}' not found in mock session`,
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              sessionId,
              frameId,
              path,
              result,
              message: `[MOCK] Variable inspection for path: ${path}`,
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            sessionId,
            frameId,
            path,
            result: {
              found: false,
              error: `[MOCK] Error accessing path '${path}': ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          }),
        },
      ],
      isError: true,
    };
  }
}

/**
 * Handle mock scope access
 */
export function handleMockScopeAccess(
  sessionId: string,
  frameId: number,
  maxDepth: number,
  mockVariables: MockVariableScopes,
): CallToolResult {
  const scopes = [
    {
      type: 'local',
      name: 'Local',
      variables: Object.entries(mockVariables.local).map(([name, value]) => ({
        name,
        value,
        type: Array.isArray(value) ? 'array' : typeof value,
        configurable: true,
        enumerable: true,
      })),
    },
    {
      type: 'closure',
      name: 'Closure',
      variables: Object.entries(mockVariables.closure).map(([name, value]) => ({
        name,
        value,
        type: typeof value,
        configurable: true,
        enumerable: true,
      })),
    },
    {
      type: 'global',
      name: 'Global',
      variables: Object.entries(mockVariables.global).map(([name, value]) => ({
        name,
        value,
        type: typeof value,
        configurable: false,
        enumerable: false,
      })),
    },
  ];

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            sessionId,
            frameId,
            maxDepth,
            scopes,
            message: `[MOCK] Variable inspection for frame ${frameId} with max depth ${maxDepth}`,
          },
          null,
          2,
        ),
      },
    ],
  };
}
