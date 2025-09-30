import { useEffect, useRef, useState, useCallback } from 'react';
import { create } from 'zustand';

/**
 * State interface for the WebSocket store.
 * @internal
 */
interface WebSocketState {
  isConnected: boolean;
  logs: LogMessage[];
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
}

/**
 * Log message structure received via WebSocket.
 * @internal
 */
interface LogMessage {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  timestamp: string;
}

/**
 * Zustand store for WebSocket connection state and log messages.
 *
 * Maintains connection status and a rolling buffer of the last 100 log messages
 * received from the server. The store is globally accessible across components.
 * @example
 * ```typescript
 * import { useWebSocketStore } from '~/hooks/useWebSocket.js';
 *
 * function LogViewer() {
 *   const { logs, clearLogs } = useWebSocketStore();
 *   return <div>{logs.map(log => <div key={log.id}>{log.message}</div>)}</div>;
 * }
 * ```
 * @public
 */
export const useWebSocketStore = create<WebSocketState>((set) => ({
  isConnected: false,
  logs: [],
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log].slice(-100), // Keep last 100 logs
    })),
  clearLogs: () => set({ logs: [] }),
}));

/**
 * React hook for managing WebSocket connection to MCP Funnel server.
 *
 * Establishes and maintains a WebSocket connection with automatic reconnection
 * on failure. Handles incoming events including log messages, tool changes, and
 * server status updates. Dispatches CustomEvents to the window for cross-component
 * coordination with React Query.
 *
 * Connection lifecycle:
 * - Automatically connects on mount using ws:// or wss:// based on page protocol
 * - Subscribes to all events ('*') after connection
 * - Auto-reconnects after 3 seconds on disconnect
 * - Cleans up connection on unmount
 *
 * Event handling:
 * - `log.message`: Adds to store with auto-generated UUID
 * - `tools.changed`: Dispatches 'tools-changed' CustomEvent
 * - `server.connected/disconnected`: Dispatches 'servers-changed' CustomEvent
 * - `tool.executing/result`: Dispatches 'tool-event' CustomEvent with payload
 * @returns {{isConnected: boolean, sendMessage: (message: unknown) => void}} Object containing connection status and message sending function
 * @example
 * ```typescript
 * import { useWebSocket } from '~/hooks/useWebSocket.js';
 *
 * function Dashboard() {
 *   const { isConnected, sendMessage } = useWebSocket();
 *
 *   return (
 *     <div>
 *       Status: {isConnected ? 'Connected' : 'Disconnected'}
 *       <button onClick={() => sendMessage({ type: 'ping' })}>
 *         Ping Server
 *       </button>
 *     </div>
 *   );
 * }
 * ```
 * @public
 */
export function useWebSocket() {
  const ws = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { addLog } = useWebSocketStore();
  const reconnectTimeout = useRef<NodeJS.Timeout>();

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.info('WebSocket connected');
      setIsConnected(true);
      useWebSocketStore.setState({ isConnected: true });

      // Subscribe to all events
      ws.current?.send(
        JSON.stringify({
          type: 'subscribe',
          events: ['*'],
        }),
      );
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        // Handle different event types
        switch (data.type) {
          case 'log.message':
            addLog({
              id: crypto.randomUUID(),
              ...data.payload,
            });
            break;

          case 'tools.changed':
            // Trigger React Query refetch
            window.dispatchEvent(new CustomEvent('tools-changed'));
            break;

          case 'server.connected':
          case 'server.disconnected':
            // Trigger React Query refetch
            window.dispatchEvent(new CustomEvent('servers-changed'));
            break;

          case 'tool.executing':
          case 'tool.result':
            // Handle tool execution events
            window.dispatchEvent(
              new CustomEvent('tool-event', { detail: data }),
            );
            break;
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
      console.info('WebSocket disconnected');
      setIsConnected(false);
      useWebSocketStore.setState({ isConnected: false });

      // Reconnect after 3 seconds
      reconnectTimeout.current = setTimeout(() => {
        connect();
      }, 3000);
    };
  }, [addLog]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }
      if (ws.current) {
        ws.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((message: unknown) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    isConnected,
    sendMessage,
  };
}
