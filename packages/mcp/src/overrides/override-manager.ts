import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolOverride } from '../config.js';
import { deepmerge } from 'deepmerge-ts';

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
  private patterns: Array<{
    pattern: string;
    override: ToolOverride;
    compiledPattern: RegExp;
  }>;
  private overrideCache: Map<string, Tool>;

  constructor(overrides: Record<string, ToolOverride> = {}) {
    this.overrides = new Map();
    this.patterns = [];
    this.overrideCache = new Map();

    for (const [key, override] of Object.entries(overrides)) {
      if (key.includes('*')) {
        // Pre-compile the pattern for better performance
        const regexPattern = key
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&')) // Escape special regex chars
          .join('.*'); // Replace * with .*
        const compiledPattern = new RegExp(`^${regexPattern}$`);
        this.patterns.push({ pattern: key, override, compiledPattern });
      } else {
        this.overrides.set(key, override);
      }
    }

    // Check for overlapping patterns
    const conflicts: string[] = [];
    for (let i = 0; i < this.patterns.length; i++) {
      for (let j = i + 1; j < this.patterns.length; j++) {
        // Check if patterns could match the same tool
        // For simplicity, warn if two patterns both contain wildcards
        if (
          this.patterns[i].pattern.includes('*') &&
          this.patterns[j].pattern.includes('*')
        ) {
          const exampleTool = 'github__example_tool';
          if (
            this.patterns[i].compiledPattern.test(exampleTool) &&
            this.patterns[j].compiledPattern.test(exampleTool)
          ) {
            conflicts.push(
              `Patterns '${this.patterns[i].pattern}' and '${this.patterns[j].pattern}' may conflict`,
            );
          }
        }
      }
    }
    if (conflicts.length > 0) {
      console.warn('[OverrideManager] Pattern conflicts detected:', conflicts);
    }
  }

  applyOverrides(tool: Tool, fullToolName: string): Tool {
    // Create composite cache key: fullToolName + tool.name + first 50 chars of description
    const description = tool.description || '';
    const descriptionPart = description.slice(0, 50);
    const cacheKey = `${fullToolName}::${tool.name}::${descriptionPart}`;

    // Check cache first
    const cachedResult = this.overrideCache.get(cacheKey);
    if (cachedResult) {
      return cachedResult;
    }

    let override = this.overrides.get(fullToolName);

    if (!override) {
      for (const { compiledPattern, override: patternOverride } of this
        .patterns) {
        if (compiledPattern.test(fullToolName)) {
          override = patternOverride;
          break;
        }
      }
    }

    if (!override) {
      // Cache the original tool when no overrides apply
      this.overrideCache.set(cacheKey, tool);
      return tool;
    }

    const result = this.mergeToolWithOverride(tool, override);
    // Cache the result
    this.overrideCache.set(cacheKey, result);
    return result;
  }

  clearCache(): void {
    this.overrideCache.clear();
  }

  private mergeToolWithOverride(tool: Tool, override: ToolOverride): Tool {
    // Null safety guards
    if (!tool || !override) return tool;

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
      const newSchema = {
        type: 'object' as const,
        properties: override.properties as Record<string, JSONSchema>,
        required: override.required,
      };
      return this.applyPropertyOverrides(newSchema, override.propertyOverrides);
    }

    const strategy = override.strategy || 'merge';

    switch (strategy) {
      case 'replace': {
        const replacedSchema = {
          type: 'object' as const,
          properties: override.properties as Record<string, JSONSchema>,
          required: override.required,
        };
        return this.applyPropertyOverrides(
          replacedSchema,
          override.propertyOverrides,
        );
      }

      case 'merge': {
        const mergedSchema = {
          ...original,
          properties: {
            ...original.properties,
            ...(override.properties as Record<string, JSONSchema>),
          },
          required: override.required || original.required,
        };
        return this.applyPropertyOverrides(
          mergedSchema,
          override.propertyOverrides,
        );
      }

      case 'deep-merge': {
        const deepMergedSchema = this.deepMergeSchema(original, override);
        return this.applyPropertyOverrides(
          deepMergedSchema,
          override.propertyOverrides,
        );
      }

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
    // Use deepmerge-ts for proper deep merging
    return deepmerge(original, override) as Record<string, JSONSchema>;
  }

  private applyPropertyOverrides(
    schema: Tool['inputSchema'],
    propertyOverrides?: Record<
      string,
      {
        description?: string;
        default?: string | number | boolean | null;
        enum?: Array<string | number | boolean>;
        type?: 'string' | 'number' | 'boolean' | 'object' | 'array';
      }
    >,
  ): Tool['inputSchema'] {
    if (!propertyOverrides || !schema?.properties) {
      return schema;
    }

    const updatedProperties = { ...schema.properties };

    for (const [propName, overrides] of Object.entries(propertyOverrides)) {
      if (propName in updatedProperties) {
        const originalProp = updatedProperties[propName] as JSONSchema;
        updatedProperties[propName] = {
          ...originalProp,
          ...(overrides.description !== undefined && {
            description: overrides.description,
          }),
          ...(overrides.default !== undefined && {
            default: overrides.default,
          }),
          ...(overrides.enum !== undefined && { enum: overrides.enum }),
          ...(overrides.type !== undefined && { type: overrides.type }),
        };
      }
    }

    return {
      ...schema,
      properties: updatedProperties,
    };
  }
}
