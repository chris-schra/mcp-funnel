# @mcp-funnel/command-js-debugger

A powerful JavaScript debugger command for MCP Funnel that enables debugging Node.js and browser JavaScript applications through the Chrome DevTools Protocol (CDP).

## 🎯 Overview

The js-debugger command provides comprehensive debugging capabilities for JavaScript environments, allowing you to:

- Debug Node.js applications with full inspector support
- Debug browser JavaScript in Chrome, Edge, and Chromium-based browsers
- Set breakpoints, step through code, and inspect variables
- Capture and search console output
- Evaluate expressions in debugging context
- Manage multiple debugging sessions simultaneously

## ✨ Features

### Core Debugging
- **Breakpoint Management**: Set conditional breakpoints at specific lines
- **Execution Control**: Continue, step over, step into, step out
- **Variable Inspection**: Explore local, closure, and global scopes
- **Stack Trace Analysis**: Navigate call stacks with source mapping
- **Expression Evaluation**: Execute code in the current debugging context
- **Console Monitoring**: Capture and filter console output by levels

### Platform Support
- **Node.js**: Debug scripts, TypeScript (via tsx/ts-node), and long-running processes
- **Browser**: Debug JavaScript in Chrome, Edge, Brave, Opera (Chromium-based)
- **Source Maps**: Automatic resolution for transpiled code (TypeScript, Babel)
- **Mock Sessions**: Built-in mock debugging for testing and demos

### Production Features
- **Session Management**: Track and manage multiple concurrent debug sessions
- **Resource Cleanup**: Automatic cleanup of inactive sessions
- **Error Recovery**: Robust error handling and connection management
- **Type Safety**: Full TypeScript support with comprehensive type definitions

## 📦 Installation

The js-debugger command is included with MCP Funnel. To use it, ensure MCP Funnel is configured:

```bash
# Via npx (recommended)
npx mcp-funnel

# Or install globally
npm install -g mcp-funnel
```

## 🚀 Quick Start

### Node.js Debugging

```bash
# Start debugging a Node.js script
npx mcp-funnel run js-debugger debug --platform node --target ./app.js

# Debug with breakpoints
npx mcp-funnel run js-debugger debug \
  --platform node \
  --target ./app.js \
  --breakpoint app.js:10 \
  --breakpoint utils.js:25:condition="user.id > 100"

# Debug TypeScript with tsx
npx mcp-funnel run js-debugger debug \
  --platform node \
  --target ./app.ts \
  --command tsx
```

### Browser Debugging

```bash
# First, start Chrome with debugging enabled
chrome --remote-debugging-port=9222

# Then connect the debugger
npx mcp-funnel run js-debugger debug --platform browser --target auto

# Or connect to specific page
npx mcp-funnel run js-debugger debug \
  --platform browser \
  --target "localhost:3000"
```

## 🛠 MCP Tools

When used through MCP protocol, the js-debugger exposes these tools:

### `js-debugger_debug`
Start a debugging session for Node.js or browser JavaScript.

**Parameters:**
- `platform`: "node" | "browser" - Target platform
- `target`: Script path (Node) or URL/auto (browser)
- `command?`: Runtime command for Node (node, tsx, ts-node)
- `args?`: Additional CLI arguments passed to the script (Node only)
- `breakpoints?`: Array of breakpoint definitions
- `timeout?`: Session timeout in milliseconds
- `evalExpressions?`: Expressions to evaluate when paused
- `captureConsole?`: Enable console output capture
- `consoleVerbosity?`: "all" | "warn-error" | "error-only" | "none"

### `js-debugger_continue`
Resume execution from a breakpoint.

**Parameters:**
- `sessionId`: Debug session ID
- `action?`: "stepOver" | "stepInto" | "stepOut" | "continue"
- `evaluate?`: Expression to evaluate before continuing

### `js-debugger_stop`
Terminate a debugging session.

**Parameters:**
- `sessionId`: Debug session ID
- `force?`: Force termination without cleanup

### `js-debugger_list_sessions`
List all active debugging sessions.

**Parameters:**
- `includeMock?`: Include mock sessions in the list
- `includeMetadata?`: Include session metadata

### `js-debugger_get_stacktrace`
Get the current stack trace when paused.

**Parameters:**
- `sessionId`: Debug session ID
- `maxFrames?`: Maximum number of frames to return

### `js-debugger_get_variables`
Inspect variables at a specific scope or path.

**Parameters:**
- `sessionId`: Debug session ID
- `frameId?`: Stack frame ID (0 for top frame)
- `path?`: Variable path (e.g., "user.profile.settings")
- `maxDepth?`: Maximum object traversal depth

