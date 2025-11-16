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
 *
 * Store properties:
 * - `isConnected`: Boolean indicating current WebSocket connection state
 * - `logs`: Array of log messages, automatically limited to last 100 entries
 * - `addLog`: Function to append a log message to the buffer
 * - `clearLogs`: Function to remove all log messages from the buffer
 * @example
 * ```typescript
 * import { useWebSocketStore } from '~/hooks/useWebSocket.js';
 *
 * function LogViewer() {
 *   const { logs, clearLogs } = useWebSocketStore();
 *   return <div>{logs.map(log => <div key={log.id}>{log.message}</div>)}</div>;
 * }
 * ```
 * @returns Zustand store instance with WebSocket state and actions
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
 * Handles incoming WebSocket messages and routes them to appropriate handlers.
 * @param data - Parsed WebSocket message data
 * @param addLog - Function to add log messages to the store
 * @internal
 */
function handleWebSocketMessage(
  data: { type: string; payload?: LogMessage },
  addLog: (log: LogMessage) => void,
): void {
  switch (data.type) {
    case 'log.message':
      if (data.payload) {
        addLog({ ...data.payload, id: crypto.randomUUID() });
      }
      break;
    case 'tools.changed':
      window.dispatchEvent(new CustomEvent('tools-changed'));
      break;
    case 'server.connected':
    case 'server.disconnected':
      window.dispatchEvent(new CustomEvent('servers-changed'));
      break;
    case 'tool.executing':
    case 'tool.result':
      window.dispatchEvent(new CustomEvent('tool-event', { detail: data }));
      break;
  }
}

/**
 * Sends subscription request to WebSocket server to receive all events.
 * @param ws - Active WebSocket connection
 * @internal
 */
function subscribeToAllEvents(ws: WebSocket): void {
  ws.send(JSON.stringify({ type: 'subscribe', events: ['*'] }));
}

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
 * @returns Hook result object with the following properties:
 *   - `isConnected` - Boolean indicating whether WebSocket is currently connected
 *   - `sendMessage` - Function to send a JSON-serializable message through the WebSocket.
 *     Messages are only sent if the connection is open; otherwise they are silently dropped.
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
      if (ws.current) subscribeToAllEvents(ws.current);
    };

    ws.current.onmessage = (event) => {
      try {
        handleWebSocketMessage(JSON.parse(event.data), addLog);
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
