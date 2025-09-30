import { beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ManageCommands } from '../index.js';
import { CommandInstaller } from '@mcp-funnel/commands-core';
import type { CoreToolContext } from '../../core-tool.interface.js';
import type { ICommand } from '@mcp-funnel/commands-core';
import type { ToolRegistry } from '../../../tool-registry/index.js';

export interface SchemaProperty {
  type: string;
  enum?: string[];
  description: string;
  default?: boolean | string;
}

export interface TestContext {
  tool: ManageCommands;
  mockContext: CoreToolContext;
  testDir: string;
  mockInstaller: CommandInstaller;
}

// Create a mock command that implements ICommand interface
export const createMockCommand = (
  name: string,
  description: string,
): ICommand => ({
  name,
  description,
  executeToolViaMCP: vi.fn().mockResolvedValue({
    content: [{ type: 'text', text: 'mock result' }],
  }),
  executeViaCLI: vi.fn().mockResolvedValue(undefined),
  getMCPDefinitions: vi.fn().mockReturnValue([
    {
      name: `${name}_tool`,
      description: `Tool from ${name}`,
      inputSchema: { type: 'object', properties: {} },
    },
  ]),
});

export const setupTestContext = async (): Promise<TestContext> => {
  // Create temporary directory for testing
  const testDir = await fs.mkdtemp(join(tmpdir(), 'manage-commands-test-'));

  // Create a mock tool registry with hot-reload capability
  const mockToolRegistry: Partial<ToolRegistry> = {
    hotReloadCommand: vi.fn(),
    getAllTools: vi.fn().mockReturnValue([
      {
        fullName: 'test-command__test_tool',
        command: { name: 'test-command' },
        discovered: true,
      },
    ]),
  };

  const mockContext: CoreToolContext = {
    toolRegistry: mockToolRegistry as ToolRegistry,
    toolDescriptionCache: new Map(),
    dynamicallyEnabledTools: new Set(),
    config: {
      servers: [],
    },
    configPath: './.mcp-funnel.json',
    enableTools: vi.fn(),
  };

  // Create mock installer
  const mockInstallerPartial: Partial<CommandInstaller> = {
    install: vi.fn(),
    uninstall: vi.fn(),
    update: vi.fn(),
    getManifestPath: vi.fn().mockReturnValue('/mock/manifest.json'),
    loadInstalledCommand: vi.fn(),
  };
  const mockInstaller = mockInstallerPartial as CommandInstaller;

  // Create tool with mock installer via dependency injection
  const tool = new ManageCommands(mockInstaller);

  // Clear all mocks before each test
  vi.clearAllMocks();

  return { tool, mockContext, testDir, mockInstaller };
};

export const cleanupTestContext = async (testDir: string): Promise<void> => {
  // Cleanup test directory
  try {
    await fs.rm(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.clearAllMocks();
};

// Setup and teardown hooks for tests
export const useTestContext = (): (() => TestContext) => {
  let context: TestContext;

  beforeEach(async () => {
    context = await setupTestContext();
  });

  afterEach(async () => {
    await cleanupTestContext(context.testDir);
  });

  return () => context;
};
