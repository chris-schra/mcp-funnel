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
 * @param unsafe - The string to escape
 * @returns The escaped string safe for HTML content
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
 * @param unsafe - The string to escape for use in HTML attributes
 * @returns The escaped string safe for HTML attribute values
 */
function escapeAttribute(unsafe: string): string {
  return escapeHtml(unsafe).replace(/\s/g, '&#32;');
}

/**
 * Safely generates scope information with fallback descriptions
 * @param scopes - Array of OAuth scope strings to convert to ScopeInfo objects
 * @returns Array of scope information with names and descriptions for UI display
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
 * @param clientName - The client application name to extract an initial from
 * @returns A single uppercase letter representing the client, or '?' if the name is empty
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
