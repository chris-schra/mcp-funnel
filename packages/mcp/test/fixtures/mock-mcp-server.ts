#!/usr/bin/env tsx
/**
 * Mock MCP server for testing real stdio/JSONL communication
 * This server implements the MCP protocol over stdio for integration testing
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const serverName = process.argv[2] || 'mock-server';
const toolPrefix = process.argv[3] || 'test';

// Create mock tools based on server name
const tools = [
  {
    name: `${toolPrefix}_tool1`,
    description: `First tool from ${serverName}`,
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string', description: 'Test message' },
      },
      required: ['message'],
    },
  },
  {
    name: `${toolPrefix}_tool2`,
    description: `Second tool from ${serverName}`,
    inputSchema: {
      type: 'object',
      properties: {
        count: { type: 'number', description: 'Test count' },
        enabled: { type: 'boolean', description: 'Test flag' },
      },
      required: ['count'],
    },
  },
  {
    name: `${toolPrefix}_error`,
    description: `Tool that always errors from ${serverName}`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// Log to stderr for debugging (will be prefixed by transport)
console.error(`${serverName} starting up with ${tools.length} tools`);

// Create server
const server = new Server(
  {
    name: serverName,
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Handle tool listing
server.setRequestHandler(ListToolsRequestSchema, async () => {
  console.error(`${serverName} listing tools`);
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  console.error(`${serverName} calling tool: ${name}`);

  // Simulate different behaviors
  if (name === `${toolPrefix}_tool1`) {
    return {
      content: [
        {
          type: 'text',
          text: `Response from ${serverName}: ${(args as { message: string }).message}`,
        },
      ],
    };
  }

  if (name === `${toolPrefix}_tool2`) {
    const typedArgs = args as { count?: number; enabled?: boolean };
    const count = typedArgs.count || 0;
    const enabled = typedArgs.enabled || false;
    return {
      content: [
        {
          type: 'text',
          text: `Processed count=${count}, enabled=${enabled}`,
        },
      ],
    };
  }

  if (name === `${toolPrefix}_error`) {
    throw new Error(`Simulated error from ${serverName}`);
  }

  throw new Error(`Unknown tool: ${name}`);
});

/** Starts mock MCP server with stdio transport */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`${serverName} connected and ready`);
}

main().catch((error) => {
  console.error(`${serverName} fatal error:`, error);
  process.exit(1);
});
