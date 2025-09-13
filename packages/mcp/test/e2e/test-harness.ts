import { MCPProxy } from '../../src/mcp-funnel.js';
import { ProxyConfig } from '../../src/config.js';
// TODO: Will be used when implementing server transport
// import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

/**
 * Create a standalone MCP Funnel server that can be spawned by Claude SDK
 * This is used as the entry point for e2e tests
 */
export async function createTestFunnelServer(configPath: string) {
  // Load config from path provided as argument
  const fs = await import('fs');
  const config: ProxyConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Create and start the proxy
  const proxy = new MCPProxy(config);
  await proxy.start();
}

// If run directly, start the server
if (import.meta.url === `file://${process.argv[1]}`) {
  const configPath = process.argv[2];
  if (!configPath) {
    console.error('Usage: tsx test-harness.ts <config-path>');
    process.exit(1);
  }

  createTestFunnelServer(configPath).catch((error) => {
    console.error('Test harness error:', error);
    process.exit(1);
  });
}
