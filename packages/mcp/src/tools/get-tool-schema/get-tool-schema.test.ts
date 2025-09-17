import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GetToolSchema } from './index.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolRegistry, ToolState } from '../../tool-registry.js';

describe('GetToolSchema', () => {
  let tool: GetToolSchema;
  let mockContext: CoreToolContext;

  beforeEach(() => {
    tool = new GetToolSchema();

    const mockToolDefinitionCache = new Map<
      string,
      { serverName: string; tool: Tool }
    >();
    mockToolDefinitionCache.set('github__create_issue', {
      serverName: 'github',
      tool: {
        name: 'create_issue',
        description: 'Create a new issue in a GitHub repository',
        inputSchema: {
          type: 'object',
          properties: {
            repository: { type: 'string', description: 'Repository name' },
            title: { type: 'string', description: 'Issue title' },
            body: { type: 'string', description: 'Issue body' },
          },
          required: ['repository', 'title'],
        },
      },
    });

    const mockRegistry: Partial<ToolRegistry> = {
      getToolState: vi.fn((name: string) => {
        const def = mockToolDefinitionCache.get(name);
        if (def) {
          const toolState: ToolState = {
            fullName: name,
            originalName: def.tool.name,
            serverName: def.serverName,
            discovered: true,
            enabled: true,
            exposed: true,
            definition: def.tool,
            description: def.tool.description,
          };
          return toolState;
        }
        return undefined;
      }),
      searchTools: vi.fn(),
      enableTools: vi.fn(),
      getToolForExecution: vi.fn(),
      getAllTools: vi.fn(() => []),
      getToolDescriptions: vi.fn(() => new Map()),
      getToolDefinitions: vi.fn(() => mockToolDefinitionCache),
    };

    mockContext = {
      toolRegistry: mockRegistry as ToolRegistry,
      toolDescriptionCache: new Map(),
      toolDefinitionCache: mockToolDefinitionCache,
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
      },
      enableTools: () => {},
    };
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('get_tool_schema');
    });

    it('should have proper tool schema', () => {
      const toolDef = tool.tool;
      expect(toolDef.name).toBe('get_tool_schema');
      expect(toolDef.description).toContain('input schema');
      expect(toolDef.inputSchema).toEqual({
        type: 'object',
        properties: {
          tool: {
            type: 'string',
            description:
              'Full tool name including server prefix (e.g., "github__create_issue")',
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
        tool.isEnabled({ servers: [], exposeCoreTools: ['get_tool_schema'] }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['get_*'] })).toBe(
        true,
      );
    });

    it('should be enabled when exposeCoreTools is ["*"]', () => {
      expect(tool.isEnabled({ servers: [], exposeCoreTools: ['*'] })).toBe(
        true,
      );
    });

    it('should be disabled when exposeCoreTools excludes the tool', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['other_tool'] }),
      ).toBe(false);
    });
  });

  describe('handle', () => {
    it('should return tool schema for existing tool', async () => {
      const result = await tool.handle(
        { tool: 'github__create_issue' },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content.type).toBe('text');

      const textContent = content as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.tool).toBe('github__create_issue');
      expect(parsed.inputSchema).toEqual({
        type: 'object',
        properties: {
          repository: { type: 'string', description: 'Repository name' },
          title: { type: 'string', description: 'Issue title' },
          body: { type: 'string', description: 'Issue body' },
        },
        required: ['repository', 'title'],
      });
      expect(parsed.usage).toContain('bridge_tool_request');
      expect(parsed.description).toBe(
        'Create a new issue in a GitHub repository',
      );
    });

    it('should return error message for non-existent tool', async () => {
      const result = await tool.handle(
        { tool: 'nonexistent__tool' },
        mockContext,
      );

      expect(result.content).toHaveLength(1);
      const content = result.content[0];
      expect(content.type).toBe('text');
      const textContent = content as { type: string; text: string };
      expect(textContent.text).toContain('Tool not found: nonexistent__tool');
      expect(textContent.text).toContain('discover_tools_by_words');
    });

    it('should handle tool without inputSchema', async () => {
      mockContext.toolDefinitionCache?.set('simple__tool', {
        serverName: 'simple',
        tool: {
          name: 'tool',
          description: 'A simple tool',
        } as Tool,
      });

      const result = await tool.handle({ tool: 'simple__tool' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text);
      expect(parsed.inputSchema).toEqual({
        type: 'object',
        properties: {},
      });
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

    it('should handle missing toolDefinitionCache gracefully', async () => {
      const contextWithoutCache = {
        ...mockContext,
        toolDefinitionCache: undefined,
      };
      const result = await tool.handle(
        { tool: 'any__tool' },
        contextWithoutCache,
      );

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Tool not found');
    });
  });
});
