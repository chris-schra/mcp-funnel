import { ToolOverride, ProxyConfig } from '../config.js';
import { OverrideManager } from './override-manager.js';
import { OverrideValidator } from './override-validator.js';

/**
 * Interface for objects that have an override manager and need cache refreshing
 */
export interface MCPProxy {
  _overrideManager?: OverrideManager;
  _overrideValidator?: OverrideValidator;
  _config: ProxyConfig;
  populateToolCaches(): Promise<void>;
  _server: {
    sendToolListChanged(): void;
  };
}

/**
 * Dynamic override manager that allows runtime modification of tool overrides
 */
export class DynamicOverrideManager {
  private currentOverrides: Record<string, ToolOverride> = {};

  constructor(private proxy: MCPProxy) {}

  /**
   * Update multiple overrides at once
   * @param overrides - Record of tool names to their overrides
   */
  async updateOverrides(
    overrides: Record<string, ToolOverride>,
  ): Promise<void> {
    // Check if applyToDynamic is enabled and validation should be performed
    const applyToDynamic = this.proxy._config.overrideSettings?.applyToDynamic;
    const validateOverrides =
      this.proxy._config.overrideSettings?.validateOverrides;

    if (applyToDynamic && validateOverrides && this.proxy._overrideValidator) {
      // Validate each override against a dummy tool to check for obvious issues
      for (const [toolName, override] of Object.entries(overrides)) {
        // Create a minimal dummy tool for validation
        const dummyTool = {
          name: toolName,
          description: 'Dynamic override validation dummy',
          inputSchema: {
            type: 'object' as const,
            properties: {},
          },
        };

        // Apply the override to the dummy tool
        const tempManager = new OverrideManager({ [toolName]: override });
        const overriddenTool = tempManager.applyOverrides(dummyTool, toolName);

        // Validate the result
        const validation = this.proxy._overrideValidator.validateOverride(
          dummyTool,
          overriddenTool,
        );

        if (!validation.valid) {
          console.error(
            `[DynamicOverrideManager] Invalid dynamic override for ${toolName}:`,
            validation.errors,
          );
          // Skip this override
          continue;
        }

        if (validation.warnings.length > 0) {
          console.warn(
            `[DynamicOverrideManager] Dynamic override warnings for ${toolName}:`,
            validation.warnings,
          );
        }
      }
    }

    // Update our tracked state
    this.currentOverrides = { ...this.currentOverrides, ...overrides };

    if (!this.proxy._overrideManager) {
      // Create a new override manager if none exists
      this.proxy._overrideManager = new OverrideManager(this.currentOverrides);
    } else {
      // Update the existing override manager with new overrides
      this.proxy._overrideManager = new OverrideManager(this.currentOverrides);
    }

    // Refresh caches and notify of changes
    await this.refreshCachesAndNotify();
  }

  /**
   * Set a single override for a specific tool
   * @param toolName - The full tool name (e.g., "server__toolname")
   * @param override - The override configuration
   */
  async setOverride(toolName: string, override: ToolOverride): Promise<void> {
    // Check if applyToDynamic is enabled and validation should be performed
    const applyToDynamic = this.proxy._config.overrideSettings?.applyToDynamic;
    const validateOverrides =
      this.proxy._config.overrideSettings?.validateOverrides;

    if (applyToDynamic && validateOverrides && this.proxy._overrideValidator) {
      // Create a minimal dummy tool for validation
      const dummyTool = {
        name: toolName,
        description: 'Dynamic override validation dummy',
        inputSchema: {
          type: 'object' as const,
          properties: {},
        },
      };

      // Apply the override to the dummy tool
      const tempManager = new OverrideManager({ [toolName]: override });
      const overriddenTool = tempManager.applyOverrides(dummyTool, toolName);

      // Validate the result
      const validation = this.proxy._overrideValidator.validateOverride(
        dummyTool,
        overriddenTool,
      );

      if (!validation.valid) {
        console.error(
          `[DynamicOverrideManager] Invalid dynamic override for ${toolName}:`,
          validation.errors,
        );
        throw new Error(
          `Invalid override for ${toolName}: ${validation.errors.join(', ')}`,
        );
      }

      if (validation.warnings.length > 0) {
        console.warn(
          `[DynamicOverrideManager] Dynamic override warnings for ${toolName}:`,
          validation.warnings,
        );
      }
    }

    await this.updateOverrides({ [toolName]: override });
  }

  /**
   * Remove an override for a specific tool
   * @param toolName - The full tool name to remove override for
   */
  async removeOverride(toolName: string): Promise<void> {
    if (!(toolName in this.currentOverrides)) {
      return; // No override exists for this tool
    }

    // Update our tracked state
    delete this.currentOverrides[toolName];

    // Update or clear the override manager
    this.proxy._overrideManager = new OverrideManager(this.currentOverrides);
    await this.refreshCachesAndNotify();
  }

  /**
   * Get all current overrides
   */
  getCurrentOverrides(): Record<string, ToolOverride> {
    return this.getExistingOverrides();
  }

  /**
   * Clear all overrides
   */
  async clearAllOverrides(): Promise<void> {
    // Clear our tracked state
    this.currentOverrides = {};

    this.proxy._overrideManager = new OverrideManager({});
    await this.refreshCachesAndNotify();
  }

  /**
   * Extract existing overrides from the current override manager
   * Returns the tracked overrides state
   */
  private getExistingOverrides(): Record<string, ToolOverride> {
    return { ...this.currentOverrides };
  }

  /**
   * Refresh tool caches and send notification of changes
   */
  private async refreshCachesAndNotify(): Promise<void> {
    try {
      // Refresh the tool caches to apply new overrides
      await this.proxy.populateToolCaches();

      // Send notification that tool list has changed
      this.proxy._server.sendToolListChanged();
    } catch (error) {
      console.error(
        '[DynamicOverrideManager] Failed to refresh caches:',
        error,
      );
      throw error;
    }
  }
}
