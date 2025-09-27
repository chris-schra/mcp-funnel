import { ProxyConfig } from '../../config.js';
import { ToolRegistry } from '../../tool-registry.js';

export interface ICommandLoader {
  /**
   * Load and register development commands
   */
  loadDevelopmentCommands(
    config: ProxyConfig,
    toolRegistry: ToolRegistry,
  ): Promise<void>;
}
