import { vi } from 'vitest';
import { CoreToolContext } from '../../core-tool.interface.js';
import { ToolRegistry, ToolState } from '../../../tool-registry/index.js';

/**
 *
 * @param enabledTools
 */
export function createMockContext(enabledTools: string[]): CoreToolContext {
  const toolDescriptionCache = new Map([
    [
      'github__create_issue',
      { serverName: 'github', description: 'Create an issue' },
    ],
    [
      'github__update_issue',
      { serverName: 'github', description: 'Update an issue' },
    ],
    [
      'github__list_pull_requests',
      { serverName: 'github', description: 'List PRs' },
    ],
    [
      'github__create_pull_request',
      { serverName: 'github', description: 'Create a PR' },
    ],
    [
      'github__update_pull_request',
      { serverName: 'github', description: 'Update a PR' },
    ],
    [
      'github__merge_pull_request',
      { serverName: 'github', description: 'Merge a PR' },
    ],
    ['memory__store', { serverName: 'memory', description: 'Store data' }],
    [
      'memory__retrieve',
      { serverName: 'memory', description: 'Retrieve data' },
    ],
  ]);

  const mockRegistry: Partial<ToolRegistry> = {
    getAllTools: vi.fn(() => {
      const tools: ToolState[] = [];
      for (const [name, { serverName, description }] of toolDescriptionCache) {
        const toolState: ToolState = {
          fullName: name,
          originalName: name.split('__')[1] || name,
          serverName,
          description,
          discovered: true,
          enabled: false,
          exposed: false,
        };
        tools.push(toolState);
      }
      return tools;
    }),
    enableTools: vi.fn((tools: string[]) => {
      enabledTools.push(...tools);
    }),
    searchTools: vi.fn(),
    getToolForExecution: vi.fn(),
    getToolState: vi.fn(),
    getToolDescriptions: vi.fn(() => toolDescriptionCache),
    getToolDefinitions: vi.fn(() => new Map()),
  };

  return {
    toolRegistry: mockRegistry as ToolRegistry,
    toolDescriptionCache,
    dynamicallyEnabledTools: new Set<string>(),
    config: {
      servers: [],
      toolsets: {
        reviewer: ['github__*_pull_request*', 'github__update_issue'],
        coder: ['github__create_pull_request'],
        memory: ['memory__*'],
      },
    },
    configPath: './.mcp-funnel.json',
    enableTools: vi.fn((tools: string[]) => {
      enabledTools.push(...tools);
    }),
  };
}
