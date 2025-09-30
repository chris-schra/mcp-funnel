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

export function createMockServer(): MockServer {
  return {
    setRequestHandler: vi.fn(),
    connect: vi.fn(),
    sendToolListChanged: vi.fn(),
    notification: vi.fn(),
  } as MockServer;
}

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
