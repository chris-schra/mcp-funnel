import { ProxyConfig } from '../../config.js';
import { ICoreTool, CoreToolContext } from '../../tools/core-tool.interface.js';
import { ToolRegistry } from '../../tool-registry.js';

export interface ICoreToolManager {
  /**
   * Register core tools with the registry
   */
  registerCoreTools(
    config: ProxyConfig,
    toolRegistry: ToolRegistry,
    createToolContext: () => CoreToolContext,
  ): Map<string, ICoreTool>;
}
