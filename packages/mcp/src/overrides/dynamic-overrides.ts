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
  private currentOverrides: Record<string, ToolOverride> = {};

  constructor(private proxy: MCPProxy) {}

  /**
   * Update multiple overrides at once
   * @param overrides - Record of tool names to their overrides
   */
  async updateOverrides(
    overrides: Record<string, ToolOverride>,
  ): Promise<void> {
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
