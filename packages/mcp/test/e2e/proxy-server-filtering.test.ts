import { describe, test, expect } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { MCPProxy } from 'mcp-funnel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('ProxyServer Tool Filtering', () => {
  describe('hideTools configuration', () => {
    test('should hide tools matching hideTools patterns', async () => {
      // Load the actual config file used in e2e tests
      const configPath = path.join(
        __dirname,
        '../fixtures/e2e-configs/config.with-hidden-tools.json',
      );
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Create a proxy server with this config
      const proxyServer = new MCPProxy(config, configPath);

      // Start the proxy server
      await proxyServer.start();

      try {
        // Get the list of tools from the proxy server
        // We need to access the registry to get exposed tools
        const tools = proxyServer.registry.getExposedTools();

        // Check that mockserver__hidden_tool is not in the list
        const hiddenTool = tools.find(
          (t) => t.name === 'mockserver__hidden_tool',
        );
        expect(hiddenTool).toBeUndefined();

        // Check that mockserver__echo IS in the list (not hidden)
        const echoTool = tools.find((t) => t.name === 'mockserver__echo');
        expect(echoTool).toBeDefined();

        // Check that issue tools are hidden
        const issueTool = tools.find(
          (t) => t.name === 'mockserver__create_issue',
        );
        expect(issueTool).toBeUndefined();
      } finally {
        // MCPProxy doesn't have a stop/close method in the current implementation
        // The server cleanup happens automatically
      }
    });

    test('should handle empty exposeTools with hideTools', async () => {
      // Load the actual config file used in e2e tests
      const configPath = path.join(
        __dirname,
        '../fixtures/e2e-configs/config.with-hidden-and-empty-expose-tools.json',
      );
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Create a proxy server with this config
      const proxyServer = new MCPProxy(config, configPath);

      // Start the proxy server
      await proxyServer.start();

      try {
        const tools = proxyServer.registry.getExposedTools();

        // With empty exposeTools, no server tools should be visible
        const serverTools = tools.filter((t) =>
          t.name.startsWith('mockserver__'),
        );
        expect(serverTools.length).toBe(0);

        // But core tools might still be visible if exposeCoreTools is not set
        // const coreTools = tools.filter(
        //   (t) => !t.name.startsWith('mockserver__'),
        // );
        // This depends on whether core tools are exposed by default
      } finally {
        // MCPProxy doesn't have a stop/close method in the current implementation
        // The server cleanup happens automatically
      }
    });

    test('should handle undefined exposeTools with hideTools', async () => {
      // Load the actual config file used in e2e tests
      const configPath = path.join(
        __dirname,
        '../fixtures/e2e-configs/config.with-hidden-tools.json',
      );
      const configContent = readFileSync(configPath, 'utf-8');
      const config = JSON.parse(configContent);

      // Create a proxy server with this config
      const proxyServer = new MCPProxy(config, configPath);

      // Start the proxy server
      await proxyServer.start();

      try {
        const tools = proxyServer.registry.getExposedTools();

        // Without exposeTools defined, all tools except hidden ones should be visible
        const hiddenTool = tools.find(
          (t) => t.name === 'mockserver__hidden_tool',
        );
        expect(hiddenTool).toBeUndefined();

        const echoTool = tools.find((t) => t.name === 'mockserver__echo');
        expect(echoTool).toBeDefined();

        const otherTool = tools.find(
          (t) => t.name === 'mockserver__other_tool',
        );
        expect(otherTool).toBeDefined();

        // Issue tools should be hidden
        const createIssueTool = tools.find(
          (t) => t.name === 'mockserver__create_issue',
        );
        expect(createIssueTool).toBeUndefined();
      } finally {
        // MCPProxy doesn't have a stop/close method in the current implementation
        // The server cleanup happens automatically
      }
    });
  });
});
