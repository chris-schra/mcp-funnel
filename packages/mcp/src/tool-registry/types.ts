import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ICommand } from '@mcp-funnel/commands-core';

export interface ToolState {
  // Identity
  fullName: string; // e.g., "github__create_issue"
  originalName: string; // e.g., "create_issue"
  serverName: string; // e.g., "github"

  // Discovery state
  discovered: boolean; // Tool has been discovered from source
  discoveredAt?: Date;

  // Enablement state
  enabled: boolean; // Tool is dynamically enabled
  enabledBy?: 'config' | 'discovery' | 'toolset' | 'always';
  enabledAt?: Date;

  // Visibility state (computed)
  exposed: boolean; // Tool is visible to clients
  exposureReason?: 'always' | 'enabled' | 'allowlist' | 'default' | 'core';

  // Tool data
  definition?: Tool;
  description?: string;
  client?: Client;
  command?: ICommand;
  isCoreTool?: boolean; // Core tools bypass exposeTools filtering

  // Metadata
  tags?: string[];
  category?: string;
}

export interface RegisterToolParams {
  fullName: string;
  originalName: string;
  serverName: string;
  definition: Tool;
  client?: Client;
  command?: ICommand;
  isCoreTool?: boolean; // Mark tools as core tools to bypass exposeTools filtering
}

export interface RegistryStats {
  discovered: number;
  enabled: number;
  exposed: number;
  byServer: Record<string, number>;
  byExposureReason: Record<string, number>;
}
