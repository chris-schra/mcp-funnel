import { homedir } from 'os';
import { resolve } from 'path';
import { promises as fs } from 'fs';
import readline from 'node:readline/promises';

/**
 * Analysis of .mcp-funnel.json locations
 */
export interface ConfigAnalysis {
  repoPath: string;
  userPath: string;
  repoExists: boolean;
  userExists: boolean;
}

/**
 * Check if a file exists
 * @param path - The path to the file to check
 * @returns True if the file exists, false otherwise
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await fs.access(path);
    return true;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

/**
 * Analyze existing .mcp-funnel.json config locations
 * @returns Analysis of config locations including paths and existence status
 */
export async function analyzeConfigs(): Promise<ConfigAnalysis> {
  const repoPath = resolve(process.cwd(), '.mcp-funnel.json');
  const userPath = resolve(homedir(), '.mcp-funnel.json');

  return {
    repoPath,
    userPath,
    repoExists: await fileExists(repoPath),
    userExists: await fileExists(userPath),
  };
}

/**
 * Determine the target path for .mcp-funnel.json based on existing configs and user preference
 * @param analysis - The analysis of existing config locations
 * @param rl - Readline interface for user interaction
 * @returns The selected target path for the config file
 */
export async function determineTargetPath(
  analysis: ConfigAnalysis,
  rl: readline.Interface,
): Promise<string> {
  const { repoPath, userPath, repoExists, userExists } = analysis;

  // Simple rules:
  // 1. Neither exists → ask where to create
  // 2. One exists → use it
  // 3. Both exist → use repo, warn about user config

  if (!repoExists && !userExists) {
    console.info('\nWhere should .mcp-funnel.json be created?');
    console.info('  [1] Current directory (project-specific)');
    console.info('  [2] User home directory (global)');

    const answer = (await rl.question('Select (1-2): ')).trim();
    return answer === '2' ? userPath : repoPath;
  }

  if (userExists && !repoExists) {
    console.info(`\nFound existing config at: ${userPath}`);
    console.info('Servers will be added to this config.');
    return userPath;
  }

  if (repoExists && !userExists) {
    console.info(`\nFound existing config at: ${repoPath}`);
    console.info('Servers will be added to this config.');
    return repoPath;
  }

  // Both exist
  console.warn(`\n⚠️  Found configs in both locations:`);
  console.warn(`  Repo: ${repoPath}`);
  console.warn(`  User: ${userPath}`);
  console.warn(`  Using repo config. User config will be ignored.`);
  return repoPath;
}
