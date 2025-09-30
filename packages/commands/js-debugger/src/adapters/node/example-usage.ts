#!/usr/bin/env tsx

/**
 * Example usage of ProcessSpawner
 *
 * This script demonstrates how to use the ProcessSpawner class to spawn
 * Node.js processes with inspector enabled and connect to them via CDP.
 */

import { ProcessSpawner } from './process-spawner.js';
import { resolve } from 'path';

/**
 * Demonstrates ProcessSpawner usage with various configuration options
 */
async function demonstrateProcessSpawner() {
  const spawner = new ProcessSpawner();

  // Listen for process output
  spawner.on('output', (output) => {
    console.info(`[${output.type.toUpperCase()}] ${output.text.trim()}`);
  });

  // Listen for process exit
  spawner.on('exit', (code, signal) => {
    console.info(`Process exited with code: ${code}, signal: ${signal}`);
  });

  try {
    console.info('🚀 Spawning Node.js process with inspector...\n');

    // Create a simple test script path
    const testScript = resolve(
      process.cwd(),
      'test/fixtures/node/breakpoint-script.ts',
    );

    // Example 1: Spawn with default options (--inspect-brk on random port)
    console.info('Example 1: Default spawn (--inspect-brk, random port)');
    const result1 = await spawner.spawn(testScript);
    console.info(`✅ Process spawned successfully!`);
    console.info(`   PID: ${result1.process.pid}`);
    console.info(`   WebSocket URL: ${result1.wsUrl}`);
    console.info(`   Inspector Port: ${result1.port}\n`);

    // Clean up
    await spawner.kill(result1.process);
    console.info('🧹 Process terminated\n');

    // Example 2: Spawn with tsx command
    console.info('Example 2: TypeScript with tsx loader');
    const result2 = await spawner.spawn(testScript, {
      command: 'tsx',
      stopOnEntry: false, // Use --inspect instead of --inspect-brk
      port: 9229, // Fixed port
    });
    console.info(`✅ TSX process spawned successfully!`);
    console.info(`   PID: ${result2.process.pid}`);
    console.info(`   WebSocket URL: ${result2.wsUrl}`);
    console.info(`   Inspector Port: ${result2.port}\n`);

    await spawner.kill(result2.process);
    console.info('🧹 TSX process terminated\n');

    // Example 3: Spawn with additional Node.js arguments
    console.info('Example 3: With additional Node.js arguments');
    const result3 = await spawner.spawn(testScript, {
      args: ['--enable-source-maps', '--max-old-space-size=2048'],
      env: { NODE_ENV: 'development' },
    });
    console.info(`✅ Process with args spawned successfully!`);
    console.info(`   PID: ${result3.process.pid}`);
    console.info(`   WebSocket URL: ${result3.wsUrl}`);
    console.info(`   Inspector Port: ${result3.port}\n`);

    await spawner.kill(result3.process);
    console.info('🧹 Process with args terminated\n');

    console.info('🎉 All examples completed successfully!');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateProcessSpawner().catch(console.error);
}

export { demonstrateProcessSpawner };
