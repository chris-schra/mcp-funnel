export interface ICDPClient {
  connect(url: string): Promise<void>;
  disconnect(): Promise<void>;
  send<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T>;
  on(event: string, handler: (params: unknown) => void): void;
  off(event: string, handler: (params: unknown) => void): void;
}
