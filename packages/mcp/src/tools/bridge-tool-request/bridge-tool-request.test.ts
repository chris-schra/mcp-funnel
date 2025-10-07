import { describe, it, expect, beforeEach, vi, MockedFunction } from 'vitest';
import { BridgeToolRequest } from './index.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { ToolRegistry, ToolState } from '../../tool-registry/index.js';

describe('BridgeToolRequest', () => {
  let tool: BridgeToolRequest;
  let mockContext: CoreToolContext;
  let mockClient: { callTool: MockedFunction<Client['callTool']> };

  beforeEach(() => {
    tool = new BridgeToolRequest();

    // Create mock client
    mockClient = {
      callTool: vi.fn() as MockedFunction<Client['callTool']>,
    };

    const mockToolMapping = new Map();
    mockToolMapping.set('github__create_issue', {
      client: mockClient as unknown as Client,
      originalName: 'create_issue',
    });
    mockToolMapping.set('filesystem__read_file', {
      client: mockClient as unknown as Client,
      originalName: 'read_file',
    });

    const mockRegistry: Partial<ToolRegistry> = {
      getToolForExecution: vi.fn((name: string) => {
        const mapping = mockToolMapping.get(name);
        if (mapping) {
          const toolState: Partial<ToolState> = {
            fullName: name,
            originalName: mapping.originalName,
            serverName: name.split('__')[0],
            client: mapping.client,
            discovered: true,
            enabled: true,
            exposed: true,
          };
          return toolState as ToolState;
        }
        return undefined;
      }),
      enableTools: vi.fn(),
      searchTools: vi.fn(),
      getToolState: vi.fn(),
      getAllTools: vi.fn(() => []),
      getToolDescriptions: vi.fn(() => new Map()),
      getToolDefinitions: vi.fn(() => new Map()),
    };

    mockContext = {
      toolRegistry: mockRegistry as ToolRegistry,
      toolDescriptionCache: new Map(),
      toolMapping: mockToolMapping,
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
        exposeCoreTools: [
          'discover_tools_by_words',
          'bridge_tool_request',
          'load_toolset',
          'get_tool_schema',
        ],
      },
      configPath: './.mcp-funnel.json',
      enableTools: () => {},
    };
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('bridge_tool_request');
    });

    it('should have proper tool schema', () => {
      const toolDef = tool.tool;
      expect(toolDef.name).toBe('bridge_tool_request');
      expect(toolDef.description).toContain('Execute any discovered tool');
      expect(toolDef.inputSchema).toEqual({
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name from discover_tools_by_words (e.g., "github__create_issue")',
          },
          arguments: {
            type: 'object',
            description:
              "Arguments matching the tool's inputSchema (obtained from get_tool_schema)",
            additionalProperties: true,
          },
        },
        required: ['tool'],
      });
    });
  });

  describe('isEnabled', () => {
    it('should be enabled when exposeCoreTools is not specified', () => {
      expect(tool.isEnabled({ servers: [] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools is empty array', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: [] })).toBe(false);
    });

    it('should be enabled when exposeCoreTools includes tool name', () => {
      expect(
        tool.isEnabled({
          servers: [],
          exposeCoreTools: ['bridge_tool_request'],
        }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['bridge_*'] })).toBe(true);
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(true);
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] })).toBe(false);
    });
  });

  describe('handle', () => {
    it('should successfully bridge tool call', async () => {
      const mockResult = {
        content: [{ type: 'text', text: 'Issue created successfully' }],
      };
      mockClient.callTool.mockResolvedValue(mockResult);

      const result = await tool.handle(
        {
          tool: 'github__create_issue',
          arguments: {
            repository: 'test/repo',
            title: 'Test Issue',
            body: 'Test body',
          },
        },
        mockContext,
      );

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'create_issue',
        arguments: {
          repository: 'test/repo',
          title: 'Test Issue',
          body: 'Test body',
        },
      });
      expect(result).toEqual(mockResult);
    });

    it('should handle tool call without arguments', async () => {
      const mockResult = {
        content: [{ type: 'text', text: 'Success' }],
      };
      mockClient.callTool.mockResolvedValue(mockResult);

      await tool.handle({ tool: 'filesystem__read_file' }, mockContext);

      expect(mockClient.callTool).toHaveBeenCalledWith({
        name: 'read_file',
        arguments: undefined,
      });
    });

    it('should return error for non-existent tool', async () => {
      const result = await tool.handle({ tool: 'nonexistent__tool' }, mockContext);

      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content.type).toBe('text');
      const textContent = content as { type: string; text: string };
      expect(textContent.text).toContain('Tool not found or not exposed: nonexistent__tool');
      expect(result.isError).toBe(true);
    });

    it('should handle tool execution errors gracefully', async () => {
      const error = new Error('API rate limit exceeded');
      mockClient.callTool.mockRejectedValue(error);

      const result = await tool.handle(
        { tool: 'github__create_issue', arguments: {} },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Failed to execute tool github__create_issue');
      expect(textContent.text).toContain('API rate limit exceeded');
      expect(result.isError).toBe(true);
    });

    it('should handle non-Error exceptions', async () => {
      mockClient.callTool.mockRejectedValue('String error');

      const result = await tool.handle({ tool: 'github__create_issue' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('String error');
      expect(result.isError).toBe(true);
    });

    it('should throw error for invalid tool parameter', async () => {
      await expect(tool.handle({ tool: 123 }, mockContext)).rejects.toThrow(
        'Missing or invalid "tool" parameter',
      );
    });

    it('should throw error for missing tool parameter', async () => {
      await expect(tool.handle({}, mockContext)).rejects.toThrow(
        'Missing or invalid "tool" parameter',
      );
    });

    it('should handle missing toolMapping gracefully', async () => {
      const contextWithoutMapping = { ...mockContext, toolMapping: undefined };

      const result = await tool.handle({ tool: 'any__tool' }, contextWithoutMapping);

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Tool not found or not exposed');
      expect(result.isError).toBe(true);
    });
  });
});
