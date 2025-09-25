import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { BaseCoreTool } from '../base-core-tool.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { CommandInstaller } from '@mcp-funnel/commands-core';

export class ManageCommands extends BaseCoreTool {
  readonly name = 'manage_commands';
  readonly tool: Tool = {
    name: this.name,
    description:
      'Manage MCP Funnel commands - install, uninstall, or update npm packages',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['install', 'uninstall', 'update'],
          description: 'Action to perform',
        },
        package: {
          type: 'string',
          description:
            'NPM package name or spec (e.g., @org/command, package@1.0.0)',
        },
        version: {
          type: 'string',
          description:
            'Specific version to install (optional, only for install action)',
        },
        force: {
          type: 'boolean',
          description:
            'Force reinstall even if already installed (only for install action)',
          default: false,
        },
        removeData: {
          type: 'boolean',
          description:
            'Also remove any data associated with the command (only for uninstall action)',
          default: false,
        },
      },
      required: ['action', 'package'],
    },
  };

  private installer: CommandInstaller;

  constructor() {
    super();
    this.installer = new CommandInstaller();
  }

  /**
   * Attempt to hot-reload a command and return its tools
   */
  private async hotReloadCommand(
    commandPackage: string,
    commandName: string,
    context: CoreToolContext,
  ): Promise<{
    hotReloaded: boolean;
    tools: string[];
    hotReloadError?: string;
  }> {
    let hotReloaded = false;
    let hotReloadError: string | undefined;
    let tools: string[] = [];

    try {
      // Use the installer's loadInstalledCommand which properly resolves entry points
      const command = await this.installer.loadInstalledCommand(commandPackage);
      if (!command) {
        hotReloadError = `Package '${commandPackage}' does not export a valid MCP Funnel command`;
      } else if (context.toolRegistry?.hotReloadCommand) {
        context.toolRegistry.hotReloadCommand(command);
        hotReloaded = true;

        // Get tools after hot-reload
        const allTools = context.toolRegistry.getAllTools();
        tools = allTools
          .filter(
            (tool) => tool.command?.name === commandName && tool.discovered,
          )
          .map((tool) => tool.fullName);
      }
    } catch (error) {
      hotReloadError = error instanceof Error ? error.message : String(error);
      console.error('Hot-reload failed for command:', commandPackage, error);
    }

    return { hotReloaded, tools, hotReloadError };
  }

  async handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult> {
    const action = args.action as string;
    const packageSpec = args.package as string;

    try {
      switch (action) {
        case 'install': {
          const version = args.version as string | undefined;
          const force = args.force as boolean | undefined;

          let installed;
          try {
            installed = await this.installer.install(packageSpec, {
              force,
              version,
            });
          } catch (error) {
            // Check if it's an "already installed" error
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            if (errorMessage.includes('already installed')) {
              // Get existing command info
              const manifest = await this.installer.readManifest();
              const existing = manifest.commands.find(
                (cmd) =>
                  cmd.package === packageSpec || cmd.name === packageSpec,
              );

              if (existing) {
                // Try to discover existing tools
                let existingTools: string[] = [];
                if (context.toolRegistry) {
                  const allTools = context.toolRegistry.getAllTools();
                  existingTools = allTools
                    .filter(
                      (tool) =>
                        tool.command?.name === existing.name && tool.discovered,
                    )
                    .map((tool) => tool.fullName);
                }

                // If no tools found, attempt to hot-reload the already installed command
                if (existingTools.length === 0) {
                  const reloadResult = await this.hotReloadCommand(
                    existing.package,
                    existing.name,
                    context,
                  );
                  existingTools = reloadResult.tools;
                }

                return {
                  content: [
                    {
                      type: 'text',
                      text: JSON.stringify({
                        success: true,
                        action: 'already_installed',
                        message: `Command ${existing.name} is already installed`,
                        command: existing,
                        tools: existingTools,
                        hint:
                          existingTools.length > 0
                            ? `Tools available: ${existingTools.join(', ')}\n\n📝 Already installed - choose mode:\n1. Session-only: Use discovery as needed\n2. Persistent: Add to config for auto-loading\n\nFor persistent mode in .mcp-funnel.json:\n"alwaysVisibleTools": ["${existing.name}__*"] or\n"commands": { "list": ["${existing.name}"] }`
                            : `Command installed but not loaded. Use 'discover_tools_by_words' with "${existing.name}" to enable.\n\n📝 To auto-load on startup, add to .mcp-funnel.json:\n"alwaysVisibleTools": ["${existing.name}__*"] or\n"commands": { "list": ["${existing.name}"] }`,
                      }),
                    },
                  ],
                };
              }
            }
            // Re-throw if it's a different error
            throw error;
          }

          // Try to hot-reload the command
          const reloadResult = await this.hotReloadCommand(
            installed.package,
            installed.name,
            context,
          );

          const {
            hotReloaded,
            tools: discoveredTools,
            hotReloadError,
          } = reloadResult;
          const toolsMessage =
            discoveredTools.length > 0
              ? `Available tools: ${discoveredTools.join(', ')}`
              : '';

          const hint = hotReloaded
            ? `Command installed and hot-reloaded! ${toolsMessage || 'Tools are now available for use.'}\n\n📝 Installation Modes:\n1. Session-only: Tools are available now via discovery\n2. Persistent: Add to .mcp-funnel.json for automatic loading\n\nFor persistent mode, add to config:\n- Project: ./.mcp-funnel.json\n- Global: ~/.mcp-funnel.json\n\nAdd to "alwaysVisibleTools" for immediate availability:\n"alwaysVisibleTools": ["${installed.name}__*"]\n\nOr add to "commands.list" for filtered loading:\n"commands": { "enabled": true, "list": ["${installed.name}"] }`
            : `Command installed! Session-only mode - use 'discover_tools_by_words' with "${installed.name}" to enable.\n\n📝 Installation Modes:\n1. Session-only: Use discovery to enable when needed\n2. Persistent: Add to .mcp-funnel.json for automatic loading\n\nFor persistent mode, add to config:\n- Project: ./.mcp-funnel.json\n- Global: ~/.mcp-funnel.json\n\nAdd to "alwaysVisibleTools" for immediate availability:\n"alwaysVisibleTools": ["${installed.name}__*"]\n\nOr add to "commands.list" for filtered loading:\n"commands": { "enabled": true, "list": ["${installed.name}"] }`;

          const response: Record<string, unknown> = {
            success: true,
            action: 'installed',
            message: `Successfully installed command: ${installed.name}`,
            command: installed,
            hint,
            tools: discoveredTools,
          };

          // Add errors if they occurred
          if (hotReloadError) {
            response.hotReloadError = hotReloadError;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
              },
            ],
          };
        }

        case 'uninstall': {
          const removeData = args.removeData as boolean | undefined;

          await this.installer.uninstall(packageSpec, { removeData });

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  action: 'uninstalled',
                  message: `Successfully uninstalled command: ${packageSpec}`,
                  note: 'Tools will be removed when the session restarts',
                }),
              },
            ],
          };
        }

        case 'update': {
          const updated = await this.installer.update(packageSpec);

          // Try to hot-reload the updated command
          const reloadResult = await this.hotReloadCommand(
            updated.package,
            updated.name,
            context,
          );

          const { hotReloaded, hotReloadError } = reloadResult;

          const response: Record<string, unknown> = {
            success: true,
            action: 'updated',
            message: `Successfully updated command: ${updated.name} to version ${updated.version}`,
            command: updated,
            hotReloaded,
            hint: `Command updated! ${hotReloaded ? 'Tools reloaded.' : 'Restart session to load updated tools.'}\n\n📝 For persistent mode, ensure it's in .mcp-funnel.json:\n"alwaysVisibleTools": ["${updated.name}__*"] or\n"commands": { "list": ["${updated.name}"] }`,
          };

          // Add error if it occurred
          if (hotReloadError) {
            response.hotReloadError = hotReloadError;
          }

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(response),
              },
            ],
          };
        }

        default:
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `Unknown action: ${action}`,
                }),
              },
            ],
          };
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: errorMessage,
            }),
          },
        ],
      };
    }
  }
}
