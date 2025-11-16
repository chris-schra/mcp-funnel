import { beforeEach, vi } from 'vitest';
import { CoreToolContext } from '../../core-tool.interface.js';
import type { ToolRegistry } from '../../../tool-registry/index.js';
import { SearchRegistryTools } from '../index.js';

export interface TestContext {
  tool: SearchRegistryTools;
  mockContext: CoreToolContext;
}

// Mock fetch globally
export const mockFetch = vi.fn();

export const setupTestContext = (): TestContext => {
  const tool = new SearchRegistryTools();

  const mockContext: CoreToolContext = {
    toolRegistry: {} as ToolRegistry,
    toolDescriptionCache: new Map(),
    dynamicallyEnabledTools: new Set(),
    config: {
      servers: [],
    },
    configPath: './.mcp-funnel.json',
    enableTools: vi.fn(),
  };

  // Reset mocks
  vi.clearAllMocks();

  // Setup default mock fetch responses for search endpoint
  mockFetch.mockImplementation(async (url: string) => {
    if (url.includes('/v0/servers?search=')) {
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        json: async () => ({
          servers: [
            {
              id: 'github-mcp-server',
              name: 'GitHub MCP Server',
              description: 'Interact with GitHub repositories, issues, and pull requests',
              registry_type: 'official',
              remotes: [],
              _meta: {
                'io.modelcontextprotocol.registry/official': {
                  id: 'github-mcp-server',
                },
              },
            },
            {
              id: 'filesystem-server',
              name: 'File System Server',
              description: 'Read and write files on the local filesystem',
              registry_type: 'official',
              remotes: [],
              _meta: {
                'io.modelcontextprotocol.registry/official': {
                  id: 'filesystem-server',
                },
              },
            },
          ],
          metadata: {
            count: 2,
            next_cursor: null,
          },
        }),
      };
    }
    throw new Error(`Unmocked fetch request: ${url}`);
  });

  return { tool, mockContext };
};

export const useTestContext = (): (() => TestContext) => {
  let context: TestContext;

  beforeEach(() => {
    context = setupTestContext();
  });

  return () => context;
};
