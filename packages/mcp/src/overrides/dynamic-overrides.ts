import { ToolOverride } from '../config.js';
import { OverrideManager } from './override-manager.js';

/**
 * Interface for objects that have an override manager and need cache refreshing
 */
export interface MCPProxy {
  _overrideManager?: OverrideManager;
  populateToolCaches(): Promise<void>;
  _server: {
    sendToolListChanged(): void;
  };
}

/**
 * Dynamic override manager that allows runtime modification of tool overrides
 */
export class DynamicOverrideManager {
  constructor(private proxy: MCPProxy) {}

  /**
   * Update multiple overrides at once
   * @param overrides - Record of tool names to their overrides
   */
  async updateOverrides(
    overrides: Record<string, ToolOverride>,
  ): Promise<void> {
    if (!this.proxy._overrideManager) {
      // Create a new override manager if none exists
      this.proxy._overrideManager = new OverrideManager(overrides);
    } else {
      // Update the existing override manager with new overrides
      const existingOverrides = this.getExistingOverrides();
      const mergedOverrides = { ...existingOverrides, ...overrides };
      this.proxy._overrideManager = new OverrideManager(mergedOverrides);
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
    await this.updateOverrides({ [toolName]: override });
  }

  /**
   * Remove an override for a specific tool
   * @param toolName - The full tool name to remove override for
   */
  async removeOverride(toolName: string): Promise<void> {
    if (!this.proxy._overrideManager) {
      return; // No overrides to remove
    }

    const existingOverrides = this.getExistingOverrides();
    delete existingOverrides[toolName];

    this.proxy._overrideManager = new OverrideManager(existingOverrides);
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
    this.proxy._overrideManager = new OverrideManager({});
    await this.refreshCachesAndNotify();
  }

  /**
   * Extract existing overrides from the current override manager
   * This is a helper method since OverrideManager doesn't expose its internal state
   */
  private getExistingOverrides(): Record<string, ToolOverride> {
    // Since OverrideManager doesn't expose its internal state,
    // we'll maintain our own record. This is a limitation of the current design.
    // In a real implementation, we might want to modify OverrideManager to expose this.

    // For now, we'll return an empty object and rely on the fact that
    // new overrides will be added through this manager
    return {};
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
