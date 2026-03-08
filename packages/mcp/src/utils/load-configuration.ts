import { existsSync } from 'fs';
import { resolve } from 'path';
import { getUserBasePath, resolveMergedProxyConfig } from '../index.js';
import type { ProxyConfig } from '@mcp-funnel/schemas';

/**
 * Result of loading and merging proxy configuration.
 */
export interface LoadedConfiguration {
  config: ProxyConfig;
  actualConfigPath: string;
}

/**
 * Resolves a config path argument to an absolute path and checks that
 * at least one configuration source (project or user) exists.
 *
 * @param configPathArg - Relative or absolute path to the project config file
 * @returns The resolved absolute path
 * @throws If no configuration file is found at either location
 */
export function resolveConfigPath(configPathArg: string): string {
  return resolve(process.cwd(), configPathArg);
}

/**
 * Checks whether a configuration exists at the resolved project path
 * or at the user base path.
 *
 * @returns Object with existence flags and paths
 */
export function checkConfigExists(resolvedPath: string): {
  projectExists: boolean;
  userBaseExists: boolean;
  userBasePath: string;
} {
  const userBasePath = getUserBasePath();
  return {
    projectExists: existsSync(resolvedPath),
    userBaseExists: existsSync(userBasePath),
    userBasePath,
  };
}

/**
 * Loads and merges proxy configuration from project and user paths.
 *
 * @param resolvedPath - Absolute path to the project configuration file
 * @returns Loaded configuration and actual config path
 * @throws If the configuration cannot be loaded or parsed
 */
export function loadConfiguration(resolvedPath: string): LoadedConfiguration {
  const merged = resolveMergedProxyConfig(resolvedPath);
  return {
    config: merged.config,
    actualConfigPath: merged.paths.projectConfigPath,
  };
}
