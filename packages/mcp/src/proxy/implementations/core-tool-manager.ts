import { ProxyConfig } from '../../config.js';
import { ICoreTool, CoreToolContext } from '../../tools/core-tool.interface.js';
import { ToolRegistry } from '../../tool-registry.js';
import { DiscoverToolsByWords } from '../../tools/discover-tools-by-words/index.js';
import { GetToolSchema } from '../../tools/get-tool-schema/index.js';
import { BridgeToolRequest } from '../../tools/bridge-tool-request/index.js';
import { LoadToolset } from '../../tools/load-toolset/index.js';
import { ManageCommands } from '../../tools/manage-commands/index.js';
import { ICoreToolManager } from '../interfaces/core-tool-manager.interface.js';

export class CoreToolManager implements ICoreToolManager {
  registerCoreTools(
    config: ProxyConfig,
    toolRegistry: ToolRegistry,
    createToolContext: () => CoreToolContext,
  ): Map<string, ICoreTool> {
    const coreTools = new Map<string, ICoreTool>();

    const tools: ICoreTool[] = [
      new DiscoverToolsByWords(),
      new GetToolSchema(),
      new BridgeToolRequest(),
      new LoadToolset(),
      new ManageCommands(),
    ];

    for (const tool of tools) {
      if (tool.isEnabled(config)) {
        coreTools.set(tool.name, tool);

        // Register core tools with the registry (they bypass exposeTools filtering)
        toolRegistry.registerDiscoveredTool({
          fullName: tool.name,
          originalName: tool.name,
          serverName: 'mcp-funnel',
          definition: tool.tool,
          isCoreTool: true,
        });

        if (tool.onInit) {
          tool.onInit(createToolContext());
        }

        console.error(`[core-tool-manager] Registered core tool: ${tool.name}`);
      }
    }

    return coreTools;
  }
}
