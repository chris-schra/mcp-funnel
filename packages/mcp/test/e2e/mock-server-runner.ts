#!/usr/bin/env tsx

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

const serverType = process.argv[2] || 'test';

// Create the MCP server
const server = new Server(
  {
    name: 'mockserver',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Define tools based on server type
const tools = (() => {
  switch (serverType) {
    case 'github':
      return [
        {
          name: 'create_issue',
          description: 'Create a new issue in a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository in owner/repo format',
              },
              title: { type: 'string', description: 'Issue title' },
              body: { type: 'string', description: 'Issue body' },
            },
            required: ['repository', 'title'],
          },
        },
        {
          name: 'list_issues',
          description: 'List issues from a GitHub repository',
          inputSchema: {
            type: 'object',
            properties: {
              repository: {
                type: 'string',
                description: 'Repository in owner/repo format',
              },
              state: { type: 'string', enum: ['open', 'closed', 'all'] },
            },
            required: ['repository'],
          },
        },
      ];
    case 'filesystem':
      return [
        {
          name: 'read_file',
          description: 'Read contents of a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string', description: 'File path to read' },
            },
            required: ['path'],
          },
        },
        {
          name: 'write_file',
          description: 'Write contents to a file',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
              content: { type: 'string' },
            },
            required: ['path', 'content'],
          },
        },
        {
          name: 'list_files',
          description: 'List files in a directory',
          inputSchema: {
            type: 'object',
            properties: {
              path: { type: 'string' },
            },
            required: ['path'],
          },
        },
      ];
    case 'test':
    default:
      return [
        {
          name: 'echo',
          description: 'Echo back the message',
          inputSchema: {
            type: 'object',
            properties: {
              message: { type: 'string', description: 'Message to echo' },
            },
            required: ['message'],
          },
        },
        {
          name: 'exposed_tool',
          description: 'A tool that should be exposed',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'hidden_tool',
          description: 'A tool that should be hidden',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'other_tool',
          description: 'Another tool for testing',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
      ];
  }
})();

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'echo':
      return {
        content: [
          {
            type: 'text',
            text: args.message as string,
          },
        ],
      };
    case 'create_issue':
      return {
        content: [
          {
            type: 'text',
            text: `Created issue "${args.title}" in ${args.repository}`,
          },
        ],
      };
    case 'list_issues':
      return {
        content: [
          {
            type: 'text',
            text: `Listed issues from ${args.repository}`,
          },
        ],
      };
    case 'read_file':
      return {
        content: [
          {
            type: 'text',
            text: `Contents of ${args.path}: mock file data`,
          },
        ],
      };
    case 'write_file':
      return {
        content: [
          {
            type: 'text',
            text: `Wrote to ${args.path}`,
          },
        ],
      };
    case 'list_files':
      return {
        content: [
          {
            type: 'text',
            text: `Files in ${args.path}: file1.txt, file2.js`,
          },
        ],
      };
    case 'exposed_tool':
      return {
        content: [
          {
            type: 'text',
            text: 'Exposed tool called',
          },
        ],
      };
    case 'hidden_tool':
      return {
        content: [
          {
            type: 'text',
            text: 'Hidden tool called',
          },
        ],
      };
    case 'other_tool':
      return {
        content: [
          {
            type: 'text',
            text: 'Other tool called',
          },
        ],
      };
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Start the server with stdio transport
async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`Mock server (${serverType}) started on stdio`);
}

runServer().catch((error) => {
  console.error('Failed to run mock server:', error);
  process.exit(1);
});
