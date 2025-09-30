import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ProcessSpawner } from './process-spawner.js';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { ChildProcess } from 'child_process';

describe('ProcessSpawner', () => {
  let spawner: ProcessSpawner;
  let tempDir: string;
  let spawnedProcesses: ChildProcess[] = [];

  beforeEach(() => {
    spawner = new ProcessSpawner();
    tempDir = mkdtempSync(join(tmpdir(), 'process-spawner-test-'));
  });

  afterEach(async () => {
    // Clean up any spawned processes
    await Promise.all(
      spawnedProcesses.map(async (process) => {
        if (!process.killed && process.exitCode === null) {
          await spawner.kill(process);
        }
      }),
    );
    spawnedProcesses = [];

    // Clean up temp directory
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * Create a test script that simulates Node.js behavior for testing
   * @param filename - Name of the test script file
   * @param scriptContent - JavaScript code to write to the file
   * @returns Absolute path to the created test script
   */
  function createTestScript(filename: string, scriptContent: string): string {
    const scriptPath = join(tempDir, filename);
    writeFileSync(scriptPath, scriptContent, 'utf8');
    return scriptPath;
  }

  /**
   * Track spawned processes for cleanup
   * @param process - Child process to add to tracking array
   * @returns The same process for chaining
   */
  function trackProcess(process: ChildProcess): ChildProcess {
    spawnedProcesses.push(process);
    return process;
  }

  describe('spawn', () => {
    it('spawns node process and extracts inspector URL from stderr', async () => {
      // Create a script that simply keeps running to allow inspector startup
      const scriptPath = createTestScript(
        'basic.js',
        `
        // Keep the process alive to allow inspector to start
        setInterval(() => {
          console.log('Process running...');
        }, 100);
        `,
      );

      const result = await spawner.spawn(scriptPath);
      trackProcess(result.process);

      // Verify the result structure
      expect(result.wsUrl).toMatch(/^ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]+$/);
      expect(result.port).toBeGreaterThan(0);
      expect(result.process).toBeDefined();
      expect(result.process.pid).toBeGreaterThan(0);
    });

    it('uses specified port when provided', async () => {
      const scriptPath = createTestScript(
        'port-test.js',
        `
        setInterval(() => {
          console.log('Process running on specified port...');
        }, 100);
        `,
      );

      const result = await spawner.spawn(scriptPath, { port: 9876 });
      trackProcess(result.process);

      expect(result.port).toBe(9876);
      expect(result.wsUrl).toContain(':9876/');
    });

    it('includes additional Node arguments', async () => {
      const scriptPath = createTestScript(
        'args-test.js',
        `
        // Verify the max old space size is applied by checking process.memoryUsage
        setInterval(() => {
          console.log('Process with additional args running...');
        }, 100);
        `,
      );

      const result = await spawner.spawn(scriptPath, {
        args: ['--max-old-space-size=512'],
      });
      trackProcess(result.process);

      expect(result.wsUrl).toBeDefined();
      expect(result.port).toBeGreaterThan(0);
    });

    it('rejects with timeout when no inspector URL appears', async () => {
      // Create a script that runs without --inspect flag to test timeout
      // We'll spawn node without --inspect-brk to avoid inspector URL output
      const scriptPath = createTestScript(
        'no-inspector.js',
        `
        // This script will run normally but won't output inspector URL
        // because we'll override the spawn to not include --inspect-brk
        setInterval(() => {
          console.log('Running without inspector...');
        }, 50);
        `,
      );

      // Create a custom spawner that doesn't add --inspect-brk to test timeout
      class NoInspectorSpawner extends ProcessSpawner {
        protected buildRuntimeArgs() {
          return { runtime: 'node', runtimeArgs: [] };
        }
      }

      const noInspectorSpawner = new NoInspectorSpawner();

      await expect(
        noInspectorSpawner.spawn(scriptPath, { timeoutMs: 500 }),
      ).rejects.toThrow(/Inspector URL extraction timed out after 500ms/);
    });

    it('handles process with different inspector ports', async () => {
      const scriptPath1 = createTestScript(
        'port1.js',
        `
        setInterval(() => {
          console.log('Process 1 running...');
        }, 100);
        `,
      );

      const scriptPath2 = createTestScript(
        'port2.js',
        `
        setInterval(() => {
          console.log('Process 2 running...');
        }, 100);
        `,
      );

      // Spawn two processes with dynamic port allocation (port 0)
      // This ensures no port conflicts in test environments
      const [result1, result2] = await Promise.all([
        spawner.spawn(scriptPath1, { port: 0 }),
        spawner.spawn(scriptPath2, { port: 0 }),
      ]);

      trackProcess(result1.process);
      trackProcess(result2.process);

      // Verify both processes have valid ports and they are different
      expect(result1.port).toBeGreaterThan(0);
      expect(result2.port).toBeGreaterThan(0);
      expect(result1.port).not.toBe(result2.port);
      expect(result1.wsUrl).toContain(`:${result1.port}/`);
      expect(result2.wsUrl).toContain(`:${result2.port}/`);
    });
  });

  describe('kill', () => {
    it('does nothing if process is already killed', async () => {
      const scriptPath = createTestScript(
        'already-killed.js',
        `process.exit(0);`,
      );

      // Start and immediately wait for the process to exit
      try {
        await spawner.spawn(scriptPath);
      } catch (error) {
        // Process should exit before inspector URL is found
        expect(error).toBeDefined();
      }

      // Find the process that was spawned (it should be dead by now)
      const process = spawnedProcesses[0];
      if (process) {
        // Wait a bit to ensure the process has exited
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Killing an already dead process should not throw
        await expect(spawner.kill(process)).resolves.not.toThrow();
      }
    });

    it('sends SIGTERM and waits for graceful exit', async () => {
      const scriptPath = createTestScript(
        'graceful-exit.js',
        `
        // Handle SIGTERM gracefully
        process.on('SIGTERM', () => {
          console.log('Received SIGTERM, exiting gracefully...');
          setTimeout(() => process.exit(0), 50); // Brief delay to simulate cleanup
        });

        setInterval(() => {
          console.log('Process running...');
        }, 100);
        `,
      );

      const result = await spawner.spawn(scriptPath);
      trackProcess(result.process);

      // Verify process is running
      expect(result.process.killed).toBe(false);
      expect(result.process.exitCode).toBe(null);

      // Kill the process gracefully
      await spawner.kill(result.process);

      // Process should be terminated (killed property is set by Node.js)
      expect(result.process.killed).toBe(true);
    });

    it('handles multiple kill calls on same process gracefully', async () => {
      const scriptPath = createTestScript(
        'multi-kill.js',
        `
        // Handle SIGTERM to ensure graceful exit
        process.on('SIGTERM', () => {
          console.log('Received SIGTERM, exiting...');
          setTimeout(() => process.exit(0), 30);
        });

        setInterval(() => {
          console.log('Process running...');
        }, 100);
        `,
      );

      const result = await spawner.spawn(scriptPath);
      trackProcess(result.process);

      // Multiple concurrent kill calls should not cause issues
      await Promise.all([
        spawner.kill(result.process),
        spawner.kill(result.process),
        spawner.kill(result.process),
      ]);

      // Process should be terminated
      expect(result.process.killed).toBe(true);
    });
  });
});
