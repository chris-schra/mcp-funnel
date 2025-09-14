import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolOverride } from '../config.js';
import { matchesPattern } from '../utils/pattern-matcher.js';

interface JSONSchema {
  type?: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  description?: string;
  default?: string | number | boolean | null;
  enum?: Array<string | number | boolean>;
  [key: string]:
    | JSONSchema
    | string
    | number
    | boolean
    | null
    | undefined
    | string[]
    | Array<string | number | boolean>;
}

export class OverrideManager {
  private overrides: Map<string, ToolOverride>;
  private patterns: Array<{ pattern: string; override: ToolOverride }>;

  constructor(overrides: Record<string, ToolOverride> = {}) {
    this.overrides = new Map();
    this.patterns = [];

    for (const [key, override] of Object.entries(overrides)) {
      if (key.includes('*')) {
        this.patterns.push({ pattern: key, override });
      } else {
        this.overrides.set(key, override);
      }
    }
  }

  applyOverrides(tool: Tool, fullToolName: string): Tool {
    let override = this.overrides.get(fullToolName);

    if (!override) {
      for (const { pattern, override: patternOverride } of this.patterns) {
        if (matchesPattern(fullToolName, pattern)) {
          override = patternOverride;
          break;
        }
      }
    }

    if (!override) {
      return tool;
    }

    return this.mergeToolWithOverride(tool, override);
  }

  private mergeToolWithOverride(tool: Tool, override: ToolOverride): Tool {
    const result = { ...tool };

    if (override.name) result.name = override.name;
    if (override.title) result.title = override.title;
    if (override.description) result.description = override.description;

    if (override.inputSchema) {
      result.inputSchema = this.mergeInputSchema(
        tool.inputSchema,
        override.inputSchema,
      );
    }

    if (override.annotations) {
      result._meta = {
        ...result._meta,
        annotations: {
          ...(result._meta?.annotations || {}),
          ...override.annotations,
        },
      };
    }

    return result;
  }

  private mergeInputSchema(
    original: Tool['inputSchema'],
    override: NonNullable<ToolOverride['inputSchema']>,
  ): Tool['inputSchema'] {
    if (!original) {
      return {
        type: 'object' as const,
        properties: override.properties as Record<string, JSONSchema>,
        required: override.required,
      };
    }

    const strategy = override.strategy || 'merge';

    switch (strategy) {
      case 'replace':
        return {
          type: 'object' as const,
          properties: override.properties as Record<string, JSONSchema>,
          required: override.required,
        };

      case 'merge':
        return {
          ...original,
          properties: {
            ...original.properties,
            ...(override.properties as Record<string, JSONSchema>),
          },
          required: override.required || original.required,
        };

      case 'deep-merge':
        return this.deepMergeSchema(original, override);

      default:
        return original;
    }
  }

  private deepMergeSchema(
    original: Tool['inputSchema'],
    override: NonNullable<ToolOverride['inputSchema']>,
  ): Tool['inputSchema'] {
    if (!original) {
      return {
        type: 'object' as const,
        properties: override.properties as Record<string, JSONSchema>,
        required: override.required,
      };
    }

    const merged: Tool['inputSchema'] = {
      type: 'object' as const,
      properties: this.deepMergeProperties(
        (original.properties || {}) as Record<string, JSONSchema>,
        (override.properties || {}) as Record<string, JSONSchema>,
      ),
      required: override.required || original.required,
    };

    return merged;
  }

  private deepMergeProperties(
    original: Record<string, JSONSchema>,
    override: Record<string, JSONSchema>,
  ): Record<string, JSONSchema> {
    const result: Record<string, JSONSchema> = { ...original };

    for (const [key, value] of Object.entries(override)) {
      if (
        key in original &&
        typeof original[key] === 'object' &&
        typeof value === 'object'
      ) {
        result[key] = { ...original[key], ...value };
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
