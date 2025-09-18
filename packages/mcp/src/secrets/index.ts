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
