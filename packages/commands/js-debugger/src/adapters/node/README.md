# Node.js Process Spawner

This module provides utilities for spawning Node.js processes with Chrome DevTools Protocol (CDP) inspector support.

## Overview

The `ProcessSpawner` class handles the lifecycle of Node.js debugging sessions by:

1. **Spawning processes** with the correct inspector flags (`--inspect` or `--inspect-brk`)
2. **Extracting WebSocket URLs** from process output for CDP connections
3. **Supporting multiple runtimes** (node, tsx, ts-node) with appropriate loaders
4. **Managing process lifecycle** including graceful termination

## Usage

```typescript
import { ProcessSpawner } from './process-spawner.js';

const spawner = new ProcessSpawner();

// Basic usage
const result = await spawner.spawn('/path/to/script.js');
console.log('WebSocket URL:', result.wsUrl);

// With TypeScript support
const tsResult = await spawner.spawn('/path/to/script.ts', {
  command: 'tsx',
  stopOnEntry: false,
  port: 9229
});

// Cleanup
await spawner.kill(result.process);
```

## Integration with NodeDebugAdapter

This module is designed to be used by the `NodeDebugAdapter` class to handle the process spawning lifecycle, separating concerns between:

- **ProcessSpawner**: Process lifecycle and WebSocket URL extraction
- **NodeDebugAdapter**: CDP communication and debugging protocol handling

## Key Features

### Runtime Support
- **node**: Standard Node.js runtime
- **tsx**: TypeScript with tsx loader (`--loader tsx/esm`)
- **ts-node**: TypeScript with ts-node loader (`--loader ts-node/esm`)

### Inspector Modes
- **--inspect-brk**: Stops on first line (default, `stopOnEntry: true`)
- **--inspect**: Runs normally (`stopOnEntry: false`)

### Port Configuration
- **Random port** (`port: 0`, default): Let Node.js choose available port
- **Fixed port** (`port: 9229`): Use specific port number

### Process Management
- **Graceful termination**: SIGTERM followed by SIGKILL if needed
- **Output monitoring**: Events for stdout/stderr streams
- **Error handling**: Timeout and exit code error handling

## Event System

The ProcessSpawner extends EventEmitter and provides:

```typescript
spawner.on('output', (output: ProcessOutput) => {
  console.log(`[${output.type}] ${output.text}`);
});

spawner.on('exit', (code, signal) => {
  console.log(`Process exited: ${code}, ${signal}`);
});
```

## Implementation Notes

Based on the existing codebase patterns:

- **strawman.ts lines 19-45**: Core spawning logic foundation
- **Integration tests**: WebSocket URL extraction patterns
- **Existing adapters**: Event-driven architecture consistency
- **TypeScript patterns**: Proper type safety throughout

## Testing

Comprehensive unit tests cover:
- Different runtime commands (node, tsx, ts-node)
- Inspector flag variations (--inspect vs --inspect-brk)
- Port configuration (random vs fixed)
- Error scenarios (timeouts, process exits)
- Event emission (output, exit events)
- Process termination (graceful and forced)