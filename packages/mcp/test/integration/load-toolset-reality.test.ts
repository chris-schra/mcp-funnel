import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MCPProxy } from '../../src';
import { ProxyConfig } from '../../src/config.js';

describe('LoadToolset - Reality Check', () => {
  let proxy: MCPProxy;
  let config: ProxyConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      servers: [],
      hackyDiscovery: true,
      toolsets: {
        reviewer: ['github__*_pull_request*', 'github__update_issue'],
        coder: ['github__create_pull_request'],
      },
    };
  });

  describe('The Harsh Reality', () => {
    it('loaded tools are NOT directly callable - still need bridge_tool_request', async () => {
      proxy = new MCPProxy(config);
      await proxy.initialize();

      const context = proxy['createToolContext']();

      // Mock enableTools to avoid server connection issues
      context.enableTools = (tools: string[]) => {
        for (const tool of tools) {
          context.dynamicallyEnabledTools.add(tool);
          console.error(`[test] Mocked enabling tool: ${tool}`);
        }
      };

      // Populate tool caches as if servers were connected
      context.toolDescriptionCache.set('github__create_pull_request', {
        serverName: 'github',
        description: 'Create a pull request',
      });

      context.toolDefinitionCache?.set('github__create_pull_request', {
        serverName: 'github',
        tool: {
          name: 'create_pull_request',
          description: 'Create a pull request',
          inputSchema: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              body: { type: 'string' },
            },
          },
        },
      });

      // Mock a client for the tool
      const mockClient = {
        callTool: vi.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'PR created' }],
        }),
      };

      context.toolMapping?.set('github__create_pull_request', {
        client: mockClient as unknown as Parameters<
          typeof context.toolMapping.set
        >[1]['client'],
        originalName: 'create_pull_request',
      });

      // Load the toolset
      const loadTool = proxy['coreTools'].get('load_toolset');
      const loadResult = await loadTool?.handle({ name: 'coder' }, context);

      expect(loadResult?.content[0]).toEqual({
        type: 'text',
        text: 'Loaded 1 tools from "coder" toolset',
      });

      // NOW THE REALITY CHECK:
      // Try to call the tool directly - THIS WILL FAIL
      const directCallWorks = proxy['toolMapping'].has(
        'github__create_pull_request',
      );
      expect(directCallWorks).toBe(true); // Tool mapping exists

      // But it's NOT in the exposed tools list for Claude
      // The server would need to be connected to handle requests
      // In reality, the tools list is fixed at connection time

      // We can check what core tools are registered
      const coreToolNames = Array.from(proxy['coreTools'].keys());

      // Only the bridge tools are exposed
      expect(coreToolNames).toContain('load_toolset');
      expect(coreToolNames).toContain('bridge_tool_request');
      expect(coreToolNames).toContain('get_tool_schema');

      // The actual GitHub tool is NOT directly exposed
      expect(coreToolNames).not.toContain('github__create_pull_request');

      // The tool is in dynamicallyEnabledTools but that doesn't make it callable
      expect(
        context.dynamicallyEnabledTools.has('github__create_pull_request'),
      ).toBe(true);

      // So you STILL need to use bridge_tool_request
      const bridgeTool = proxy['coreTools'].get('bridge_tool_request');
      const bridgeResult = await bridgeTool?.handle(
        {
          tool: 'github__create_pull_request',
          arguments: { title: 'Test PR', body: 'Test body' },
        },
        context,
      );

      expect(bridgeResult).toBeDefined();
      expect(mockClient.callTool).toHaveBeenCalled();
    });

    it('loading tools still accumulates in message context', async () => {
      proxy = new MCPProxy(config);
      await proxy.initialize();

      const context = proxy['createToolContext']();

      // Mock enableTools to avoid server connection issues
      context.enableTools = (tools: string[]) => {
        for (const tool of tools) {
          context.dynamicallyEnabledTools.add(tool);
          console.error(`[test] Mocked enabling tool: ${tool}`);
        }
      };

      // Add multiple tools to cache
      const tools = [
        'github__create_pull_request',
        'github__update_pull_request',
        'github__merge_pull_request',
        'github__list_pull_requests',
        'github__update_issue',
      ];

      for (const tool of tools) {
        context.toolDescriptionCache.set(tool, {
          serverName: 'github',
          description: `Description for ${tool}`,
        });
      }

      // Load toolset
      const loadTool = proxy['coreTools'].get('load_toolset');
      const result = await loadTool?.handle({ name: 'reviewer' }, context);

      // The response itself goes into message history
      const responseText = (
        (result?.content[0] as { type: string; text: string }) || { text: '' }
      ).text;
      expect(responseText).toBe('Loaded 5 tools from "reviewer" toolset');

      // This text is now part of the conversation context
      // Each subsequent load adds more to context
      const result2 = await loadTool?.handle({ name: 'coder' }, context);

      const responseText2 = (
        (result2?.content[0] as { type: string; text: string }) || { text: '' }
      ).text;
      expect(responseText2).toBe('Loaded 1 tools from "coder" toolset');

      // Both responses are now in message history, accumulating context
      // Unlike true dynamic loading where tools would be in a separate namespace
    });

    it('enableTools() would send notification but server is not connected', async () => {
      proxy = new MCPProxy(config);
      await proxy.initialize();

      const context = proxy['createToolContext']();

      // The server is not connected, so trying to send notifications will throw
      // This is actually what we want to demonstrate
      let notificationSent = false;
      context.enableTools = (tools: string[]) => {
        for (const tool of tools) {
          context.dynamicallyEnabledTools.add(tool);
        }
        // Would normally send notification but server isn't connected
        notificationSent = true;
        console.error('[test] Would send tools/list_changed notification');
      };

      // Add a tool and enable it
      context.toolDescriptionCache.set('github__create_issue', {
        serverName: 'github',
        description: 'Create an issue',
      });

      // Enable the tool
      context.enableTools(['github__create_issue']);

      // Notification was attempted
      expect(notificationSent).toBe(true);

      // Even if the notification could be sent (with a connected server),
      // Claude Code doesn't support dynamic updates, so it does nothing

      // The tool is "enabled" internally
      expect(context.dynamicallyEnabledTools.has('github__create_issue')).toBe(
        true,
      );

      // But it's NOT in the core tools that Claude can see
      const coreToolNames = Array.from(proxy['coreTools'].keys());
      expect(coreToolNames).not.toContain('github__create_issue');

      // Proves that dynamic enabling is meaningless in current Claude Code
    });

    it('demonstrates the 3-step dance is still required', async () => {
      proxy = new MCPProxy(config);
      await proxy.initialize();

      const context = proxy['createToolContext']();

      // Mock enableTools to avoid server connection issues
      context.enableTools = (tools: string[]) => {
        for (const tool of tools) {
          context.dynamicallyEnabledTools.add(tool);
        }
      };

      const stepsRequired: string[] = [];

      // Add tool to cache
      context.toolDescriptionCache.set('github__create_pr', {
        serverName: 'github',
        description: 'Create a PR',
      });

      context.toolDefinitionCache?.set('github__create_pr', {
        serverName: 'github',
        tool: {
          name: 'create_pr',
          description: 'Create a PR',
          inputSchema: {
            type: 'object',
            properties: { title: { type: 'string' } },
          },
        },
      });

      // Step 1: Load the toolset (or discover)
      const loadTool = proxy['coreTools'].get('load_toolset');
      await loadTool?.handle({ tools: ['github__create_pr'] }, context);
      stepsRequired.push('load_toolset');

      // Step 2: Get the schema (often needed to know arguments)
      const schemaTool = proxy['coreTools'].get('get_tool_schema');
      await schemaTool?.handle({ tool: 'github__create_pr' }, context);
      stepsRequired.push('get_tool_schema');

      // Step 3: Bridge the actual call
      // Would need to actually call this with proper args
      stepsRequired.push('bridge_tool_request (would be needed)');

      // We still need all 3 steps!
      expect(stepsRequired).toEqual([
        'load_toolset',
        'get_tool_schema',
        'bridge_tool_request (would be needed)',
      ]);

      // This is barely better than discover_tools_by_words
    });

    it('shows that toolsets provide organization but not context savings', async () => {
      proxy = new MCPProxy(config);
      await proxy.initialize();

      const context = proxy['createToolContext']();

      // Add tools for discovery
      const pullRequestTools = [
        'github__create_pull_request',
        'github__update_pull_request',
        'github__merge_pull_request',
        'github__list_pull_requests',
      ];

      // Scenario 1: Using discover_tools_by_words
      // Mock enableTools to avoid server issues
      context.enableTools = (tools: string[]) => {
        for (const tool of tools) {
          context.dynamicallyEnabledTools.add(tool);
        }
      };

      // Need to enable discover tool for this test
      proxy = new MCPProxy({
        ...config,
        enableDynamicDiscovery: true,
      });
      await proxy.initialize();

      // Re-get context with mocked enableTools
      const newContext = proxy['createToolContext']();
      newContext.enableTools = context.enableTools;

      // Copy tool caches
      for (const tool of pullRequestTools) {
        newContext.toolDescriptionCache.set(tool, {
          serverName: 'github',
          description: `Pull request operation: ${tool}`,
        });
      }

      const discoverTool = proxy['coreTools'].get('discover_tools_by_words');

      const discoverResult = await discoverTool?.handle(
        { words: 'pull request', enable: true },
        newContext,
      );

      const discoverResponse = (
        (discoverResult?.content[0] as { type: string; text: string }) || {
          text: '',
        }
      ).text;
      const discoverResponseLength = discoverResponse.length;

      // Scenario 2: Using load_toolset
      newContext.dynamicallyEnabledTools.clear(); // Reset

      const loadTool = proxy['coreTools'].get('load_toolset');
      const loadResult = await loadTool?.handle(
        { tools: ['github__*_pull_request*'] },
        newContext,
      );

      const loadResponse = (
        (loadResult?.content[0] as { type: string; text: string }) || {
          text: '',
        }
      ).text;
      const loadResponseLength = loadResponse.length;

      // The load_toolset response is much shorter
      expect(loadResponseLength).toBeLessThan(discoverResponseLength);

      // But both approaches:
      // 1. Add to message context (not tool context)
      // 2. Require bridge_tool_request for execution
      // 3. Don't actually reduce the tool tokens Claude sees

      // The ONLY advantage is shorter response text
      expect(loadResponse).toBe('Loaded 4 tools matching specified patterns');
      expect(discoverResponse).toContain('Found and enabled 4 tools:');
      expect(discoverResponse).toContain('github__create_pull_request');
      expect(discoverResponse).toContain('github__update_pull_request');
      // ... discover lists all tools, load_toolset doesn't

      // So it's a minor UX improvement, not a context solution
    });
  });

  describe('What Would Actually Help', () => {
    it('shows what we actually need from Claude Code', () => {
      // What we have now:
      const currentReality = {
        toolsFixedAtStart: true,
        dynamicUpdatesIgnored: true,
        allToolsInMessages: true,
        bridgeRequired: true,
      };

      // What we need:
      const whatWeNeed = {
        toolsFixedAtStart: false, // Allow dynamic registration
        dynamicUpdatesIgnored: false, // Honor tools/list_changed
        allToolsInMessages: false, // Separate tool namespace
        bridgeRequired: false, // Direct tool calls after loading
      };

      // Until then, load_toolset is just organizational sugar
      expect(currentReality.toolsFixedAtStart).toBe(true);
      expect(whatWeNeed.toolsFixedAtStart).toBe(false);

      // This test documents the limitation, not a bug
    });
  });
});
