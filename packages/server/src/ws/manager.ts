import { WebSocket } from 'ws';
import {
  WSMessageSchema,
  type WSEvent,
  type WSMessage,
  type ExecuteTool,
} from '../types/index.js';
import type { MCPProxy } from 'mcp-funnel';

interface Client {
  ws: WebSocket;
  subscriptions: Set<string>;
}

export class WebSocketManager {
  private clients: Set<Client> = new Set();
  private mcpProxy: MCPProxy;

  constructor(mcpProxy: MCPProxy) {
    this.mcpProxy = mcpProxy;
    this.setupProxyEventListeners();
  }

  handleConnection(ws: WebSocket) {
    const client: Client = {
      ws,
      subscriptions: new Set(['*']), // Subscribe to all events by default
    };

    this.clients.add(client);
    console.info('WebSocket client connected');

    // Send initial state
    this.sendInitialState(client);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        const parsed = WSMessageSchema.safeParse(message);

        if (!parsed.success) {
          ws.send(
            JSON.stringify({
              error: 'Invalid message format',
              details: parsed.error,
            }),
          );
          return;
        }

        this.handleMessage(client, parsed.data);
      } catch (_error) {
        ws.send(
          JSON.stringify({
            error: 'Failed to parse message',
          }),
        );
      }
    });

    ws.on('close', () => {
      this.clients.delete(client);
      console.info('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  }

  private handleMessage(client: Client, message: WSMessage) {
    switch (message.type) {
      case 'subscribe':
        message.events.forEach((event: string) => {
          client.subscriptions.add(event);
        });
        break;

      case 'unsubscribe':
        message.events.forEach((event: string) => {
          client.subscriptions.delete(event);
        });
        break;

      case 'execute':
        // Handle tool execution
        this.executeToolAsync(client, message.payload);
        break;
    }
  }

  private async executeToolAsync(client: Client, payload: ExecuteTool) {
    const requestId = crypto.randomUUID();
    const startTime = Date.now();

    // Send executing event
    this.broadcast({
      type: 'tool.executing',
      payload: {
        toolName: payload.toolName,
        arguments: payload.arguments,
        requestId,
        timestamp: new Date().toISOString(),
      },
    });

    try {
      const mapping = this.mcpProxy.toolMapping.get(payload.toolName);
      if (!mapping) {
        throw new Error(`Tool not found: ${payload.toolName}`);
      }

      if (!mapping.client) throw new Error(`No mapping client found for tool: ${payload.toolName}`);

      const result = await mapping.client.callTool({
        name: mapping.originalName,
        arguments: payload.arguments,
      });

      // Send result event
      this.broadcast({
        type: 'tool.result',
        payload: {
          toolName: payload.toolName,
          requestId,
          result,
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      // Send error event
      this.broadcast({
        type: 'tool.result',
        payload: {
          toolName: payload.toolName,
          requestId,
          result: null,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        },
      });
    }
  }

  private sendInitialState(client: Client) {
    // Send current server statuses
    for (const [name] of this.mcpProxy.clients) {
      const event: WSEvent = {
        type: 'server.connected',
        payload: {
          serverName: name,
          timestamp: new Date().toISOString(),
        },
      };
      client.ws.send(JSON.stringify(event));
    }

    // Send current tools
    const tools = [];
    for (const [fullName, { serverName, tool }] of this.mcpProxy
      .toolDefinitionCache) {
      tools.push({
        name: fullName,
        description: tool.description,
        inputSchema: tool.inputSchema,
        serverName,
        enabled:
          this.mcpProxy.dynamicallyEnabledTools.has(fullName) ||
          !this.mcpProxy.config.enableDynamicDiscovery,
      });
    }

    if (tools.length > 0) {
      const event: WSEvent = {
        type: 'tools.changed',
        payload: {
          tools,
          timestamp: new Date().toISOString(),
        },
      };
      client.ws.send(JSON.stringify(event));
    }
  }

  private setupProxyEventListeners() {
    // TODO: Add event listeners to MCPProxy for server connect/disconnect
    // and tool list changes, then broadcast to WebSocket clients
  }

  broadcast(event: WSEvent) {
    const message = JSON.stringify(event);

    for (const client of this.clients) {
      if (this.matchesSubscription(client, event.type)) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.send(message);
        }
      }
    }
  }

  private matchesSubscription(client: Client, eventType: string): boolean {
    if (client.subscriptions.has('*')) return true;
    if (client.subscriptions.has(eventType)) return true;

    // Check wildcard patterns (e.g., 'tool.*' matches 'tool.executing')
    for (const subscription of client.subscriptions) {
      if (subscription.endsWith('*')) {
        const prefix = subscription.slice(0, -1);
        if (eventType.startsWith(prefix)) return true;
      }
    }

    return false;
  }

  sendLog(
    level: 'info' | 'warn' | 'error' | 'debug',
    message: string,
    source: string,
  ) {
    this.broadcast({
      type: 'log.message',
      payload: {
        level,
        message,
        source,
        timestamp: new Date().toISOString(),
      },
    });
  }
}
