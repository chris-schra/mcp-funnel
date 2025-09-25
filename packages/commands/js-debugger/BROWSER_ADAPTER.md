# Browser Debug Adapter

The Browser Debug Adapter provides a production-ready debugging interface for JavaScript running in Chrome, Edge, and other Chromium-based browsers using the Chrome DevTools Protocol (CDP).

## Features

### Core Debugging Operations

- ✅ **Breakpoint Management**: Set, remove, and manage breakpoints with optional conditions
- ✅ **Execution Control**: Continue, step over, step into, step out
- ✅ **Expression Evaluation**: Evaluate JavaScript expressions in the current debugging context
- ✅ **Stack Inspection**: Get detailed stack traces with function names, files, and line numbers
- ✅ **Variable Inspection**: Access local, closure, and global variables in any stack frame
- ✅ **Console Monitoring**: Capture and process console output (log, warn, error, etc.)

### Browser-Specific Features

- ✅ **Target Discovery**: Automatically discover and connect to browser tabs/pages
- ✅ **Multiple Connection Modes**: Connect by URL pattern, target ID, or automatically
- ✅ **Source Map Support**: Automatic source map resolution for transpiled code
- ✅ **Exception Handling**: Capture and report runtime exceptions
- ✅ **Page Navigation**: Handle page reloads and navigation events

### Production-Ready Features

- ✅ **Robust Error Handling**: Comprehensive error handling with detailed error messages
- ✅ **Connection Management**: Automatic cleanup and proper resource disposal
- ✅ **Event System**: Flexible event handlers for debugging state changes
- ✅ **Type Safety**: Full TypeScript support with proper CDP protocol types

## Quick Start

### 1. Start Chrome with Remote Debugging

```bash
# Chrome
chrome --remote-debugging-port=9222 --disable-web-security

# Chrome Headless
chrome --headless --remote-debugging-port=9222 --disable-web-security

# Edge
msedge --remote-debugging-port=9222 --disable-web-security
```

### 2. Basic Usage

```typescript
import { BrowserAdapter } from '@mcp-funnel/command-js-debugger';

const debugger = new BrowserAdapter();

// Connect to first available page
await debugger.connect('auto');

// Set a breakpoint
const bpId = await debugger.setBreakpoint('https://example.com/script.js', 42);

// Set up event handlers
debugger.onPaused((state) => {
  console.log('Paused at:', state.breakpoint);
});

debugger.onConsoleOutput((msg) => {
  console.log(`[${msg.level}] ${msg.message}`);
});
```

## Connection Modes

### Auto Connection

```typescript
// Connect to the first available page
await debugger.connect('auto');
```

### URL Pattern Matching

```typescript
// Connect to a page matching the URL pattern
await debugger.connect('localhost:3000');
await debugger.connect('https://example.com');
```

### Target ID

```typescript
// Connect to a specific target by ID
await debugger.connect('E4C5B0D1-2F3A-4B5C-8D9E-1F2A3B4C5D6E');
```

### Target Title

```typescript
// Connect by page title
await debugger.connect('My App - Dashboard');
```

## Advanced Features

### Conditional Breakpoints

```typescript
const bpId = await debugger.setBreakpoint(
  'app.js',
  100,
  'user.role === "admin" && user.active === true'
);
```

### Stack Frame Inspection

```typescript
debugger.onPaused(async (state) => {
  const stackTrace = await debugger.getStackTrace();

  // Inspect variables in the top frame
  const scopes = await debugger.getScopes(0);
  const localVars = scopes.find(s => s.type === 'local');

  console.log('Local variables:', localVars?.variables);
});
```

### Expression Evaluation

```typescript
// Evaluate in current context
const result = await debugger.evaluate('window.location.href');
console.log('Current URL:', result.value);

// Complex expressions
const userInfo = await debugger.evaluate(`
  JSON.stringify({
    userAgent: navigator.userAgent,
    cookies: document.cookie,
    title: document.title
  })
`);
```

### Console Monitoring

```typescript
debugger.onConsoleOutput((message) => {
  switch (message.level) {
    case 'error':
      console.error('❌', message.message, message.stackTrace);
      break;
    case 'warn':
      console.warn('⚠️', message.message);
      break;
    default:
      console.log(`[${message.level}]`, message.message);
  }
});
```

## Source Map Support

The adapter automatically resolves source maps for transpiled code:

- ✅ **Data URLs**: `data:application/json;base64,...`
- ✅ **HTTP URLs**: `https://cdn.example.com/app.js.map`
- ⚠️ **Relative URLs**: Limited support (browser context dependent)

Source maps are loaded asynchronously and used for:

- Mapping minified locations to original source
- Resolving original file names in stack traces
- Providing accurate debugging information for TypeScript, Babel, etc.

## Error Handling

The adapter provides comprehensive error handling:

```typescript
try {
  await debugger.connect('auto');
} catch (error) {
  if (error.message.includes('endpoint not available')) {
    console.error('Chrome not running with --remote-debugging-port=9222');
  } else if (error.message.includes('Could not find target')) {
    console.error('No suitable debugging target found');
  } else {
    console.error('Connection failed:', error);
  }
}
```

## API Reference

### Constructor

```typescript
new BrowserAdapter(host?: string, port?: number)
```

- `host`: CDP endpoint host (default: 'localhost')
- `port`: CDP endpoint port (default: 9222)

### Core Methods

#### Connection Management

- `connect(target: string): Promise<void>` - Connect to debugging target
- `disconnect(): Promise<void>` - Disconnect and cleanup

#### Breakpoint Management

- `setBreakpoint(file: string, line: number, condition?: string): Promise<string>` - Set breakpoint
- `removeBreakpoint(id: string): Promise<void>` - Remove breakpoint

#### Execution Control

- `continue(): Promise<DebugState>` - Resume execution
- `stepOver(): Promise<DebugState>` - Step over current line
- `stepInto(): Promise<DebugState>` - Step into function call
- `stepOut(): Promise<DebugState>` - Step out of current function

#### Inspection

- `evaluate(expression: string): Promise<EvaluationResult>` - Evaluate expression
- `getStackTrace(): Promise<StackFrame[]>` - Get current stack trace
- `getScopes(frameId: number): Promise<Scope[]>` - Get variable scopes

#### Event Handlers

- `onConsoleOutput(handler: ConsoleHandler): void` - Register console handler
- `onPaused(handler: PauseHandler): void` - Register pause handler
- `onResumed(handler: ResumeHandler): void` - Register resume handler

## Browser Compatibility

### Supported Browsers

- ✅ **Google Chrome** (all versions with CDP support)
- ✅ **Microsoft Edge** (Chromium-based)
- ✅ **Chromium** (all builds)
- ✅ **Brave Browser**
- ✅ **Opera** (Chromium-based)

### CDP Protocol Support

- **Debugger Domain**: Full support for breakpoints, execution control, and script inspection
- **Runtime Domain**: Expression evaluation, console monitoring, exception handling
- **Page Domain**: Navigation events and resource loading
- **Network Domain**: Resource monitoring (future enhancement)

## Troubleshooting

### Common Issues

**"Chrome DevTools endpoint not available"**

```bash
# Ensure Chrome is running with the correct flags
chrome --remote-debugging-port=9222 --disable-web-security
```

**"Could not find or create target"**

- Check that browser has open tabs
- Try `debugger.connect('auto')` instead of URL patterns
- Verify the target URL/pattern is correct

**"Request timeout"**

- Check network connectivity to CDP endpoint
- Increase timeout in CDP client options
- Verify browser is responsive

**Source maps not loading**

- Ensure source map URLs are accessible
- Check browser console for CORS issues
- Verify source map format is valid

### Debug Mode

Enable verbose logging for troubleshooting:

```typescript
const debugger = new BrowserAdapter();

// Log all CDP events
debugger.cdpClient.on('*', (event, params) => {
  console.log('CDP Event:', event, params);
});
```

## Integration Examples

### With Jest Testing

```typescript
import { BrowserAdapter } from '@mcp-funnel/command-js-debugger';

describe('Browser Debugging', () => {
  let debugger: BrowserAdapter;

  beforeEach(async () => {
    debugger = new BrowserAdapter();
    await debugger.connect('auto');
  });

  afterEach(async () => {
    await debugger.disconnect();
  });

  test('should pause at breakpoint', async () => {
    const bpId = await debugger.setBreakpoint('app.js', 10);

    // Trigger code execution in browser...

    const pausePromise = new Promise(resolve =>
      debugger.onPaused(resolve)
    );

    const state = await pausePromise;
    expect(state.pauseReason).toBe('breakpoint');
  });
});
```

### With Puppeteer

```typescript
import puppeteer from 'puppeteer';
import { BrowserAdapter } from '@mcp-funnel/command-js-debugger';

const browser = await puppeteer.launch({
  args: ['--remote-debugging-port=9222']
});

const debugger = new BrowserAdapter();
await debugger.connect('auto');

// Debug Puppeteer-controlled page
const page = await browser.newPage();
await page.goto('https://example.com');

const bpId = await debugger.setBreakpoint('app.js', 50);
await page.click('#trigger-button');
// Breakpoint hit!
```

## Performance Considerations

- **WebSocket Connection**: Minimal overhead for CDP communication
- **Source Map Loading**: Loaded asynchronously, doesn't block debugging
- **Event Handling**: Efficient event-driven architecture
- **Memory Management**: Automatic cleanup of resources and event listeners
- **Connection Pooling**: Single WebSocket connection per adapter instance

## Security Considerations

- **CORS**: Browser must be started with `--disable-web-security` for full functionality
- **Network Access**: CDP endpoint exposes debug access - use only in development
- **Code Evaluation**: `evaluate()` executes arbitrary JavaScript in browser context
- **Source Maps**: External source maps may expose internal code structure
