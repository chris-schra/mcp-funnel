import { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export class OverrideValidator {
  validateOverride(originalTool: Tool, overriddenTool: Tool): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (originalTool.inputSchema?.required) {
      const originalRequired = new Set(originalTool.inputSchema.required);
      const overriddenRequired = new Set(
        overriddenTool.inputSchema?.required || [],
      );

      for (const param of originalRequired) {
        if (!overriddenRequired.has(param)) {
          warnings.push(
            `Required parameter '${param}' removed in override for ${originalTool.name}`,
          );
        }
      }
    }

    // Check for type mismatches in properties
    if (
      originalTool.inputSchema?.properties &&
      overriddenTool.inputSchema?.properties
    ) {
      for (const [key, originalProp] of Object.entries(
        originalTool.inputSchema.properties,
      )) {
        const overriddenProp = overriddenTool.inputSchema.properties[key];
        if (
          overriddenProp &&
          typeof originalProp === 'object' &&
          originalProp !== null &&
          'type' in originalProp &&
          typeof overriddenProp === 'object' &&
          overriddenProp !== null &&
          'type' in overriddenProp
        ) {
          if (originalProp.type !== overriddenProp.type) {
            errors.push(
              `Type mismatch for property '${key}': changed from ${originalProp.type} to ${overriddenProp.type}`,
            );
          }
        }
      }
    }

    return { valid: errors.length === 0, errors, warnings };
  }
}
