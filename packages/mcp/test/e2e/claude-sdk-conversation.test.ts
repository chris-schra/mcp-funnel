import { describe, expect, test } from 'vitest';
import {
  query,
  type SDKUserMessage,
  type SDKMessage,
} from '@anthropic-ai/claude-code';
import { randomUUID } from 'crypto';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Negotiation controls (configurable via env)
const NEGOTIATION_MAX_ATTEMPTS = Number.parseInt(
  process.env.NEGOTIATION_MAX_ATTEMPTS ?? '2',
);
const NEGOTIATION_TIMEOUT_MS = Number.parseInt(
  process.env.NEGOTIATION_TIMEOUT_MS ?? '40000',
);

// Helper to check strict YES/NO responses
const expectStrictResponse = (response: string, expected: 'YES' | 'NO') => {
  const upperResponse = response.trim().toUpperCase();
  if (upperResponse.endsWith(expected) || upperResponse.startsWith(expected)) {
    expect(true).toBeTruthy();
    return;
  }
  const lineSplit = response.split('\n');
  const lastLine = lineSplit[lineSplit.length - 1].trim();
  expect(lastLine.trim()).toBe(expected);
};

// Helper to check strict numeric responses
const expectStrictNumber = (response: string, expected?: number) => {
  const lineSplit = response.split('\n');
  const lastLine = lineSplit[lineSplit.length - 1].trim();

  const num = parseInt(lastLine);
  expect(num).not.toBeNaN();
  if (expected !== undefined) {
    expect(num).toBe(expected);
  }
  return num;
};

