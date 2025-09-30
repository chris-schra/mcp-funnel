import { ChildProcess } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Shared process tracking
export const processes: ChildProcess[] = [];

// Clean up all spawned processes
export function cleanupProcesses(): void {
  for (const proc of processes) {
    if (!proc.killed) {
      proc.kill('SIGTERM');
    }
  }
  processes.length = 0;
}

// Get test file paths
export function getTestPaths() {
  return {
    __dirname,
    rootDir: path.resolve(__dirname, '../../../../'),
    fixturesDir: path.resolve(__dirname, '../../fixtures'),
  };
}
