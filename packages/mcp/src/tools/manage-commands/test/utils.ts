import { vi } from 'vitest';
import { join } from 'path';
import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import type { ICommandInstaller, InstalledCommand, ICommand } from '@mcp-funnel/commands-core';
import type { CoreToolContext } from '../../core-tool.interface.js';
import type { ToolRegistry } from '../../../tool-registry/index.js';
import { ManageCommands } from '../index.js';

/**
 * Options for creating a mock command
 */
export interface CreateMockCommandOptions {
  /** Command name */
  name: string;
  /** Command description */
  description: string;
  /** Tool name suffix (defaults to 'tool') */
  toolSuffix?: string;
}

/**
 * Creates a mock ICommand instance with configurable properties.
 * Implements the ICommand interface with vi.fn() mocks for all methods.
 *
 * @param nameOrOptions - Configuration options object or command name string
 * @param description - Command description (only used when nameOrOptions is a string)
 * @returns A mock ICommand instance
 *
 * @example
 * ```ts
 * const cmd = createMockCommand({ name: 'test-cmd', description: 'Test' });
 * const simpleCmd = createMockCommand('simple-cmd', 'Simple description');
 * ```
 */
export function createMockCommand(
  nameOrOptions: string | CreateMockCommandOptions,
  description?: string,
): ICommand {
  const options: CreateMockCommandOptions =
    typeof nameOrOptions === 'string'
      ? { name: nameOrOptions, description: description || '' }
      : nameOrOptions;

  const { name, description: desc, toolSuffix = 'tool' } = options;

  return {
    name,
    description: desc,
    executeToolViaMCP: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'mock result' }],
    }),
    executeViaCLI: vi.fn().mockResolvedValue(undefined),
    getMCPDefinitions: vi.fn().mockReturnValue([
      {
        name: `${name}_${toolSuffix}`,
        description: `Tool from ${name}`,
        inputSchema: { type: 'object', properties: {} },
      },
    ]),
  };
}

/**
 * Options for creating a placeholder InstalledCommand
 */
export interface CreateInstalledCommandOptions {
  /** Command name (defaults to 'placeholder') */
  name?: string;
  /** Package name (defaults to 'placeholder') */
  package?: string;
  /** Version (defaults to '0.0.0') */
  version?: string;
  /** Installation timestamp (defaults to epoch) */
  installedAt?: string;
  /** Command description */
  description?: string;
}

/**
 * Creates a placeholder InstalledCommand for testing.
 * Useful for creating test fixtures with minimal setup.
 *
 * @param options - Optional configuration to override defaults
 * @returns An InstalledCommand instance
 *
 * @example
 * ```ts
 * const placeholder = createPlaceholderInstalledCommand();
 * const custom = createPlaceholderInstalledCommand({
 *   name: 'my-cmd',
 *   version: '1.2.3',
 * });
 * ```
 */
export function createPlaceholderInstalledCommand(
  options: CreateInstalledCommandOptions = {},
): InstalledCommand {
  return {
    name: options.name ?? 'placeholder',
    package: options.package ?? 'placeholder',
    version: options.version ?? '0.0.0',
    installedAt: options.installedAt ?? new Date(0).toISOString(),
    ...(options.description && { description: options.description }),
  };
}

/**
 * Options for creating a mock installer
 */
export interface CreateMockInstallerOptions {
  /** Base path for commands directory */
  commandsPath: string;
  /** Default return value for install operations */
  defaultInstalledCommand?: InstalledCommand;
  /** Whether commands are initially installed (for isInstalled) */
  isInstalled?: boolean;
}

/**
 * Creates a mock ICommandInstaller with configurable behavior.
 * All methods are mocked with vi.fn() and can be overridden after creation.
 *
 * @param options - Configuration options
 * @returns A mock ICommandInstaller instance
 *
 * @example
 * ```ts
 * const installer = createMockInstaller({ commandsPath: '/tmp/test' });
 * installer.install = vi.fn().mockResolvedValue(customCommand);
 * ```
 */
export function createMockInstaller(options: CreateMockInstallerOptions): ICommandInstaller {
  const { commandsPath, defaultInstalledCommand, isInstalled = false } = options;

  return {
    install: vi.fn(async () => defaultInstalledCommand ?? createPlaceholderInstalledCommand()),
    uninstall: vi.fn(async () => undefined),
    update: vi.fn(async () => defaultInstalledCommand ?? createPlaceholderInstalledCommand()),
    isInstalled: vi.fn(async () => isInstalled),
    getCommandsPath: vi.fn(() => commandsPath),
    loadInstalledCommand: vi.fn(async () => null),
    getManifestPath: vi.fn(() => join(commandsPath, 'commands-manifest.json')),
  };
}

/**
 * Options for creating a mock tool registry
 */
