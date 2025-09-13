import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { configRoute } from '../../src/api/config.js';
import type { MCPProxy } from 'mcp-funnel';

describe('API Config Endpoint - Record Format Integration', () => {
  let mockMCPProxy: MCPProxy;
  let app: Hono;

  beforeEach(() => {
    app = new Hono();
    app.use('*', async (c, next) => {
      c.set('mcpProxy', mockMCPProxy);
      await next();
    });
    app.route('/config', configRoute);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Single Server Record Format', () => {
    beforeEach(() => {
      mockMCPProxy = {
        config: {
          servers: [
            {
              name: 'github',
              command: 'docker',
              args: ['run', 'github-mcp'],
              env: { GITHUB_TOKEN: 'test-token' },
            },
          ],
          hideTools: [],
          exposeTools: [],
          enableDynamicDiscovery: false,
          hackyDiscovery: false,
        },
      } as MCPProxy;
    });

    it('should return single server configuration correctly', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.config.servers).toHaveLength(1);
      expect(data.config.servers[0]).toEqual({
        name: 'github',
        command: 'docker',
        args: ['run', 'github-mcp'],
      });
    });

    it('should exclude env from API response', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(data.config.servers[0]).not.toHaveProperty('env');
    });
  });

  describe('Multiple Servers Record Format', () => {
    beforeEach(() => {
      mockMCPProxy = {
        config: {
          servers: [
            {
              name: 'github',
              command: 'docker',
              args: ['run', 'github-mcp'],
              env: { GITHUB_TOKEN: 'secret1' },
            },
            {
              name: 'memory',
              command: 'npx',
              args: ['-y', '@modelcontextprotocol/server-memory'],
            },
            {
              name: 'filesystem',
              command: 'node',
              args: ['fs-server.js'],
              env: { ROOT_PATH: '/workspace' },
            },
          ],
          hideTools: ['debug_*'],
          exposeTools: ['github__*', 'memory__store'],
          enableDynamicDiscovery: true,
          hackyDiscovery: false,
        },
      } as MCPProxy;
    });

    it('should return all servers with proper mapping', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.config.servers).toHaveLength(3);

      const serverNames = data.config.servers.map(
        (s: { name: string }) => s.name,
      );
      expect(serverNames).toEqual(['github', 'memory', 'filesystem']);
    });

    it('should preserve server configuration details without env', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(data.config.servers[0]).toEqual({
        name: 'github',
        command: 'docker',
        args: ['run', 'github-mcp'],
      });

      expect(data.config.servers[1]).toEqual({
        name: 'memory',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-memory'],
      });

      expect(data.config.servers[2]).toEqual({
        name: 'filesystem',
        command: 'node',
        args: ['fs-server.js'],
      });
    });

    it('should return correct tool filtering configuration', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(data.config.hideTools).toEqual(['debug_*']);
      expect(data.config.exposeTools).toEqual(['github__*', 'memory__store']);
      expect(data.config.enableDynamicDiscovery).toBe(true);
      expect(data.config.hackyDiscovery).toBe(false);
    });
  });

  describe('Empty and Default Configurations', () => {
    beforeEach(() => {
      mockMCPProxy = {
        config: {
          servers: [],
        },
      } as MCPProxy;
    });

    it('should handle empty server list', async () => {
      const req = new Request('http://localhost/config');
      const res = await app.request(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.config.servers).toEqual([]);
      expect(data.config.hideTools).toEqual([]);
      expect(data.config.exposeTools).toEqual([]);
      expect(data.config.enableDynamicDiscovery).toBe(false);
      expect(data.config.hackyDiscovery).toBe(false);
    });
  });

  describe('Configuration Updates', () => {
    beforeEach(() => {
      mockMCPProxy = {
        config: {
          servers: [
            {
              name: 'github',
              command: 'docker',
              args: ['run', 'github-mcp'],
            },
          ],
          hideTools: [],
          exposeTools: [],
          enableDynamicDiscovery: false,
          hackyDiscovery: false,
        },
        server: {
          sendToolListChanged: vi.fn(),
        },
      } as MCPProxy;
    });

    it('should update configuration and notify tool list change', async () => {
      const updateData = {
        hideTools: ['test_*'],
        exposeTools: ['github__create_issue'],
        enableDynamicDiscovery: true,
        hackyDiscovery: true,
      };

      const req = new Request('http://localhost/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      const res = await app.request(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.config.hideTools).toEqual(['test_*']);
      expect(data.config.exposeTools).toEqual(['github__create_issue']);
      expect(data.config.enableDynamicDiscovery).toBe(true);
      expect(data.config.hackyDiscovery).toBe(true);

      expect(mockMCPProxy.server.sendToolListChanged).toHaveBeenCalled();
    });

    it('should handle partial configuration updates', async () => {
      const updateData = {
        hideTools: ['debug_*'],
      };

      const req = new Request('http://localhost/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateData),
      });

      const res = await app.request(req);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.config.hideTools).toEqual(['debug_*']);
      expect(data.config.enableDynamicDiscovery).toBe(false); // Unchanged
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      mockMCPProxy = {
        config: {
          servers: [
            {
              name: 'test-server',
              command: 'test-command',
            },
          ],
          hideTools: [],
          exposeTools: [],
          enableDynamicDiscovery: false,
          hackyDiscovery: false,
        },
        server: {
          sendToolListChanged: vi.fn(),
        },
      } as MCPProxy;
    });

    it('should handle invalid update request body', async () => {
      const req = new Request('http://localhost/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalidField: 'invalid' }),
      });

      const res = await app.request(req);

      // Should handle gracefully - invalid fields are ignored, return 200
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.success).toBe(true);
    });
  });
});
