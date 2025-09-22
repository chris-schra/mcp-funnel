// Re-export all modules from the new modular architecture
export * from './proxy/mcp-proxy.js';
export * from './proxy/transports.js';
export * from './proxy/types.js';
export * from './proxy/logging.js';
export * from './proxy/env.js';

// Re-export config utilities
export {
  ProxyConfigSchema,
  SecretProviderConfigSchema,
  TargetServerSchema,
  normalizeServers,
} from './config.js';
export type { ProxyConfig, ServersRecord } from './config.js';

// Re-export config loader utilities
export {
  getUserDir,
  getUserBasePath,
  getDefaultProjectConfigPath,
  resolveMergedProxyConfig,
} from './config-loader.js';

// Default export for backward compatibility
export { MCPProxy } from './proxy/mcp-proxy.js';