export interface CreateMockToolRegistryOptions {
  /** Registered tools to return from getAllTools */
  tools?: Array<{
    fullName: string;
    command?: { name: string };
    discovered?: boolean;
  }>;
  /** Mock implementation for hotReloadCommand */
  hotReloadCommand?: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock ToolRegistry with configurable tools and behavior.
 * Implements only the subset of ToolRegistry methods used by ManageCommands.
 *
 * @param options - Configuration options
 * @returns A mock ToolRegistry instance
 *
 * @example
 * ```ts
 * const registry = createMockToolRegistry({
 *   tools: [{ fullName: 'cmd__tool', discovered: true }],
 * });
 * ```
 */
export function createMockToolRegistry(
  options: CreateMockToolRegistryOptions = {},
): Pick<ToolRegistry, 'hotReloadCommand' | 'getAllTools'> {
  const { tools = [], hotReloadCommand } = options;

  const defaultTools = tools.length
    ? tools
    : [
        {
          fullName: 'test-command__test_tool',
          command: { name: 'test-command' },
          discovered: true,
        },
      ];

  return {
    hotReloadCommand: hotReloadCommand ?? vi.fn(),
    getAllTools: vi.fn().mockReturnValue(defaultTools),
  } satisfies Pick<ToolRegistry, 'hotReloadCommand' | 'getAllTools'>;
}

/**
 * Options for creating a mock CoreToolContext
 */
export interface CreateMockContextOptions {
  /** Custom tool registry (if not provided, a default mock is created) */
  toolRegistry?: Pick<ToolRegistry, 'hotReloadCommand' | 'getAllTools'> | null;
  /** Configuration servers array */
  servers?: unknown[];
  /** Configuration path */
  configPath?: string;
  /** Mock implementation for enableTools */
  enableTools?: ReturnType<typeof vi.fn>;
}

/**
 * Creates a mock CoreToolContext with configurable options.
 * Provides sensible defaults for all required properties.
 *
 * @param options - Configuration options
 * @returns A mock CoreToolContext instance
 *
 * @example
 * ```ts
 * const context = createMockContext();
 * const contextWithoutRegistry = createMockContext({ toolRegistry: null });
 * const contextWithCustomRegistry = createMockContext({
 *   toolRegistry: createMockToolRegistry({ tools: [...] }),
 * });
 * ```
 */
export function createMockContext(options: CreateMockContextOptions = {}): CoreToolContext {
  const {
    toolRegistry = createMockToolRegistry(),
    servers = [],
    configPath = './.mcp-funnel.json',
    enableTools,
  } = options;

  return {
    toolRegistry: toolRegistry === null ? undefined : (toolRegistry as ToolRegistry),
    toolDescriptionCache: new Map(),
    dynamicallyEnabledTools: new Set(),
    config: {
      servers,
    },
    configPath,
    enableTools: enableTools ?? vi.fn(),
  } as CoreToolContext;
}

/**
 * Test fixture containing initialized tool and mocks
 */
export interface TestFixture {
  /** The ManageCommands tool instance */
  tool: ManageCommands;
  /** Mock CoreToolContext with tool registry */
  mockContext: CoreToolContext;
  /** Temporary directory for test files */
  testDir: string;
  /** Mock ICommandInstaller instance */
  mockInstaller: ICommandInstaller;
}

/**
 * Sets up a complete test environment for ManageCommands tests.
 * Creates a temporary directory, initializes mocks, and configures the tool.
 *
 * @returns Promise resolving to a TestFixture with all test dependencies
 *
 * @example
 * ```ts
 * let fixture: TestFixture;
 *
 * beforeEach(async () => {
 *   fixture = await setupTest();
 * });
 *
 * afterEach(async () => {
 *   await cleanupTest(fixture);
 * });
 * ```
 */
export async function setupTest(): Promise<TestFixture> {
  // Create temporary directory for testing
  const testDir = await fs.mkdtemp(`${tmpdir()}/manage-commands-test-`);

  // Create mock context with tool registry
  const mockContext = createMockContext({
    toolRegistry: createMockToolRegistry(),
  });

  // Create tool and mock the installer
  const tool = new ManageCommands();
  const mockInstaller = createMockInstaller({
    commandsPath: testDir,
  });

  Object.assign(tool as unknown as Record<string, unknown>, {
    installer: mockInstaller,
  });

  // Clear all mocks before each test
  vi.clearAllMocks();

  return {
    tool,
    mockContext,
    testDir,
    mockInstaller,
  };
}

/**
 * Cleans up test environment created by setupTest.
 * Removes temporary directory and clears all mocks.
 *
 * @param fixture - The TestFixture to clean up
 *
 * @example
 * ```ts
 * afterEach(async () => {
 *   await cleanupTest(fixture);
 * });
 * ```
 */
export async function cleanupTest(fixture: TestFixture): Promise<void> {
  try {
    await fs.rm(fixture.testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
  vi.clearAllMocks();
}