### `js-debugger_search_console_output`
Search and filter console output.

**Parameters:**
- `sessionId`: Debug session ID
- `search?`: Search text
- `levels?`: Filter by log levels
- `since?`: Timestamp to search from
- `limit?`: Maximum results to return

### `js-debugger_cleanup_sessions`
Clean up inactive or terminated sessions.

**Parameters:**
- `olderThanMinutes?`: Clean sessions older than specified minutes
- `force?`: Force cleanup of all sessions

## 📖 Usage Examples

### Basic Node.js Debugging

```typescript
// Using MCP protocol
const result = await callTool('js-debugger_debug', {
  platform: 'node',
  target: './server.js',
  breakpoints: [
    { file: 'server.js', line: 42 },
    { file: 'auth.js', line: 15, condition: 'token === null' }
  ],
  captureConsole: true
});

// Session ID returned
const { sessionId } = result;

// When breakpoint hits, continue execution
await callTool('js-debugger_continue', {
  sessionId,
  action: 'stepOver'
});
```

### Browser Debugging with Variable Inspection

```typescript
// Connect to browser
const { sessionId } = await callTool('js-debugger_debug', {
  platform: 'browser',
  target: 'auto',
  captureConsole: true,
  consoleVerbosity: 'warn-error'
});

// When paused, inspect variables
const variables = await callTool('js-debugger_get_variables', {
  sessionId,
  path: 'window.app.state',
  maxDepth: 3
});
```

### Console Output Search

```typescript
// Search console output for errors
const results = await callTool('js-debugger_search_console_output', {
  sessionId,
  search: 'error',
  levels: { error: true, warn: true },
  limit: 50
});
```

## 🏗 Architecture

The js-debugger follows the SEAMS (Simple Extensions, Abstract Minimally, Ship) architecture:

```
┌─────────────────────────┐
│  JsDebuggerCommand      │  ← Thin orchestrator
└───────────┬─────────────┘
            │
    ┌───────┴────────┐
    │                │
┌───▼───┐      ┌────▼────┐
│Handlers│      │Services │
└───┬───┘      └────┬────┘
    │               │
┌───▼────────────────▼───┐
│   Platform Adapters    │
├────────────┬───────────┤
│NodeAdapter │BrowserAdapter│
└────────────┴───────────┘
            │
    ┌───────▼────────┐
    │  CDP Protocol  │
    └────────────────┘
```

### Extension Points

- **IDebugAdapter**: Platform-specific debugging implementation
- **IToolHandler**: MCP tool handling logic
- **IResponseFormatter**: Response formatting strategy
- **ISessionValidator**: Session validation logic

## 🔧 Configuration

### Session Management

Default cleanup configuration:
- Session timeout: 30 minutes
- Heartbeat interval: 5 minutes
- Max console entries: 1000
- Max inactive sessions: 10
- Memory threshold: 100MB

### CDP Connection

Configure CDP client options:
- Connection timeout: 30 seconds
- Request timeout: 10 seconds
- Auto-reconnect: Enabled
- Max reconnect attempts: 3

## 🐛 Troubleshooting

### Common Issues

**"Chrome DevTools endpoint not available"**
```bash
# Ensure Chrome is running with debugging
chrome --remote-debugging-port=9222
```

**"Could not find debugging target"**
- For Node.js: Check script path and permissions
- For browser: Ensure target page is loaded

**"Session timeout"**
- Increase timeout in debug request
- Check for infinite loops or blocking code

### Debug Mode

Enable verbose logging:
```bash
DEBUG=js-debugger:* npx mcp-funnel run js-debugger debug ...
```

## 🧪 Testing

The package includes comprehensive tests:

```bash
# Run tests from repository root
yarn test packages/commands/js-debugger

# Run specific test suites
yarn test browser-adapter
yarn test node-adapter
yarn test session-manager
```

## 🤝 Contributing

Contributions are welcome! Key areas:

1. **Platform Support**: Additional runtime support (Deno, Bun)
2. **Features**: Advanced debugging capabilities
3. **Performance**: Optimization for large applications
4. **Documentation**: Examples and guides

## 📄 License

MIT - Part of the MCP Funnel project

## 🔗 Links

- [MCP Funnel Repository](https://github.com/chris-schra/mcp-funnel)
- [Chrome DevTools Protocol](https://chromedevtools.github.io/devtools-protocol/)
- [Node.js Debugging Guide](https://nodejs.org/en/docs/guides/debugging-getting-started/)
