import WebSocket from 'ws';

/**
 * Validate WebSocket URL format
 */
export function isValidWebSocketUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'ws:' || parsed.protocol === 'wss:';
  } catch {
    return false;
  }
}

/**
 * Clean up WebSocket resources
 */
export function cleanupWebSocket(ws: WebSocket | null): void {
  if (ws) {
    ws.removeAllListeners();
    if (ws.readyState !== WebSocket.CLOSED) {
      ws.close();
    }
  }
}

/**
 * Gracefully disconnect WebSocket
 */
export function disconnectWebSocket(
  ws: WebSocket,
  onClose: () => void,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const cleanup = () => {
      onClose();
      resolve();
    };

    if (ws.readyState === WebSocket.OPEN) {
      ws.once('close', cleanup);
      ws.close();
    } else {
      cleanup();
    }
  });
}
