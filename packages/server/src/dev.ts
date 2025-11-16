/**
 * Development server entry point with automatic configuration loading.
 *
 * Loads MCP Funnel configuration from MCP_FUNNEL_CONFIG_PATH or .mcp-funnel.json,
 * initializes MCPProxy, and starts web server with mandatory authentication.
 *
 * Authentication behavior:
 * - Uses MCP_FUNNEL_AUTH_TOKEN if set (minimum 16 characters)
 * - Generates secure random token if no token provided
 * - Disables auth only if DISABLE_INBOUND_AUTH=true (development only)
 * @public
 * @see file:./index.ts:44 - startWebServer function
 */

import { startWebServer } from './index.js';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { resolveMergedProxyConfig } from 'mcp-funnel';
import type { InboundAuthConfig } from './auth/index.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Loads and merges MCP Funnel proxy configuration from filesystem.
 *
 * Reads configuration from MCP_FUNNEL_CONFIG_PATH environment variable
 * or defaults to .mcp-funnel.json in current working directory.
 * @returns Parsed proxy configuration, or empty config on load failure
 * @internal
 */
function loadConfig(): ProxyConfig {
  const configPathEnv = process.env.MCP_FUNNEL_CONFIG_PATH;
  const defaultPath = resolve(process.cwd(), '.mcp-funnel.json');
  const projectPath = configPathEnv ?? defaultPath;

  try {
    const { config } = resolveMergedProxyConfig(projectPath);
    // No need to normalize here since config already has the right type
    return config;
  } catch (error) {
    console.error(`[server] Failed to load merged config (project: ${projectPath}):`, error);
    return { servers: [] };
  }
}

/**
 * Creates authentication configuration with secure defaults.
 *
 * Configuration sources (in priority order):
 * 1. DISABLE_INBOUND_AUTH=true: Disables auth (logs security warnings)
 * 2. MCP_FUNNEL_AUTH_TOKEN: Uses provided token (minimum 16 chars, exits on violation)
 * 3. Default: Generates secure 32-byte random token, logs to console
 * @returns Authentication configuration for server startup
 * @internal
 */
function createDefaultAuthConfig(): InboundAuthConfig {
  // Check if authentication is explicitly disabled
  if (process.env.DISABLE_INBOUND_AUTH === 'true') {
    console.warn('🚨 WARNING: Inbound authentication is DISABLED. This is a security risk!');
    console.warn('🚨 WARNING: Only use DISABLE_INBOUND_AUTH=true for development/testing.');
    console.warn('🚨 WARNING: Your proxy server is completely OPEN to any requests.');
    return { type: 'none' };
  }

  // Try to get auth token from environment
  const envToken = process.env.MCP_FUNNEL_AUTH_TOKEN;
  if (envToken) {
    if (envToken.trim().length < 16) {
      console.error('❌ MCP_FUNNEL_AUTH_TOKEN must be at least 16 characters long');
      process.exit(1);
    }
    console.info('✅ Using authentication token from MCP_FUNNEL_AUTH_TOKEN');
    return {
      type: 'bearer',
      tokens: [envToken.trim()],
    };
  }

  // Generate a secure random token
  const generatedToken = randomBytes(32).toString('hex');
  console.warn('⚠️  No MCP_FUNNEL_AUTH_TOKEN provided.');
  console.warn('🔐 Generated secure random token for this session:');
  console.warn('==========================================');
  console.warn(`🔑 Bearer Token: ${generatedToken}`);
  console.warn('==========================================');
  console.warn('💡 To use a persistent token, set MCP_FUNNEL_AUTH_TOKEN env var.');
  console.warn('💡 To disable auth (DEV ONLY), set DISABLE_INBOUND_AUTH=true.');
  console.warn('');

  return {
    type: 'bearer',
    tokens: [generatedToken],
  };
}

/**
 * Main entry point for development server.
 *
 * Orchestrates configuration loading, MCPProxy initialization, and web server startup.
 * Exits with code 1 on initialization or startup failures.
 * @internal
 */
async function main() {
  const port = process.env.PORT ? Number(process.env.PORT) : 3456;
  const host = process.env.HOST ?? '0.0.0.0';
  const config = loadConfig();

  // Create mandatory authentication configuration
  const inboundAuth = createDefaultAuthConfig();

  type ProxyCtor = new (config: ReturnType<typeof loadConfig>) => import('mcp-funnel').MCPProxy;
  const runtime = (await import('mcp-funnel')) as unknown as {
    MCPProxy: ProxyCtor;
  };
  const proxy = new runtime.MCPProxy(config);
  try {
    await proxy.initialize();
  } catch (e) {
    console.error(
      '[server] MCP proxy initialization failed, starting web server without backends:',
      e,
    );
  }

  // Start server with mandatory authentication
  await startWebServer(proxy, { port, host, inboundAuth });
}

main().catch((err) => {
  console.error('[server] Failed to start web server:', err);
  process.exit(1);
});
