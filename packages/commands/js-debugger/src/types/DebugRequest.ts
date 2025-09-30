export interface DebugRequest {
  platform: 'node' | 'browser';
  target: string;
  command?: string; // Runtime command for Node (e.g., "node", "tsx", "ts-node")
  breakpoints?: Array<{
    file: string;
    line: number;
    condition?: string;
  }>;
  timeout?: number;
  evalExpressions?: string[];
  captureConsole?: boolean;
  consoleVerbosity?: 'all' | 'warn-error' | 'error-only' | 'none';
}
