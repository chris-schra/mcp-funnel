export interface DebugRequest {
  platform: 'node' | 'browser';
  target: string;
  command?: string; // Runtime command for Node (e.g., "node", "tsx", "ts-node")
  args?: string[]; // Additional CLI arguments passed to the script when launching Node runtime
  runtimeArgs?: string[]; // Arguments forwarded to the runtime executable before the script path (e.g., Node flags)
  stopOnEntry?: boolean; // Pause at entry before running user code
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

// Note: BrowserDebugRequest and NodeDebugRequest could be added here in the future
// when platform-specific request handling is needed
