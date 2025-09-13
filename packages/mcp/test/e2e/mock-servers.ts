import { createSdkMcpServer, tool } from '@anthropic-ai/claude-code';
import { z } from 'zod';

export const createMockGitHubServer = () =>
  createSdkMcpServer({
    name: 'mock-github',
    version: '1.0.0',
    tools: [
      tool(
        'create_issue',
        'Create a new issue in a GitHub repository',
        {
          repository: z.string().describe('Repository in owner/repo format'),
          title: z.string().describe('Issue title'),
          body: z.string().optional().describe('Issue body'),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Created issue "${args.title}" in ${args.repository}`,
            },
          ],
        }),
      ),
      tool(
        'list_issues',
        'List issues from a GitHub repository',
        {
          repository: z.string().describe('Repository in owner/repo format'),
          state: z.enum(['open', 'closed', 'all']).optional(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Listed issues from ${args.repository}`,
            },
          ],
        }),
      ),
      tool(
        'create_pull_request',
        'Create a pull request in a GitHub repository',
        {
          repository: z.string(),
          title: z.string(),
          body: z.string().optional(),
          head: z.string(),
          base: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Created PR "${args.title}" in ${args.repository}`,
            },
          ],
        }),
      ),
      tool(
        'list_pull_requests',
        'List pull requests from a GitHub repository',
        {
          repository: z.string(),
          state: z.enum(['open', 'closed', 'all']).optional(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Listed PRs from ${args.repository}`,
            },
          ],
        }),
      ),
      tool(
        'get_pull_request_diff',
        'Get diff for a pull request',
        {
          repository: z.string(),
          pull_number: z.number(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Retrieved diff for PR #${args.pull_number}`,
            },
          ],
        }),
      ),
      tool(
        'merge_pull_request',
        'Merge a pull request',
        {
          repository: z.string(),
          pull_number: z.number(),
          merge_method: z.enum(['merge', 'squash', 'rebase']).optional(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Merged PR #${args.pull_number} in ${args.repository}`,
            },
          ],
        }),
      ),
      tool(
        'search_issues',
        'Search for issues across GitHub',
        {
          query: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Found 5 issues matching "${args.query}"`,
            },
          ],
        }),
      ),
      tool('get_me', 'Get authenticated user details', {}, async () => ({
        content: [
          {
            type: 'text',
            text: 'Authenticated as mock-user',
          },
        ],
      })),
    ],
  });

export const createMockFileSystemServer = () =>
  createSdkMcpServer({
    name: 'mock-filesystem',
    version: '1.0.0',
    tools: [
      tool(
        'read_file',
        'Read contents of a file',
        {
          path: z.string().describe('File path to read'),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Contents of ${args.path}: mock file data`,
            },
          ],
        }),
      ),
      tool(
        'write_file',
        'Write contents to a file',
        {
          path: z.string(),
          content: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Wrote to ${args.path}`,
            },
          ],
        }),
      ),
      tool(
        'list_files',
        'List files in a directory',
        {
          path: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Files in ${args.path}: file1.txt, file2.js`,
            },
          ],
        }),
      ),
    ],
  });

export const createMockMemoryServer = () =>
  createSdkMcpServer({
    name: 'mock-memory',
    version: '1.0.0',
    tools: [
      tool(
        'store_memory',
        'Store a memory entry',
        {
          key: z.string(),
          value: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Stored memory: ${args.key}`,
            },
          ],
        }),
      ),
      tool(
        'retrieve_memory',
        'Retrieve a memory entry',
        {
          key: z.string(),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: `Retrieved memory: ${args.key}`,
            },
          ],
        }),
      ),
      tool('list_memories', 'List all stored memories', {}, async () => ({
        content: [
          {
            type: 'text',
            text: 'Listed all memories',
          },
        ],
      })),
    ],
  });

export const createMockTestServer = () =>
  createSdkMcpServer({
    name: 'mockserver',
    version: '1.0.0',
    tools: [
      tool(
        'echo',
        'Echo back the message',
        {
          message: z.string().describe('Message to echo'),
        },
        async (args) => ({
          content: [
            {
              type: 'text',
              text: args.message,
            },
          ],
        }),
      ),
      tool('exposed_tool', 'A tool that should be exposed', {}, async () => ({
        content: [
          {
            type: 'text',
            text: 'Exposed tool called',
          },
        ],
      })),
      tool('hidden_tool', 'A tool that should be hidden', {}, async () => ({
        content: [
          {
            type: 'text',
            text: 'Hidden tool called',
          },
        ],
      })),
      tool('other_tool', 'Another tool for testing', {}, async () => ({
        content: [
          {
            type: 'text',
            text: 'Other tool called',
          },
        ],
      })),
    ],
  });
