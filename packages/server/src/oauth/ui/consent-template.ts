/**
 * OAuth consent page template renderer
 * Provides secure HTML template rendering for OAuth consent flow
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Scope information for display in consent UI
 */
export interface ScopeInfo {
  /** Scope identifier */
  scope: string;
  /** Human-readable scope name */
  name: string;
  /** Description of what this scope grants access to */
  description: string;
}

/**
 * Data required to render the OAuth consent page
 */
export interface ConsentPageData {
  /** OAuth client ID */
  clientId: string;
  /** Client application name */
  clientName: string;
  /** Client initial for icon display */
  clientInitial: string;
  /** User's email address */
  userEmail: string;
  /** Requested scopes with descriptions */
  scopes: ScopeInfo[];
  /** Redirect URI from authorization request */
  redirectUri: string;
  /** State parameter for CSRF protection */
  state?: string;
  /** Raw scope string */
  scopeString: string;
  /** PKCE code challenge */
  codeChallenge?: string;
  /** PKCE code challenge method */
  codeChallengeMethod?: string;
  /** Form action URL for consent submission */
  actionUrl: string;
}

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

/**
 * Renders the consent page HTML with the provided data
 *
 * @param data - Consent page data
 * @returns Rendered HTML string with all user inputs safely escaped
 */
export function renderConsentPage(data: ConsentPageData): string {
  // Load the HTML template
  const templatePath = join(__dirname, 'consent.html');
  let template: string;

  try {
    template = readFileSync(templatePath, 'utf-8');
  } catch (error) {
    throw new Error(
      `Failed to load consent template: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }

  // Generate scope information
  const scopeList =
    data.scopes.length > 0
      ? data.scopes
      : generateScopeInfo(data.scopeString.split(' ').filter(Boolean));

  // Escape all user-provided data
  const escaped = {
    clientId: escapeAttribute(data.clientId),
    clientName: escapeHtml(data.clientName),
    clientInitial: escapeHtml(
      data.clientInitial || generateClientInitial(data.clientName),
    ),
    userEmail: escapeHtml(data.userEmail),
    redirectUri: escapeAttribute(data.redirectUri),
    state: data.state ? escapeAttribute(data.state) : '',
    scopeString: escapeAttribute(data.scopeString),
    codeChallenge: data.codeChallenge
      ? escapeAttribute(data.codeChallenge)
      : '',
    codeChallengeMethod: data.codeChallengeMethod
      ? escapeAttribute(data.codeChallengeMethod)
      : '',
    actionUrl: escapeAttribute(data.actionUrl),
  };

  // Generate scopes HTML
  const scopesHtml = scopeList
    .map((scope) => {
      const escapedScope = {
        name: escapeHtml(scope.name),
        description: escapeHtml(scope.description),
      };

      return `
                    <div class="permission-item" role="listitem">
                        <div class="permission-icon" aria-hidden="true">✓</div>
                        <div class="permission-details">
                            <h3>${escapedScope.name}</h3>
                            <p>${escapedScope.description}</p>
                        </div>
                    </div>`;
    })
    .join('');

  // Replace template placeholders with escaped data
  return template
    .replace(/\{\{clientId\}\}/g, escaped.clientId)
    .replace(/\{\{clientName\}\}/g, escaped.clientName)
    .replace(/\{\{clientInitial\}\}/g, escaped.clientInitial)
    .replace(/\{\{userEmail\}\}/g, escaped.userEmail)
    .replace(/\{\{redirectUri\}\}/g, escaped.redirectUri)
    .replace(/\{\{state\}\}/g, escaped.state)
    .replace(/\{\{scopeString\}\}/g, escaped.scopeString)
    .replace(/\{\{codeChallenge\}\}/g, escaped.codeChallenge)
    .replace(/\{\{codeChallengeMethod\}\}/g, escaped.codeChallengeMethod)
    .replace(/\{\{actionUrl\}\}/g, escaped.actionUrl)
    .replace(/\{\{#each scopes\}\}[\s\S]*?\{\{\/each\}\}/g, scopesHtml);
}

/**
 * Validates consent page data to ensure all required fields are present
 *
 * @param data - Data to validate
 * @returns Validation result with any error messages
 */
export function validateConsentPageData(data: Partial<ConsentPageData>): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!data.clientId?.trim()) {
    errors.push('clientId is required');
  }

  if (!data.clientName?.trim()) {
    errors.push('clientName is required');
  }

  if (!data.userEmail?.trim()) {
    errors.push('userEmail is required');
  }

  if (!data.redirectUri?.trim()) {
    errors.push('redirectUri is required');
  }

  if (!data.scopeString?.trim()) {
    errors.push('scopeString is required');
  }

  if (!data.actionUrl?.trim()) {
    errors.push('actionUrl is required');
  }

  // Validate URL formats
  if (data.redirectUri) {
    try {
      new URL(data.redirectUri);
    } catch {
      errors.push('redirectUri must be a valid URL');
    }
  }

  if (data.actionUrl) {
    try {
      new URL(data.actionUrl, 'https://example.com'); // Allow relative URLs
    } catch {
      errors.push('actionUrl must be a valid URL');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates consent page data from authorization request parameters
 * This is a helper function to construct ConsentPageData from OAuth flow data
 *
 * @param params - Parameters from OAuth authorization request
 * @returns Formatted consent page data
 */
export function createConsentPageData(params: {
  clientId: string;
  clientName: string;
  userEmail: string;
  requestedScopes: string[];
  redirectUri: string;
  state?: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  baseUrl: string;
}): ConsentPageData {
  const scopeString = params.requestedScopes.join(' ');

  return {
    clientId: params.clientId,
    clientName: params.clientName,
    clientInitial: generateClientInitial(params.clientName),
    userEmail: params.userEmail,
    scopes: generateScopeInfo(params.requestedScopes),
    redirectUri: params.redirectUri,
    state: params.state,
    scopeString,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    actionUrl: `${params.baseUrl}/api/oauth/consent`,
  };
}

/**
 * Default export for easier importing
 */
export default {
  renderConsentPage,
  validateConsentPageData,
  createConsentPageData,
  generateScopeInfo,
  DEFAULT_SCOPE_DESCRIPTIONS,
};
