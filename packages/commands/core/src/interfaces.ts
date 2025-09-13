import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Core interface for development commands that support both MCP and CLI execution.
 * Commands implementing this interface can be called via the MCP protocol by AI assistants
 * or executed directly from the command line.
 */
export interface ICommand {
  /** Unique command name used for identification */
  readonly name: string;

  /** Human-readable description of what the command does */
  readonly description: string;

  /**
   * Execute the command via MCP protocol.
   * Called when an AI assistant invokes the command through the MCP interface.
   *
   * @param args - Arguments passed from the MCP client as a JSON object
   * @returns MCP-compliant tool result containing text or resource content
   */
  executeViaMCP(args: Record<string, unknown>): Promise<CallToolResult>;

  /**
   * Execute the command via CLI interface.
   * Called when the command is invoked directly from the command line.
   *
   * @param args - Raw command line arguments as string array
   * @returns Promise that resolves when execution completes
   */
  executeViaCLI(args: string[]): Promise<void>;

  /**
   * Get the MCP tool definition for this command.
   * Used to register the command with MCP servers and provide schema information.
   *
   * @returns MCP Tool definition with name, description, and input schema
   */
  getMCPDefinition(): Tool;
}

/**
 * Metadata interface for command packages.
 * Provides additional information about command authorship, versioning, and categorization.
 */
export interface ICommandMetadata {
  /** Command name (must match ICommand.name) */
  name: string;

  /** Command description (must match ICommand.description) */
  description: string;

  /** Command version following semantic versioning */
  version: string;

  /** Optional command author information */
  author?: string;

  /** Optional tags for categorizing and filtering commands */
  tags?: string[];
}

/**
 * Common options interface for command configuration.
 * Provides standard options that many commands might need.
 */
export interface ICommandOptions {
  /** Enable verbose/debug output */
  verbose?: boolean;

  /** Run in dry-run mode (show what would be done without executing) */
  dryRun?: boolean;

  /** Working directory for command execution */
  workingDirectory?: string;

  /** Timeout in milliseconds for command execution */
  timeout?: number;

  /** Additional custom options specific to individual commands */
  [key: string]: unknown;
}

// Re-export commonly used MCP SDK types for convenience
export type { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
