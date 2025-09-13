import {
  query,
  type SDKUserMessage,
  type SDKMessage,
} from '@anthropic-ai/claude-code';
import { spawn, type ChildProcess } from 'child_process';
import { randomUUID } from 'crypto';
import { ProxyConfig } from '../../src/config.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface ToolCall {
  name: string;
  input: Record<string, unknown>;
  result?: unknown;
}

export interface E2ETestResult {
  messages: SDKMessage[];
  toolCalls: ToolCall[];
  finalResponse?: string;
}

export class E2ETestHelper {
  private sessionId: string;
  private toolCallLog: ToolCall[] = [];
  private messages: SDKMessage[] = [];
  private funnelProcess?: ChildProcess;
  private configPath?: string;

  constructor() {
    this.sessionId = randomUUID();
  }

  async startFunnel(config: ProxyConfig): Promise<void> {
    // Create temp config file
    this.configPath = path.join(
      __dirname,
      `../fixtures/test-config-${this.sessionId}.json`,
    );
    await fs.mkdir(path.dirname(this.configPath), { recursive: true });
    await fs.writeFile(this.configPath, JSON.stringify(config, null, 2));

    // Start MCP Funnel via tsx
    this.funnelProcess = spawn('npx', ['tsx', 'src/cli.ts', this.configPath], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe',
    });

    // Wait for server to start
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Funnel startup timeout')),
        5000,
      );

      this.funnelProcess!.stderr?.on('data', (data) => {
        const message = data.toString();
        if (
          message.includes('Server running') ||
          message.includes('initialized')
        ) {
          clearTimeout(timeout);
          resolve();
        }
      });

      this.funnelProcess!.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }

  async queryFunnel(prompt: string): Promise<E2ETestResult> {
    this.toolCallLog = [];
    this.messages = [];

    const userMessage: SDKUserMessage = {
      type: 'user',
      message: { role: 'user', content: prompt },
      parent_tool_use_id: null,
      session_id: this.sessionId,
    };

    const response = query({
      prompt: this.createPromptGenerator(userMessage),
      options: {
        mcpServers: {
          'mcp-funnel': {
            type: 'stdio',
            command: 'npx',
            args: ['tsx', 'src/cli.ts', this.configPath!],
          },
        },
        canUseTool: async (toolName, input) => {
          this.toolCallLog.push({ name: toolName, input });
          return {
            behavior: 'allow',
            updatedInput: input,
          };
        },
      },
    });

    let finalResponse = '';
    try {
      for await (const message of response) {
        this.messages.push(message);
        if (message.type === 'assistant') {
          const content = (message.message as { content: unknown }).content;
          if (typeof content === 'string') {
            finalResponse += content;
          } else if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'text') {
                finalResponse += block.text;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Query error:', error);
      throw error;
    }

    return {
      messages: this.messages,
      toolCalls: this.toolCallLog,
      finalResponse,
    };
  }

  async cleanup(): Promise<void> {
    if (this.funnelProcess) {
      this.funnelProcess.kill();
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (this.configPath) {
      try {
        await fs.unlink(this.configPath);
      } catch (_error) {
        // Ignore cleanup errors
      }
    }
  }

  private async *createPromptGenerator(
    message: SDKUserMessage,
  ): AsyncGenerator<SDKUserMessage> {
    yield message;
  }

  // Helper methods for assertions
  findToolCall(toolName: string): ToolCall | undefined {
    return this.toolCallLog.find((call) => call.name === toolName);
  }

  findToolCalls(pattern: string | RegExp): ToolCall[] {
    if (typeof pattern === 'string') {
      return this.toolCallLog.filter((call) => call.name.includes(pattern));
    }
    return this.toolCallLog.filter((call) => pattern.test(call.name));
  }

  getSystemMessage(): SDKMessage | undefined {
    return this.messages.find(
      (m) =>
        m.type === 'system' && (m as { subtype?: string }).subtype === 'init',
    );
  }

  getExposedTools(): string[] {
    const systemMsg = this.getSystemMessage();
    if (systemMsg && systemMsg.type === 'system') {
      return (systemMsg as { tools?: string[] }).tools || [];
    }
    return [];
  }
}

export function createTestConfig(
  overrides: Partial<ProxyConfig> = {},
): ProxyConfig {
  return {
    servers: [],
    ...overrides,
  };
}
