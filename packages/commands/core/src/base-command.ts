/**
 * Base abstract class for MCP Funnel commands
 */

import type {
  ICommand,
  ICommandOptions,
  ServerDependency,
  ServerRequirementResult,
  IMCPProxy,
} from './interfaces.js';

/**
 * Abstract base class that provides common functionality for all commands
 */
export abstract class BaseCommand implements ICommand {
  abstract readonly name: string;
  abstract readonly description: string;

  /**
   * Reference to the MCPProxy instance for server dependency management
   */
  protected _proxy?: IMCPProxy;

  abstract executeToolViaMCP(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<import('@modelcontextprotocol/sdk/types.js').CallToolResult>;
  abstract executeViaCLI(args: string[]): Promise<void>;
  abstract getMCPDefinitions(): import('@modelcontextprotocol/sdk/types.js').Tool[];

  /**
   * Parse common command options from arguments
   */
  protected parseCommonOptions(
    args: Record<string, unknown> | string[],
  ): ICommandOptions {
    const options: ICommandOptions = {};

    if (Array.isArray(args)) {
      // CLI args
      options.verbose = args.includes('--verbose') || args.includes('-v');
      options.dryRun = args.includes('--dry-run');

      const formatIndex = args.findIndex((arg) => arg === '--format');
      if (formatIndex !== -1 && formatIndex < args.length - 1) {
        const format = args[formatIndex + 1];
        if (format === 'json' || format === 'text' || format === 'console') {
          options.format = format;
        }
      }
    } else {
      // MCP args
      options.verbose = Boolean(args.verbose);
      options.dryRun = Boolean(args.dryRun);
      if (
        typeof args.format === 'string' &&
        ['json', 'text', 'console'].includes(args.format)
      ) {
        options.format = args.format as 'json' | 'text' | 'console';
      }
    }

    return options;
  }

  /**
   * Log output based on format preference
   */
  protected log(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.info(message);
  }

  /**
   * Log error output
   */
  protected logError(message: string, options: ICommandOptions = {}): void {
    if (options.format === 'json') {
      // Skip console logging in JSON mode
      return;
    }
    console.error(message);
  }

  /**
   * Get the MCPProxy instance for server operations
   */
  protected getProxy(): IMCPProxy | undefined {
    return this._proxy;
  }

  /**
   * Set the MCPProxy instance (called by MCPProxy during initialization)
   */
  public setProxy(proxy: IMCPProxy): void {
    this._proxy = proxy;
  }

  /**
   * Check if a server dependency is configured in .mcp-funnel.json
   * This only checks configuration, not connection status.
   */
  protected async requireServerConfigured(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    const proxy = this.getProxy();
    if (!proxy) {
      return undefined;
    }

    // Check if any alias matches a configured server
    const isConfigured = dependency.aliases.some((alias) =>
      proxy.hasServerConfigured(alias),
    );

    return { configured: isConfigured };
  }

  /**
   * Check if a server dependency is satisfied and optionally expose its tools.
   * Following SEAMS principle - minimal implementation that can be extended.
   */
  protected async requireServerConnected(
    dependency: ServerDependency,
  ): Promise<ServerRequirementResult> {
    const proxy = this.getProxy();
    if (!proxy) {
      return undefined;
    }

    // Check if any alias matches a connected server
    const isConnected = dependency.aliases.some((alias) =>
      proxy.isServerConnected(alias),
    );

    if (isConnected && dependency.ensureToolsExposed) {
      const matchingAlias = dependency.aliases.find((alias) =>
        proxy.isServerConnected(alias),
      );

      if (matchingAlias && proxy.registry?.enableTools) {
        proxy.registry.enableTools(
          [`${matchingAlias}__*`],
          'server-dependency',
        );
      }
    }

    return { configured: isConnected };
  }

  /**
   * Get the server dependencies for this command.
   * Default implementation returns no dependencies.
   * Commands can override this to declare their dependencies.
   */
  getServerDependencies(): ServerDependency[] | undefined {
    // Default: no dependencies
    return undefined;
  }
}