(process.env.TEST_E2E === 'true' ? describe.concurrent : describe.skip)(
  'Claude SDK Conversation Tests',
  () => {
    const configDir = path.join(__dirname, '../fixtures/e2e-configs');

    function createConversationManager() {
      const messageQueue: string[] = [];
      const responseResolvers: Array<{
        resolve: (response: string) => void;
        reject: (error: Error) => void;
      }> = [];
      let waitingForMessage = false;
      let messageResolver: (() => void) | null = null;
      const sessionId = randomUUID();
      let isShutdown = false;

      // Generator that yields messages on demand
      async function* messageGenerator(): AsyncGenerator<SDKUserMessage> {
        while (!isShutdown) {
          // Wait for a message to be available
          if (messageQueue.length === 0) {
            waitingForMessage = true;
            await new Promise<void>((resolve) => {
              messageResolver = resolve;
            });
            waitingForMessage = false;
          }

          // Check for shutdown after waiting
          if (isShutdown) break;

          // Yield the next message
          const content = messageQueue.shift();
          if (content) {
            yield {
              type: 'user',
              message: { role: 'user', content },
              parent_tool_use_id: null,
              session_id: sessionId,
            };
          }
        }
      }

      // Send a message and get back a promise for the response
      function sendMessage(content: string): Promise<string> {
        return new Promise((resolve, reject) => {
          if (isShutdown) {
            reject(new Error('Conversation manager is shutdown'));
            return;
          }

          messageQueue.push(content);
          responseResolvers.push({ resolve, reject });

          // If the generator is waiting, wake it up
          if (waitingForMessage && messageResolver) {
            messageResolver();
            messageResolver = null;
          }
        });
      }

      // Shutdown function to clean up
      function shutdown() {
        isShutdown = true;

        // Wake up the generator if it's waiting
        if (waitingForMessage && messageResolver) {
          messageResolver();
          messageResolver = null;
        }

        // Reject all pending responses
        while (responseResolvers.length > 0) {
          const resolver = responseResolvers.shift();
          if (resolver) {
            resolver.reject(new Error('Conversation manager shutdown'));
          }
        }
      }

      return { messageGenerator, sendMessage, responseResolvers, shutdown };
    }

    async function startConversation(configFile: string) {
      const messages: SDKMessage[] = [];
      const toolCalls: Array<{ name: string; input: Record<string, unknown> }> =
        [];
      const { messageGenerator, sendMessage, responseResolvers, shutdown } =
        createConversationManager();

      const cliPath = path.join(__dirname, '../../src/cli.ts');
      const configPath = path.join(configDir, configFile);

      // Track negotiation attempts and setup abort controller
      const abortController = new AbortController();
      let disallowedAttempts = 0;
      let negotiationReason: string | null = null;

      const markDisallowedAttempt = (name: string) => {
        disallowedAttempts += 1;
        if (disallowedAttempts > NEGOTIATION_MAX_ATTEMPTS) {
          negotiationReason =
            negotiationReason ??
            `Negotiation detected: disallowed tool ${name} (attempts=${disallowedAttempts})`;
          try {
            abortController.abort();
          } catch {
            throw new Error(negotiationReason);
          }
        }
      };

      // Start the query
      // Determine allowed tools based on config
      const hasNoCoreTools = configFile === 'config.normal.json';
      const hasCoreTools = [
        'config.minimal.json',
        'config.with-mock-server.json',
        'config.multi-server.json',
      ].includes(configFile);

      const allowedTools = hasNoCoreTools
        ? [] // No core tools with exposeCoreTools: []
        : hasCoreTools
          ? [
              'mcp__mcp-funnel__discover_tools_by_words',
              'mcp__mcp-funnel__get_tool_schema',
              'mcp__mcp-funnel__bridge_tool_request',
              'mcp__mcp-funnel__load_toolset',
            ]
          : []; // Default to no core tools for other configs

      const queryInstance = query({
        prompt: messageGenerator(),
        options: {
          cwd: configDir,
          appendSystemPrompt:
            'You are an AI assistant under test. You are acting in a CI environment. Messages you receive are not from a user, but from a programmatic test. You must reply in a deterministic way. No fillers. Answer as short as possible',
          mcpServers: {
            'mcp-funnel': {
              type: 'stdio',
              command: 'tsx',
              args: [cliPath, configPath],
            },
          },
          //model: 'claude-3-5-haiku-latest',
          model: 'claude-sonnet-4-0',
          maxTurns: 6,
          abortController,
          // Abort if Read permission negotiation is observed repeatedly on stderr
          stderr: (data: string) => {
            if (
              data.includes('PreToolUse:Read') ||
              data.includes('Permission suggestions for Read')
            ) {
              if (disallowedAttempts > NEGOTIATION_MAX_ATTEMPTS) {
                negotiationReason =
                  negotiationReason ??
                  'Negotiation detected: Read permission flow';

                try {
                  abortController.abort();
                } catch {
                  throw new Error(negotiationReason);
                }
              }
            }
          },
          // Strongly constrain tool usage to avoid permission prompts (e.g., Read)
          allowedTools,
          disallowedTools: ['Read', 'Write', 'List', 'SearchInWorkspace'],
          canUseTool: async (name, input) => {
            toolCalls.push({ name, input });

            if (name.includes('mcp-funnel')) {
              return { behavior: 'allow', updatedInput: input };
            } else {
              markDisallowedAttempt(name);
              return {
                behavior: 'deny',
                message: 'Immediately STOP. Try to use mcp-funnel MCP server',
              } as const;
            }
          },
        },
      });

      // Track if we should stop processing
      let shouldStop = false;
      let processingError: Error | null = null;

      // Process responses in the background
      const processingPromise = (async () => {
        try {
          for await (const message of queryInstance) {
            if (message.type === 'system' && message.subtype === 'init') {
              const mcpServerInfo = message.mcp_servers.find(
                (it) => it.name === 'mcp-funnel',
              );
              if (!mcpServerInfo) {
                throw new Error('MCP Funnel server not found in init message');
              }

              if (mcpServerInfo.status !== 'connected') {
                throw new Error(
                  `MCP Funnel server failed to start: ${mcpServerInfo.status}`,
                );
              }
            }
            messages.push(message);

            // When we get a result message, resolve the pending response
            if (message.type === 'result') {
              if (message.subtype === 'success') {
                const pendingResolver = responseResolvers.shift();
                if (pendingResolver) {
                  pendingResolver.resolve(message.result);
                }
                // Check if we're done (no more pending responses)
                if (responseResolvers.length === 0 && shouldStop) {
                  break;
                }
              } else {
                // Handle error cases (error_max_turns, error_during_execution, etc.)
                const pendingResolver = responseResolvers.shift();
                const errorMsg = `Response failed with subtype: ${message.subtype}`;
                const error = new Error(errorMsg);

                if (pendingResolver) {
                  // Reject the promise with the error
                  processingError = error;
                  pendingResolver.reject(error);
                }
                throw error;
              }
            }
          }
        } catch (error) {
          // Store the error and reject all pending resolvers
          if (negotiationReason) {
            processingError = new Error(negotiationReason);
          } else {
            processingError = error as Error;
          }

          // Reject all pending response promises
          while (responseResolvers.length > 0) {
            const resolver = responseResolvers.shift();
            if (resolver) {
              resolver.reject(error as Error);
            }
          }

          // Re-throw to be caught by the caller
          throw error;
        }
      })();

      // Wrap sendMessage to check for errors
      const wrappedSendMessage = async (content: string): Promise<string> => {
        if (processingError) {
          throw processingError;
        }

        const responsePromise = sendMessage(content);

        let replied = false;

        // Per-message watchdog to fail fast on negotiation
        const response = await Promise.race([
          responsePromise.then((it) => {
            replied = true;
            return it;
          }),
          new Promise<string>((_, reject) => {
            setTimeout(() => {
              negotiationReason =
                negotiationReason ??
                `No result in ${NEGOTIATION_TIMEOUT_MS}ms — likely negotiation`;
              processingError = new Error(negotiationReason);
              try {
                abortController.abort();
              } catch {
                throw new Error(negotiationReason);
              }

              if (!replied) reject(processingError);
            }, NEGOTIATION_TIMEOUT_MS);
          }),
        ]);
        if (processingError) {
          throw processingError;
        }

        return response;
      };

      return {
        sendMessage: wrappedSendMessage,
        getMessages: () => messages,
        getToolCalls: () => toolCalls,
        finish: async () => {
          // Signal that we want to stop and wait for processing to complete
          shouldStop = true;

          try {
            // Wait for processing with a timeout
            await Promise.race([
              processingPromise,
              new Promise((_, reject) =>
                setTimeout(
                  () => reject(new Error('Test timeout after 5 seconds')),
                  5000,
                ),
              ),
            ]);
          } catch (error) {
            // If there was an error during processing, it's okay - we're finishing anyway
            if (
              error instanceof Error &&
              error.message !== 'Test timeout after 5 seconds'
            ) {
              console.error('Error during finish:', error.message);
            }
          } finally {
            // Always shutdown the conversation manager to clean up
            shutdown();
          }

          // Check if there was a processing error to propagate
          if (processingError) {
            throw processingError;
          }
        },
      };
    }

    const maxRuns = process.env.E2E_AGENT_RUNS
      ? parseInt(process.env.E2E_AGENT_RUNS)
      : 1;

    const times = (n: number) => [...Array(n).keys()];

    times(maxRuns).forEach((time) => {
      const i = time + 1;
      describe.concurrent(`Core Tools Discovery Mode (Run ${i})`, () => {
        test.concurrent(
          'should connect to MCP Funnel and expose only discovery tools',
          async () => {
            let conversation;
            try {
              conversation = await startConversation('config.minimal.json');

              // ask about available tools
              const toolsResponse = await conversation.sendMessage(
                'Is the tool "mcp__mcp-funnel__discover_tools_by_words" available to you? You MUST reply with ONLY YES or NO on the last line.',
              );

              expectStrictResponse(toolsResponse, 'YES');
            } finally {
              if (conversation) {
                await conversation.finish();
              }
            }
          },
          60000,
        );

        test.concurrent(
          'should use discover_tools_by_words and find no tools when no servers configured',
          async () => {
            let conversation;
            try {
              conversation = await startConversation('config.minimal.json');

              const response = await conversation.sendMessage(
                'Use mcp__mcp-funnel__discover_tools_by_words with words "github api" and then output a final line containing ONLY the number of tools found. The last line must contain only the number.',
              );

              expectStrictNumber(response, 0);
            } finally {
              if (conversation) {
                await conversation.finish();
              }
            }
          },
          60000,
        );

        test.concurrent(
          'should use get_tool_schema to retrieve tool input schema',
          async () => {
            let conversation;
            try {
              conversation = await startConversation(
                'config.with-mock-server.json',
              );

              const response = await conversation.sendMessage(
                'First discover tools with word "echo", then use mcp__mcp-funnel__get_tool_schema for "mockserver__echo". Does it have a parameter named "message"? After any analysis, output a final line containing EXACTLY YES or NO with no quotes or punctuation. The last line will be parsed.',
              );

              expectStrictResponse(response, 'YES');
            } finally {
              if (conversation) {
                await conversation.finish();
              }
            }
          },
          60000,
        );

        test.concurrent(
          'should verify all four hacky discovery tools are exposed',
          async () => {
            const conversation = await startConversation('config.minimal.json');

            // Check each tool
            const tools = [
              'mcp__mcp-funnel__discover_tools_by_words',
              'mcp__mcp-funnel__get_tool_schema',
              'mcp__mcp-funnel__bridge_tool_request',
              'mcp__mcp-funnel__load_toolset',
            ];

            for (const tool of tools) {
              const response = await conversation.sendMessage(
                `Is the tool "${tool}" available? IF it is available THEN you **MUST** reply **ONLY** with 'YES'. IF it is not available, you **MUST** list the tools available via MCP.`,
              );
              expectStrictResponse(response, 'YES');
            }

            await conversation.finish();
          },
          60000,
        );
      });

      describe.concurrent(`Normal Mode (Run ${i})`, () => {
        test('should NOT expose discovery tools when hackyDiscovery is false', async () => {
          const conversation = await startConversation('config.normal.json');

          const response = await conversation.sendMessage(
            'Is the tool "mcp__mcp-funnel__discover_tools_by_words" available? Output the final line as EXACTLY YES or NO with no quotes. The last line will be parsed.',
          );

          expectStrictResponse(response, 'NO');

          await conversation.finish();
        }, 60000);

        test('should expose server tools directly when configured', async () => {
          const conversation = await startConversation(
            'config.with-mock-server.json',
          );

          const response = await conversation.sendMessage(
            'Count how many tools start with "mockserver__". You **MUST** reply ONLY with a number.',
          );

          // Should find the mock server tools
          const count = expectStrictNumber(response);
          expect(count).toBeGreaterThan(0);

          await conversation.finish();
        }, 60000);
      });

      describe.concurrent(`Tool Filtering (Run ${i})`, () => {
        test('should respect hideTools configuration', async () => {
          const conversation = await startConversation(
            'config.with-hidden-tools.json',
          );

          const response = await conversation.sendMessage(
            'Is the tool "mockserver__hidden_tool" available? Output the final line as EXACTLY YES or NO with no quotes. The last line will be parsed.',
          );

          expectStrictResponse(response, 'NO');

          await conversation.finish();
        }, 60000);

        test('should respect exposeTools allowlist', async () => {
          const conversation = await startConversation(
            'config.with-exposed-tools.json',
          );

          const response = await conversation.sendMessage(
            'Is the tool "mockserver__exposed_tool" available? You **MUST** reply with YES or NO',
          );

          expectStrictResponse(response, 'YES');

          const hiddenResponse = await conversation.sendMessage(
            'Is the tool "mockserver__other_tool" available? You **MUST** reply with YES or NO',
          );

          expectStrictResponse(hiddenResponse, 'NO');

          await conversation.finish();
        }, 60000);
      });

      describe.concurrent(`Dynamic Tool Loading (Run ${i})`, () => {
        test('should load toolsets dynamically with load_toolset', async () => {
          const conversation = await startConversation('config.minimal.json');

          const response = await conversation.sendMessage(
            'Use mcp__mcp-funnel__load_toolset to load tools matching pattern "test__*". Was the operation successful? You **MUST** reply ONLY with either "YES" or "NO".',
          );

          // Should be either YES or NO, depending on whether test tools exist
          expect(['YES', 'NO']).toContain(response.trim());

          await conversation.finish();
        }, 60000);
      });

      describe.concurrent(`Multi-Server Aggregation (Run ${i})`, () => {
        test('should aggregate tools from multiple servers with proper namespacing', async () => {
          const conversation = await startConversation(
            'config.multi-server.json',
          );

          const response1 = await conversation.sendMessage(
            'Use mcp__mcp-funnel__discover_tools_by_words with words="github". After getting the results, check: Are there any tools that start with "github__"? Reply with ONLY YES or NO on the last line.',
          );
          expectStrictResponse(response1, 'YES');

          const response2 = await conversation.sendMessage(
            'Use mcp__mcp-funnel__discover_tools_by_words with words="filesystem". After getting the results, check: Are there any tools that start with "filesystem__"? Reply with ONLY YES or NO on the last line.',
          );

          expectStrictResponse(response2, 'YES');

          await conversation.finish();
        }, 60000);

        test('should handle server connection failures gracefully', async () => {
          const conversation = await startConversation(
            'config.with-failing-server.json',
          );

          // Should still connect even if one server fails
          const response = await conversation.sendMessage(
            'Is MCP Funnel connected? You **MUST** reply ONLY with either "YES" or "NO".',
          );

          expect(response).toEqual('YES');

          await conversation.finish();
        }, 60000);
      });

      describe.concurrent(`Tool Execution via Bridge (Run ${i})`, () => {
        test('should execute tools through bridge_tool_request', async () => {
          const conversation = await startConversation(
            'config.with-mock-server.json',
          );

          const response = await conversation.sendMessage(
            'Use mcp__mcp-funnel__bridge_tool_request to execute "mockserver__echo" with arguments {"message": "test"}. What was the response? You **MUST** reply ONLY with the echoed message.',
          );

          // The response should be just the echoed message
          expect(response.trim()).toBe('test');

          await conversation.finish();
        }, 60000);

        test('should handle tool execution errors gracefully', async () => {
          const conversation = await startConversation('config.minimal.json');

          const response = await conversation.sendMessage(
            'Use mcp__mcp-funnel__bridge_tool_request to execute a non-existent tool "fake__tool". Did it fail? You **MUST** reply ONLY with either "YES" or "NO".',
          );

          expect(response).toEqual('YES');

          await conversation.finish();
        }, 60000);
      });
    });
  },
);
