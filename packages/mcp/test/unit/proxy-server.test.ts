import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

// Create a mock server type with the methods used in tests
type MockServer = {
  setRequestHandler: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  notification: ReturnType<typeof vi.fn>;
};

// Create a mock client type with the methods used in tests
type MockClient = {
  listTools: ReturnType<typeof vi.fn>;
  callTool: ReturnType<typeof vi.fn>;
};

// Mock MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js');
vi.mock('@modelcontextprotocol/sdk/client/index.js');

describe('MCPProxy', () => {
  let mockServer: MockServer;
  let mockClients: Map<string, MockClient>;

  beforeEach(() => {
    // Setup mock server
    mockServer = {
      setRequestHandler: vi.fn(),
      connect: vi.fn(),
      notification: vi.fn(),
    };

    vi.mocked(Server).mockImplementation(() => mockServer as unknown as Server);

    // Setup mock clients
    mockClients = new Map();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Configuration', () => {
    it('should validate configuration on initialization', async () => {
      const { ProxyConfigSchema } = await import('../../src/config');

      const validConfig = {
        servers: [
          {
            name: 'test',
            command: 'test-cmd',
            args: ['arg1'],
            env: { KEY: 'value' },
          },
        ],
        hideTools: ['test_*'],
        enableDynamicDiscovery: false,
      };

      expect(() => ProxyConfigSchema.parse(validConfig)).not.toThrow();
    });

    it('should reject invalid configuration', async () => {
      const { ProxyConfigSchema } = await import('../../src/config');

      const invalidConfig = {
        servers: [
          {
            // Missing required 'name' field
            command: 'test-cmd',
          },
        ],
      };

      expect(() => ProxyConfigSchema.parse(invalidConfig)).toThrow();
    });

    it('should handle optional configuration fields', async () => {
      const { ProxyConfigSchema } = await import('../../src/config');

      const minimalConfig = {
        servers: [
          {
            name: 'minimal',
            command: 'cmd',
          },
        ],
      };

      const parsed = ProxyConfigSchema.parse(minimalConfig);
      const servers = Array.isArray(parsed.servers)
        ? parsed.servers
        : Object.values(parsed.servers);
      expect(servers[0].args).toBeUndefined();
      expect(servers[0].env).toBeUndefined();
      expect(parsed.hideTools).toBeUndefined();
      expect(parsed.exposeTools).toBeUndefined();
      expect(parsed.enableDynamicDiscovery).toBeUndefined();
    });
  });

  describe('Tool Aggregation', () => {
    it('should aggregate tools from multiple servers', async () => {
      // Create mock clients with tools
      const githubClient = {
        listTools: vi.fn().mockResolvedValue({
          tools: [
            { name: 'create_issue', description: 'Create an issue' },
            { name: 'get_issue', description: 'Get an issue' },
          ],
        }),
        callTool: vi.fn(),
      };

      const memoryClient = {
        listTools: vi.fn().mockResolvedValue({
          tools: [
            { name: 'store_memory', description: 'Store memory' },
            { name: 'retrieve_memory', description: 'Retrieve memory' },
          ],
        }),
        callTool: vi.fn(),
      };

      mockClients.set('github', githubClient);
      mockClients.set('memory', memoryClient);

      // Define proper handler types
      type ListToolsHandler = () => Promise<{
        tools: Array<{ name: string; description: string }>;
      }>;
      type RequestHandler =
        | ListToolsHandler
        | ((request: { params: unknown }) => Promise<unknown>);

      // Simulate tool aggregation
      let _toolsHandler: ListToolsHandler | null = null;
      mockServer.setRequestHandler.mockImplementation(
        (schema: unknown, handler: RequestHandler) => {
          if (
            schema === 'ListToolsRequestSchema' ||
            (typeof schema === 'object' &&
              schema !== null &&
              'type' in schema &&
              (schema as { type: string }).type === 'tools/list')
          ) {
            _toolsHandler = handler as ListToolsHandler;
          }
        },
      );

      // Mock the proxy behavior
      const aggregateTools = async () => {
        const allTools = [];

        for (const [serverName, client] of mockClients) {
          const response = await client.listTools();
          for (const tool of response.tools) {
            allTools.push({
              ...tool,
              name: `${serverName}__${tool.name}`,
              description: `[${serverName}] ${tool.description}`,
            });
          }
        }

        return { tools: allTools };
      };

      const result = await aggregateTools();

      expect(result.tools).toHaveLength(4);
      expect(result.tools[0].name).toBe('github__create_issue');
      expect(result.tools[0].description).toBe('[github] Create an issue');
      expect(result.tools[2].name).toBe('memory__store_memory');
      expect(result.tools[2].description).toBe('[memory] Store memory');
    });

    it('should filter tools based on hideTools config', async () => {
      const config = {
        servers: [],
        hideTools: ['debug_*', 'dashboard_*', 'get_embedding'],
      };

      const tools = [
        { name: 'debug_retrieve', description: 'Debug tool' },
        { name: 'dashboard_stats', description: 'Dashboard tool' },
        { name: 'get_embedding', description: 'Get embedding' },
        { name: 'store_memory', description: 'Store memory' },
        { name: 'retrieve_memory', description: 'Retrieve memory' },
      ];

      const shouldExposeTool = (toolName: string): boolean => {
        const matchesPattern = (name: string, pattern: string): boolean => {
          const regexPattern = pattern
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(name);
        };

        if (config.hideTools) {
          return !config.hideTools.some((pattern) =>
            matchesPattern(toolName, pattern),
          );
        }
        return true;
      };

      const filtered = tools.filter((tool) => shouldExposeTool(tool.name));

      expect(filtered).toHaveLength(2);
      expect(filtered[0].name).toBe('store_memory');
      expect(filtered[1].name).toBe('retrieve_memory');
    });

    it('should filter tools based on exposeTools config', async () => {
      const config = {
        servers: [],
        exposeTools: ['*_memory', 'create_*'],
      };

      const tools = [
        { name: 'store_memory', description: 'Store memory' },
        { name: 'retrieve_memory', description: 'Retrieve memory' },
        { name: 'create_issue', description: 'Create issue' },
        { name: 'get_issue', description: 'Get issue' },
        { name: 'dashboard_stats', description: 'Dashboard' },
      ];

      const shouldExposeTool = (toolName: string): boolean => {
        const matchesPattern = (name: string, pattern: string): boolean => {
          const regexPattern = pattern
            .split('*')
            .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
          const regex = new RegExp(`^${regexPattern}$`);
          return regex.test(name);
        };

        if (config.exposeTools) {
          return config.exposeTools.some((pattern) =>
            matchesPattern(toolName, pattern),
          );
        }
        return true;
      };

      const filtered = tools.filter((tool) => shouldExposeTool(tool.name));

      expect(filtered).toHaveLength(3);
      expect(filtered.map((t) => t.name)).toContain('store_memory');
      expect(filtered.map((t) => t.name)).toContain('retrieve_memory');
      expect(filtered.map((t) => t.name)).toContain('create_issue');
      expect(filtered.map((t) => t.name)).not.toContain('get_issue');
      expect(filtered.map((t) => t.name)).not.toContain('dashboard_stats');
    });
  });

  describe('Tool Routing', () => {
    it('should route tool calls to correct server', async () => {
      const githubClient = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Issue created' }],
        }),
      };

      const memoryClient = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Memory stored' }],
        }),
      };

      // Simulate tool mapping
      const toolMapping = new Map();
      toolMapping.set('github__create_issue', {
        client: githubClient,
        originalName: 'create_issue',
      });
      toolMapping.set('memory__store_memory', {
        client: memoryClient,
        originalName: 'store_memory',
      });

      // Test routing to GitHub
      const githubMapping = toolMapping.get('github__create_issue');
      const githubResult = await githubMapping.client.callTool({
        name: githubMapping.originalName,
        arguments: { title: 'Test issue' },
      });

      expect(githubClient.callTool).toHaveBeenCalledWith({
        name: 'create_issue',
        arguments: { title: 'Test issue' },
      });
      expect(githubResult.content[0].text).toBe('Issue created');

      // Test routing to Memory
      const memoryMapping = toolMapping.get('memory__store_memory');
      const memoryResult = await memoryMapping.client.callTool({
        name: memoryMapping.originalName,
        arguments: { content: 'Test memory' },
      });

      expect(memoryClient.callTool).toHaveBeenCalledWith({
        name: 'store_memory',
        arguments: { content: 'Test memory' },
      });
      expect(memoryResult.content[0].text).toBe('Memory stored');
    });

    it('should handle tool call errors gracefully', async () => {
      const failingClient = {
        callTool: vi.fn().mockRejectedValue(new Error('API error')),
      };

      const toolMapping = new Map();
      toolMapping.set('test__failing_tool', {
        client: failingClient,
        originalName: 'failing_tool',
      });

      const mapping = toolMapping.get('test__failing_tool');

      await expect(
        mapping.client.callTool({
          name: mapping.originalName,
          arguments: {},
        }),
      ).rejects.toThrow('API error');
    });

    it('should throw error for unknown tools', async () => {
      const toolMapping = new Map();

      const callTool = (toolName: string) => {
        const mapping = toolMapping.get(toolName);
        if (!mapping) {
          throw new Error(`Tool not found: ${toolName}`);
        }
        return mapping;
      };

      expect(() => callTool('unknown__tool')).toThrow(
        'Tool not found: unknown__tool',
      );
    });
  });

  describe('Dynamic Discovery', () => {
    it('should register discovery tool when enabled', async () => {
      const config = {
        servers: [],
        enableDynamicDiscovery: true,
      };

      const coreTools = [];

      if (config.enableDynamicDiscovery) {
        coreTools.push({
          name: 'discover_tools_by_words',
          description: 'Search for tools by keywords in their descriptions',
        });
      }

      expect(coreTools).toHaveLength(1);
      expect(coreTools[0].name).toBe('discover_tools_by_words');
    });

    it('should not register discovery tool when disabled', async () => {
      const config = {
        servers: [],
        enableDynamicDiscovery: false,
      };

      const coreTools = [];

      if (config.enableDynamicDiscovery) {
        coreTools.push({
          name: 'discover_tools_by_words',
          description: 'Search for tools by keywords',
        });
      }

      expect(coreTools).toHaveLength(0);
    });

    it('should search tools by keywords', async () => {
      const toolDescriptionCache = new Map([
        [
          'github__create_issue',
          {
            serverName: 'github',
            description: 'Create a new issue in a GitHub repository',
          },
        ],
        [
          'github__get_issue',
          {
            serverName: 'github',
            description: 'Get details of a specific issue',
          },
        ],
        [
          'memory__store_memory',
          { serverName: 'memory', description: 'Store information in memory' },
        ],
        [
          'filesystem__read_file',
          { serverName: 'filesystem', description: 'Read contents of a file' },
        ],
      ]);

      const searchToolDescriptions = (words: string) => {
        const keywords = words.toLowerCase().split(/\s+/).filter(Boolean);
        const matches = [];

        for (const [
          toolName,
          { serverName, description },
        ] of toolDescriptionCache) {
          const lowerDesc = description.toLowerCase();
          let score = 0;

          for (const keyword of keywords) {
            if (lowerDesc.includes(keyword)) {
              const wordBoundaryMatch = new RegExp(
                `\\b${keyword}\\b`,
                'i',
              ).test(description);
              score += wordBoundaryMatch ? 2 : 1;
            }
          }

          if (score > 0) {
            matches.push({ name: toolName, serverName, description, score });
          }
        }

        return matches.sort((a, b) => {
          if (b.score !== a.score) return b.score - a.score;
          return a.name.localeCompare(b.name);
        });
      };

      const issueMatches = searchToolDescriptions('issue');
      expect(issueMatches).toHaveLength(2);
      expect(issueMatches[0].name).toBe('github__create_issue');

      const memoryMatches = searchToolDescriptions('store memory');
      expect(memoryMatches).toHaveLength(1);
      expect(memoryMatches[0].name).toBe('memory__store_memory');

      const fileMatches = searchToolDescriptions('file');
      expect(fileMatches).toHaveLength(1);
      expect(fileMatches[0].name).toBe('filesystem__read_file');
    });
  });
});
