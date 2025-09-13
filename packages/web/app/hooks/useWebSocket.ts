import { useEffect, useRef, useState, useCallback } from 'react';
import { create } from 'zustand';

interface WebSocketState {
  isConnected: boolean;
  logs: LogMessage[];
  addLog: (log: LogMessage) => void;
  clearLogs: () => void;
}

interface LogMessage {
  id: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  source: string;
  timestamp: string;
}

export const useWebSocketStore = create<WebSocketState>((set) => ({
  isConnected: false,
  logs: [],
  addLog: (log) =>
    set((state) => ({
      logs: [...state.logs, log].slice(-100), // Keep last 100 logs
    })),
  clearLogs: () => set({ logs: [] }),
}));

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
