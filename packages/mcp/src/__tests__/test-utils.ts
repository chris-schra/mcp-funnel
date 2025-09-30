import { vi } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

export type MockServer = {
  setRequestHandler: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  sendToolListChanged: ReturnType<typeof vi.fn>;
  notification: ReturnType<typeof vi.fn>;
} & Server;

export type MockClient = {
  connect: ReturnType<typeof vi.fn>;
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
} & Client;

/**
 * Creates a mock MCP Server instance for testing.
 *
 * @returns Mock server with vitest-mocked methods
 */
export function createMockServer(): MockServer {
  return {
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    sendToolListChanged: vi.fn(),
    notification: vi.fn(),
  } as MockServer;
}

/**
 * Creates a mock MCP Client instance for testing.
 *
 * @returns Mock client with vitest-mocked methods and default tool responses
 */
export function createMockClient(): MockClient {
  return {
    connect: vi.fn(),
    listTools: vi.fn().mockResolvedValue({
      tools: [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: {
              input: { type: 'string' },
            },
          },
        },
      ],
    }),
    callTool: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Tool executed' }],
    }),
  } as MockClient;
}

/**
 * Finds the tools/list request handler from a mock server's registered handlers.
 *
 * @param mockServer - The mock server instance to search for the handler
 * @returns The matching handler call or undefined if not found
 */
export function findListToolsHandler(mockServer: MockServer) {
  return mockServer.setRequestHandler.mock.calls.find((call) => {
    const schema = call[0] as { parse?: (data: unknown) => unknown };
    try {
      return schema.parse && schema.parse({ method: 'tools/list' });
    } catch {
      return false;
    }
  });
}
