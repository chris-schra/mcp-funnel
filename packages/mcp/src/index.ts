// Re-export all modules from the new modular architecture
export * from './proxy/mcp-proxy.js';
export * from './proxy/transports.js';
export * from './proxy/types.js';
export * from './proxy/logging.js';

// Re-export config loader utilities
export {
  getUserDir,
  getUserBasePath,
  getDefaultProjectConfigPath,
  resolveMergedProxyConfig,
  type ConfigPaths,
  type MergedProxyConfigResult,
} from './config-loader.js';

// Default export for backward compatibility
export { MCPProxy } from './proxy/mcp-proxy.js';
