/**
 * Secrets module for MCP Funnel.
 *
 * This module provides the core types and interfaces for managing secrets
 * across different providers in the MCP Funnel system.
 *
 * @example
 * ```typescript
 * import { ISecretProvider, ISecretProviderRegistry } from '@mcp-funnel/mcp/secrets';
 *
 * // Implement a custom secret provider
 * class MySecretProvider implements ISecretProvider {
 *   async resolveSecrets() {
 *     return { MY_SECRET: 'value' };
 *   }
 *
 *   getName() {
 *     return 'my-provider';
 *   }
 * }
 * ```
 */

export type {
  ISecretProvider,
  ISecretProviderRegistry,
  SecretResolutionResult,
} from './types.js';

export { BaseSecretProvider } from './base-provider.js';
export { SecretManager } from './secret-manager.js';
export type { SecretManagerOptions } from './secret-manager.js';
export { SecretProviderRegistry } from './secret-provider-registry.js';
export type { ILogger, LogLevel } from './logger.js';
export {
  ConsoleLogger,
  NoOpLogger,
  defaultLogger,
  setDefaultLogger,
  createScopedLogger,
} from './logger.js';
export { ProcessEnvProvider } from './process-env-provider.js';
export { InlineProvider } from './inline-provider.js';
export { DotEnvProvider } from './providers/dotenv/index.js';
export {
  createSecretProvider,
  createSecretProviders,
  validateSecretProviderConfig,
} from './provider-factory.js';
export type { SecretProviderConfig } from './provider-configs.js';
export { resolveSecretsFromConfig } from './secret-resolver.js';
export type { ResolveSecretsOptions } from './secret-resolver.js';
