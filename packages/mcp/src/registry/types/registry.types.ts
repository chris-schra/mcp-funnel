/**
 * TypeScript interfaces for MCP Registry data structures.
 * These types define the shape of data returned from the MCP registry API.
 */

import type { ServerConfig } from '../interfaces/temp-server.interface.js';

/**
 * Environment variable definition for server configuration.
 * Used to specify required or optional environment variables that a server needs.
 */
export interface EnvironmentVariable {
  /** The name of the environment variable */
  name: string;
  /** Optional default value for the environment variable */
  value?: string;
  /** Whether this environment variable is required for the server to function */
  is_required?: boolean;
}

/**
 * Package information for installing and running MCP servers.
 * Supports different package registries and runtime configurations.
 */
export interface Package {
  /** Unique identifier for the package (e.g., npm package name, GitHub repo) */
  identifier: string;
  /** The type of package registry where this package can be found */
  registry_type: 'npm' | 'pypi' | 'oci' | 'github';
  /** Optional hint about the runtime environment (e.g., 'node', 'python') */
  runtime_hint?: string;
  /** Additional command-line arguments to pass when starting the package */
  package_arguments?: string[];
  /** Environment variables required or used by this package */
  environment_variables?: EnvironmentVariable[];
}

/**
 * Key-value input definition for configuration parameters.
 * Used for headers, environment variables, and other configurable inputs.
 */
export interface KeyValueInput {
  /** The name of the key */
  name: string;
  /** Optional value for the key */
  value?: string;
  /** Whether this input is required */
  is_required?: boolean;
  /** Whether this input contains sensitive information */
  is_secret?: boolean;
  /** Human-readable description of what this input is for */
  description?: string;
}

/**
 * Remote server connection information.
 * Used for servers that are accessed over network protocols.
 */
export interface Remote {
  /** The protocol or connection type (e.g., 'stdio', 'sse', 'websocket') */
  type: string;
  /** The URL or connection string for the remote server */
  url: string;
  /** Optional HTTP headers to include in requests to the remote server */
  headers?: KeyValueInput[];
}

/**
 * Detailed information about an MCP server from the registry.
 * This is the core data structure representing a server's metadata.
 */
export interface ServerDetail {
  /** Unique identifier for the server in the registry */
  id: string;
  /** Registry metadata including publication and update information */
  _meta?: {
    'io.modelcontextprotocol.registry/official': {
      id: string;
      published_at: string;
      updated_at: string;
    };
  };
  /** Human-readable name of the server */
  name: string;
  /** Description of what the server does and its capabilities */
  description: string;
  /** Package information for installing this server locally */
  packages?: Package[];
  /** Remote connection information for accessing this server over network */
  remotes?: Remote[];
  /** The type of registry entry (for categorization purposes) */
  registry_type?: string;
  /** List of tool names provided by this server (if available in metadata) */
  tools?: string[];
}

/**
 * Complete registry server information including extended metadata.
 * Extends ServerDetail with additional fields that may be returned from detailed endpoints.
 */
export interface RegistryServer extends ServerDetail {
  /** Additional metadata fields that may vary by server implementation */
  metadata?: Record<string, unknown>;
}

/**
 * Search result from the MCP registry search API.
 * Optimized for minimal token usage while providing essential information.
 */
export interface RegistrySearchResult {
  /** Whether any servers were found matching the search criteria */
  found: boolean;
  /** Array of matching servers with basic information */
  servers?: Array<{
    /** Human-readable name of the server */
    name: string;
    /** Brief description of the server's capabilities */
    description: string;
    /** Unique identifier in the registry */
    registryId: string;
    /** Whether this server is accessed remotely (true) or installed locally (false) */
    isRemote: boolean;
    /** Optional registry categorization type */
    registryType?: string;
  }>;
  /** Human-readable message about the search results */
  message: string;
}

/**
 * Installation information and configuration for an MCP server.
 * Provides everything needed to set up and use a server.
 */
export interface RegistryInstallInfo {
  /** Human-readable name of the server */
  name: string;
  /** Description of the server's capabilities and purpose */
  description: string;
  /** Pre-configured server configuration snippet ready for use */
  configSnippet: ServerConfig;
  /** Step-by-step instructions for installing and configuring the server */
  installInstructions: string;
  /** List of tool names provided by this server */
  tools?: string[];
}
