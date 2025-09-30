import WebSocket from 'ws';

/**
 * Setup WebSocket connection with timeout and event handlers
 */
export function setupWebSocketConnection(
  url: string,
  timeout: number,
  onSuccess: () => void,
  onFailure: () => void,
  handleDisconnection: () => void,
): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      onFailure();
      reject(new Error(`Connection timeout after ${timeout}ms`));
    }, timeout);

    try {
      const ws = new WebSocket(url);

      const onOpen = () => {
        clearTimeout(timeoutId);
        onSuccess();
        resolve(ws);
      };

      const onError = (error: Error) => {
        clearTimeout(timeoutId);
        onFailure();
        reject(new Error(`Failed to connect to ${url}: ${error.message}`));
      };

      const onClose = () => {
        clearTimeout(timeoutId);
        handleDisconnection();
      };

      ws.once('open', onOpen);
      ws.once('error', onError);
      ws.once('close', onClose);
    } catch (error) {
      clearTimeout(timeoutId);
      onFailure();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}

/**
 * Setup WebSocket message and event handlers
 */
export function setupWebSocketEventHandlers(
  ws: WebSocket,
  onMessage: (data: WebSocket.RawData) => void,
  onClose: () => void,
  onError: (error: Error) => void,
): void {
  ws.on('message', onMessage);
  ws.on('close', onClose);
  ws.on('error', onError);
}
