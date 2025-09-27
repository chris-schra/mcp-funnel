import { spawn, type ChildProcess } from 'child_process';
import * as readline from 'readline';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { ReconnectionConfig } from '../reconnection-manager.js';
import { logger, logServerStream, prefixedLog } from './logging.js';
import type { TransportOptions, StreamHandlerConfig } from './types.js';

// Utility types
export type EventHandler<T = void> = T extends void
  ? () => void
  : (arg: T) => void;
export type HandlerArray<T = void> = EventHandler<T>[];
export type MessageHandler = (message: JSONRPCMessage) => void;

// Process management utilities
export const createProcess = (options: TransportOptions): ChildProcess =>
  spawn(options.command, options.args || [], {
    env: options.env,
    stdio: ['pipe', 'pipe', 'pipe'],
    cwd: process.cwd(),
  });

export const createReconnectionConfig = (
  config?: ReconnectionConfig,
): Required<ReconnectionConfig> => ({
  initialDelay: config?.initialDelay ?? 1000,
  maxDelay: config?.maxDelay ?? 30000,
  backoffMultiplier: config?.backoffMultiplier ?? 2,
  maxRetries: config?.maxRetries ?? 10,
  jitter: config?.jitter ?? 0.25,
});

export const createStreamLineHandler = (config: StreamHandlerConfig): void => {
  const rl = readline.createInterface({
    input: config.stream,
    crlfDelay: Infinity,
  });
  rl.on('line', (line: string) => {
    if (line.trim()) {
      config.onLine(line);
    }
  });
};

export const logError = (
  serverName: string,
  message: string,
  error?: unknown,
  context?: Record<string, unknown>,
): void => {
  const prefixedMsg = prefixedLog(serverName, message);
  logger.error(prefixedMsg, error, { server: serverName, ...context });
};

// Stream handling utilities
export const createStderrHandler = (serverName: string) => (line: string) => {
  console.error(prefixedLog(serverName, line));
  logServerStream(serverName, 'stderr', line);
};

export const createStdoutHandler =
  (serverName: string, messageHandlers: MessageHandler[]) => (line: string) => {
    try {
      const message = JSON.parse(line) as JSONRPCMessage;
      messageHandlers.forEach((handler) => handler(message));
    } catch {
      console.error(prefixedLog(serverName, line));
      logServerStream(serverName, 'stdout', line);
      logger.debug('transport:nonjson_stdout', {
        server: serverName,
        line: line.slice(0, 200),
      });
    }
  };

// Reconnection utilities
export const logReconnectionAttempt = (
  serverName: string,
  currentRetry: number,
  maxRetries: number,
): void => {
  console.error(
    prefixedLog(
      serverName,
      `Attempting reconnection (${currentRetry}/${maxRetries})`,
    ),
  );
};

export const logReconnectionSuccess = (serverName: string): void => {
  console.error(prefixedLog(serverName, 'Reconnection successful'));
};

export const logReconnectionFailure = (
  serverName: string,
  error: Error,
): void => {
  console.error(prefixedLog(serverName, `Reconnection failed: ${error}`));
};

export const logMaxRetriesReached = (serverName: string): void => {
  console.error(
    prefixedLog(serverName, 'Giving up after maximum retry attempts'),
  );
};
