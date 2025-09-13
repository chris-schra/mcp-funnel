import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ProxyConfig } from '../config.js';
import { ICommand } from '@mcp-funnel/commands-core';

/**
 * Context provided to core tools for accessing proxy state and capabilities
 */
export interface CoreToolContext {
  /** Cache of all tool descriptions from connected MCP servers */
  toolDescriptionCache: Map<
    string,
    { serverName: string; description: string }
  >;

  /** Cache of full tool definitions from connected MCP servers */
  toolDefinitionCache?: Map<string, { serverName: string; tool: Tool }>;

  /** Mapping of tool names to their client and original names */
  toolMapping?: Map<
    string,
    { client: Client | null; originalName: string; command?: ICommand }
  >;

  /** Set of dynamically enabled tool names */
  dynamicallyEnabledTools: Set<string>;

  /** Current proxy configuration */
  config: ProxyConfig;

  /** Method to send notifications to connected clients (when implemented) */
  sendNotification?: (
    method: string,
    params?: Record<string, unknown>,
  ) => Promise<void>;

  /** Enable tools dynamically at runtime */
  enableTools: (toolNames: string[]) => void;

  /** Disable tools dynamically at runtime */
  disableTools?: (toolNames: string[]) => void;
}

/**
 * Interface for core tools exposed by the proxy itself
 */
export interface ICoreTool {
  /** Tool name (must be unique) */
  readonly name: string;

  /** MCP Tool definition */
  readonly tool: Tool;

  /** Check if this tool should be enabled based on config */
  isEnabled(config: ProxyConfig): boolean;

  /** Handle tool invocation */
  handle(
    args: Record<string, unknown>,
    context: CoreToolContext,
  ): Promise<CallToolResult>;

  /** Optional initialization when tool is registered */
  onInit?(context: CoreToolContext): void;

  /** Optional cleanup when tool is unregistered */
  onDestroy?(): void;
}
