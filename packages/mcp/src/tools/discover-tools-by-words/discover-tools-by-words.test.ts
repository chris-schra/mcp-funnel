import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DiscoverToolsByWords } from './index.js';
import { CoreToolContext } from '../core-tool.interface.js';
import { ToolRegistry, ToolState } from '../../tool-registry.js';

describe('DiscoverToolsByWords', () => {
  let tool: DiscoverToolsByWords;
  let mockContext: CoreToolContext;
  let enabledTools: string[] = [];

  beforeEach(() => {
    tool = new DiscoverToolsByWords();
    enabledTools = [];

    const toolDescriptionCache = new Map();
    toolDescriptionCache.set('github__create_issue', {
      serverName: 'github',
      description: 'Create a new issue in a GitHub repository',
    });
    toolDescriptionCache.set('github__list_issues', {
      serverName: 'github',
      description: 'List issues from a GitHub repository',
    });
    toolDescriptionCache.set('github__close_issue', {
      serverName: 'github',
      description: 'Close an existing issue in GitHub',
    });
    toolDescriptionCache.set('filesystem__read_file', {
      serverName: 'filesystem',
      description: 'Read contents from a file on the filesystem',
    });
    toolDescriptionCache.set('filesystem__write_file', {
      serverName: 'filesystem',
      description: 'Write content to a file on the filesystem',
    });
    toolDescriptionCache.set('memory__store_data', {
      serverName: 'memory',
      description: 'Store data in memory for later retrieval',
    });

    const mockRegistry: Partial<ToolRegistry> = {
      searchTools: vi.fn((keywords: string[]) => {
        // Simple mock implementation that mimics the real search
        const allTools: ToolState[] = [];
        for (const [
          name,
          { serverName, description },
        ] of toolDescriptionCache) {
          const searchText =
            `${name} ${description} ${serverName}`.toLowerCase();
          if (keywords.length === 0) continue;
          if (keywords.every((kw) => searchText.includes(kw.toLowerCase()))) {
            const toolState: ToolState = {
              fullName: name,
              originalName: name.split('__')[1] || name,
              serverName,
              description,
              discovered: true,
              enabled: false,
              exposed: false,
            };
            allTools.push(toolState);
          }
        }
        return allTools;
      }),
      enableTools: vi.fn((tools: string[]) => {
        enabledTools.push(...tools);
        tools.forEach((t) => mockContext.dynamicallyEnabledTools.add(t));
      }),
      getToolForExecution: vi.fn(),
      getToolState: vi.fn(),
      getAllTools: vi.fn(() => []),
      getToolDescriptions: vi.fn(() => toolDescriptionCache),
      getToolDefinitions: vi.fn(() => new Map()),
    };

    mockContext = {
      toolRegistry: mockRegistry as ToolRegistry,
      toolDescriptionCache,
      dynamicallyEnabledTools: new Set(),
      config: {
        servers: [],
      },
      enableTools: (tools: string[]) => {
        enabledTools.push(...tools);
        tools.forEach((t) => mockContext.dynamicallyEnabledTools.add(t));
      },
    };
  });

  describe('tool definition', () => {
    it('should have correct name', () => {
      expect(tool.name).toBe('discover_tools_by_words');
    });

    it('should have proper tool schema', () => {
      const toolDef = tool.tool;
      expect(toolDef.name).toBe('discover_tools_by_words');
      expect(toolDef.description).toContain('Search for tools by keywords');
      expect(toolDef.inputSchema.type).toBe('object');
      expect(toolDef.inputSchema.required).toEqual(['words']);
      expect(toolDef.inputSchema.properties?.words).toBeDefined();
      expect(toolDef.inputSchema.properties?.enable).toBeDefined();
      const wordsSchema = toolDef.inputSchema.properties?.words as {
        type: string;
        description: string;
      };
      const enableSchema = toolDef.inputSchema.properties?.enable as {
        type: string;
        description: string;
        default: boolean;
      };
      expect(wordsSchema.type).toBe('string');
      expect(enableSchema.type).toBe('boolean');
      expect(enableSchema.default).toBe(false);
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
          exposeCoreTools: ['discover_tools_by_words'],
        }),
      ).toBe(true);
    });

    it('should be enabled when exposeCoreTools has matching pattern', () => {
      expect(
        tool.isEnabled({ servers: [], exposeCoreTools: ['discover_*'] }),
      ).toBe(true);
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
    it('should find tools matching keywords', async () => {
      const result = await tool.handle({ words: 'github issue' }, mockContext);

      expect(result.content).toHaveLength(1);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Found 3 tools');
      expect(textContent.text).toContain('github__create_issue');
      expect(textContent.text).toContain('github__list_issues');
      expect(textContent.text).toContain('github__close_issue');
      expect(textContent.text).toContain('Legend:');
    });

    it('should find tools with partial keyword matches', async () => {
      const result = await tool.handle({ words: 'file' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Found 2 tools');
      expect(textContent.text).toContain('filesystem__read_file');
      expect(textContent.text).toContain('filesystem__write_file');
    });

    it('should handle multiple keywords', async () => {
      const result = await tool.handle(
        { words: 'store memory data' },
        mockContext,
      );

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('memory__store_data');
    });

    it('should return empty result for non-matching keywords', async () => {
      const result = await tool.handle(
        { words: 'nonexistent keyword' },
        mockContext,
      );

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No local tools found matching keywords: nonexistent keyword',
      );
    });

    it('should enable tools when enable=true', async () => {
      const result = await tool.handle(
        { words: 'github issue', enable: true },
        mockContext,
      );

      expect(enabledTools).toContain('github__create_issue');
      expect(enabledTools).toContain('github__list_issues');
      expect(enabledTools).toContain('github__close_issue');

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Found and enabled 3 tools');
    });

    it('should not enable tools when enable=false', async () => {
      await tool.handle({ words: 'github issue', enable: false }, mockContext);

      expect(enabledTools).toHaveLength(0);
    });

    it('should not enable tools when enable is not provided', async () => {
      await tool.handle({ words: 'github issue' }, mockContext);

      expect(enabledTools).toHaveLength(0);
    });

    it('should score exact word matches higher than substring matches', async () => {
      // Add a tool that has 'issue' as substring but not as a word
      mockContext.toolDescriptionCache.set('test__tissue_sample', {
        serverName: 'test',
        description: 'Process tissue samples in the lab',
      });

      const result = await tool.handle({ words: 'issue' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      // GitHub tools with 'issue' as a word should come before 'tissue'
      const lines = textContent.text.split('\n');
      const githubIndex = lines.findIndex((l) => l.includes('github__'));
      const tissueIndex = lines.findIndex((l) =>
        l.includes('test__tissue_sample'),
      );

      if (tissueIndex !== -1) {
        expect(githubIndex).toBeLessThan(tissueIndex);
      }
    });

    it('should handle empty words parameter', async () => {
      const result = await tool.handle({ words: '' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No local tools found matching keywords',
      );
    });

    it('should handle whitespace-only words parameter', async () => {
      const result = await tool.handle({ words: '   ' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain(
        'No local tools found matching keywords',
      );
    });

    it('should throw error for invalid words parameter', async () => {
      await expect(tool.handle({ words: 123 }, mockContext)).rejects.toThrow(
        'Missing or invalid "words" parameter',
      );
    });

    it('should throw error for missing words parameter', async () => {
      await expect(tool.handle({}, mockContext)).rejects.toThrow(
        'Missing or invalid "words" parameter',
      );
    });

    it('should handle enable as non-boolean gracefully', async () => {
      const result = await tool.handle(
        { words: 'github', enable: 'yes' },
        mockContext,
      );

      // Should treat non-boolean as false
      expect(enabledTools).toHaveLength(0);
      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.text).toContain('Legend:');
    });

    it('should sort results by score and then alphabetically', async () => {
      // Add tools that will have different scores
      mockContext.toolDescriptionCache.set('a__exact_match', {
        serverName: 'a',
        description: 'This has github and issue as exact words',
      });
      mockContext.toolDescriptionCache.set('z__partial_match', {
        serverName: 'z',
        description: 'This has github',
      });

      const result = await tool.handle({ words: 'github issue' }, mockContext);

      const textContent = result.content[0] as { type: string; text: string };
      const lines = textContent.text.split('\n');

      // Tools with both keywords should appear before tools with just one
      const exactMatchIndex = lines.findIndex((l) =>
        l.includes('a__exact_match'),
      );
      const partialMatchIndex = lines.findIndex((l) =>
        l.includes('z__partial_match'),
      );

      if (exactMatchIndex !== -1 && partialMatchIndex !== -1) {
        expect(exactMatchIndex).toBeLessThan(partialMatchIndex);
      }
    });
  });
});
