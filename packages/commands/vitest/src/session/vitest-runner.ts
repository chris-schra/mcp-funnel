import { createVitest, Reporter, TestModule, type Vitest } from 'vitest/node';
import type { UserConsoleLog } from 'vitest';
import { parseTestSelection } from '../util/parsers.js';
import type { VitestSessionConfig } from '../types/index.js';

/**
 * Callbacks for vitest runner
 */
export interface RunnerCallbacks {
  /**
   * Called when vitest emits a console log
   */
  onConsoleLog: (log: UserConsoleLog) => void;

  /**
   * Called when test run completes
   */
  onComplete: (testModules: readonly TestModule[]) => void;

  /**
   * Called to store vitest instance for cleanup
   */
  setVitestInstance?: (vitest: Vitest) => void;
}

/**
 * Run vitest with session configuration and callbacks
 *
 * @param sessionId - Session identifier for tracking
 * @param config - Session configuration
 * @param callbacks - Callbacks for console logs and completion
 */
export async function runVitest(
  sessionId: string,
  config: VitestSessionConfig,
  callbacks: RunnerCallbacks,
): Promise<void> {
  // Parse test selection into files and name patterns
  const parsed = parseTestSelection(config.tests);

  // Build vitest config with proper typing
  const vitestConfig: {
    watch: boolean;
    onConsoleLog: () => void;
    include?: string[];
    testNamePattern?: string;
    reporters?: Reporter[];
    root?: string;
    configFile?: string | false;
  } = {
    watch: false,
    onConsoleLog: () => {
      // Suppress vitest's default console handling - we use custom reporter
    },
  };

  // Set project root if specified
  if (config.root) {
    vitestConfig.root = config.root;
  }

  // Handle config file resolution
  if (config.configPath) {
    // configPath is a full file path - use it directly
    vitestConfig.configFile = config.configPath;
  } else if (config.root) {
    // When root is specified without configPath, disable config loading
    // This prevents auto-discovery in directories that don't have configs
    vitestConfig.configFile = false;
  }

  // Add file filters if specified
  if (parsed.files && parsed.files.length > 0) {
    vitestConfig.include = parsed.files;
  }

  // Add test name pattern if specified
  if (parsed.namePatterns && parsed.namePatterns.length > 0) {
    // Join multiple patterns with OR
    vitestConfig.testNamePattern = parsed.namePatterns.join('|');
  }

  // Add testPattern if specified (alternative to tests array)
  if (config.testPattern) {
    if (!vitestConfig.include) {
      vitestConfig.include = [config.testPattern];
    }
  }

  // Create custom reporter
  const customReporter: Reporter = {
    /**
     * Handle console logs from tests
     * @param log - Console log from vitest
     */
    onUserConsoleLog: (log: UserConsoleLog) => {
      callbacks.onConsoleLog(log);
    },

    /**
     * Handle test run completion
     * @param testModules - Completed test modules
     */
    onTestRunEnd: (testModules: readonly TestModule[]) => {
      callbacks.onComplete(testModules);
    },
  };

  // Add custom reporter
  vitestConfig.reporters = [customReporter];

  // Create vitest instance
  const vitest = await createVitest('test', vitestConfig);

  // Store instance for cleanup
  callbacks.setVitestInstance?.(vitest);

  try {
    // Start test run
    await vitest.start();
  } finally {
    // Always close vitest to cleanup worker processes
    await vitest.close();
  }
}
