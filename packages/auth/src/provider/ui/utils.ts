import type { ScopeInfo } from './types.js';

/**
 * Default scope descriptions for common OAuth scopes
 */
const DEFAULT_SCOPE_DESCRIPTIONS: Record<string, ScopeInfo> = {
  read: {
    scope: 'read',
    name: 'Read Access',
    description: 'View your MCP server information and configurations',
  },
  'mcp:read': {
    scope: 'mcp:read',
    name: 'MCP Read Access',
    description: 'Read data from your MCP servers and tools',
  },
  'mcp:write': {
    scope: 'mcp:write',
    name: 'MCP Write Access',
    description: 'Execute tools and make changes through your MCP servers',
  },
  'mcp:admin': {
    scope: 'mcp:admin',
    name: 'MCP Administration',
    description: 'Manage MCP server configurations and permissions',
  },
  profile: {
    scope: 'profile',
    name: 'Profile Information',
    description: 'Access your basic profile information',
  },
  email: {
    scope: 'email',
    name: 'Email Address',
    description: 'Access your email address',
  },
};

/**
 * HTML escapes a string to prevent XSS attacks
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Escapes HTML attributes (stricter than regular HTML escaping)
 */
function escapeAttribute(unsafe: string): string {
  return escapeHtml(unsafe).replace(/\s/g, '&#32;');
}

/**
 * Safely generates scope information with fallback descriptions
 */
function generateScopeInfo(scopes: string[]): ScopeInfo[] {
  return scopes.map((scope) => {
    const defaultInfo = DEFAULT_SCOPE_DESCRIPTIONS[scope];
    if (defaultInfo) {
      return defaultInfo;
    }

    // Generate fallback info for unknown scopes
    return {
      scope,
      name:
        scope.charAt(0).toUpperCase() + scope.slice(1).replace(/[_-]/g, ' '),
      description: `Access permissions for ${scope}`,
    };
  });
}

/**
 * Generates a client initial from the client name
 */
function generateClientInitial(clientName: string): string {
  const cleaned = clientName.trim();
  if (!cleaned) return '?';

  // Try to get first letter of first word
  const firstWord = cleaned.split(/\s+/)[0];
  return firstWord.charAt(0).toUpperCase();
}

export const ConsentTemplateUtils = {
  escapeHtml,
  escapeAttribute,
  generateScopeInfo,
  generateClientInitial,
};
