/**
 * OAuth consent page template renderer.
 *
 * Provides secure HTML template rendering for OAuth consent flow with automatic
 * HTML escaping to prevent XSS attacks. This module exports three main functions
 * for rendering, validating, and creating consent page data.
 * @public
 * @see file:./types.ts - ConsentPageData and ScopeInfo types
 * @see file:./utils.ts - Template utility functions
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConsentPageData, ConsentPageValidationResult } from './types.js';
import { ConsentTemplateUtils } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Renders the OAuth consent page HTML with the provided data.
 *
 * Loads the consent.html template file and performs variable substitution with
 * HTML-escaped user data to prevent XSS attacks. All user-provided fields are
 * sanitized using context-appropriate escaping (HTML or attribute escaping).
 * @param data - Consent page data containing client, user, and OAuth flow information
 * @returns Rendered HTML string with all user inputs safely escaped and ready to serve
 * @throws \{Error\} When the consent.html template file cannot be loaded from disk
 * @example
 * ```typescript
 * const html = renderConsentPage({
 *   clientId: 'app123',
 *   clientName: 'My App',
 *   clientInitial: 'M',
 *   userEmail: 'user@example.com',
 *   scopes: [{ scope: 'read', name: 'Read Access', description: 'View data' }],
 *   redirectUri: 'https://app.example.com/callback',
 *   scopeString: 'read',
 *   actionUrl: 'https://auth.example.com/api/oauth/consent'
 * });
 * ```
 * @public
 * @see file:./types.ts:16 - ConsentPageData interface
 * @see file:./utils.ts:40 - HTML escaping utilities
 */
export function renderConsentPage(data: ConsentPageData): string {
  // Load the HTML template
  const templatePath = join(__dirname, 'consent.html');
  let template: string;

  const { generateScopeInfo, generateClientInitial, escapeHtml, escapeAttribute } =
    ConsentTemplateUtils;

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
    clientInitial: escapeHtml(data.clientInitial || generateClientInitial(data.clientName)),
    userEmail: escapeHtml(data.userEmail),
    redirectUri: escapeAttribute(data.redirectUri),
    state: data.state ? escapeAttribute(data.state) : '',
    scopeString: escapeAttribute(data.scopeString),
    codeChallenge: data.codeChallenge ? escapeAttribute(data.codeChallenge) : '',
    codeChallengeMethod: data.codeChallengeMethod ? escapeAttribute(data.codeChallengeMethod) : '',
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
 * Validates that a required field is present and not empty.
 * @param value - The field value to validate
 * @param fieldName - Name of the field for error messages
 * @returns Error message if validation fails, null otherwise
 */
function validateRequiredField(
  value: string | undefined,
  fieldName: string,
): string | null {
  if (!value?.trim()) {
    return `${fieldName} is required`;
  }
  return null;
}

/**
 * Validates that a field is a valid URL.
 * @param value - The URL string to validate
 * @param fieldName - Name of the field for error messages
 * @param allowRelative - Whether to allow relative URLs (default: false)
 * @returns Error message if validation fails, null otherwise
 */
function validateUrlField(
  value: string | undefined,
  fieldName: string,
  allowRelative = false,
): string | null {
  if (!value) {
    return null;
  }

  try {
    if (allowRelative) {
      new URL(value, 'https://example.com');
    } else {
      new URL(value);
    }
    return null;
  } catch {
    return `${fieldName} must be a valid URL`;
  }
}

/**
 * Validates all required fields in the consent page data.
 * @param data - Partial consent page data to validate
 * @returns Array of error messages for missing required fields
 */
function validateRequiredFields(data: Partial<ConsentPageData>): string[] {
  const fields = [
    { value: data.clientId, name: 'clientId' },
    { value: data.clientName, name: 'clientName' },
    { value: data.userEmail, name: 'userEmail' },
    { value: data.redirectUri, name: 'redirectUri' },
    { value: data.scopeString, name: 'scopeString' },
    { value: data.actionUrl, name: 'actionUrl' },
  ];

  return fields
    .map(({ value, name }) => validateRequiredField(value, name))
    .filter((error): error is string => error !== null);
}

/**
 * Validates URL format fields in the consent page data.
 * @param data - Partial consent page data to validate
 * @returns Array of error messages for invalid URL formats
 */
function validateUrlFields(data: Partial<ConsentPageData>): string[] {
  const errors: string[] = [];

  const redirectUriError = validateUrlField(data.redirectUri, 'redirectUri');
  if (redirectUriError) {
    errors.push(redirectUriError);
  }

  const actionUrlError = validateUrlField(data.actionUrl, 'actionUrl', true);
  if (actionUrlError) {
    errors.push(actionUrlError);
  }

  return errors;
}

/**
 * Validates consent page data to ensure all required fields are present.
 *
 * Performs comprehensive validation including presence checks for required fields
 * and URL format validation for redirectUri and actionUrl. This function is useful
 * for pre-validation before attempting to render the consent page.
 * @param data - Partial consent page data to validate (may have missing fields)
 * @returns Validation result object with valid flag and array of error messages
 * @example
 * ```typescript
 * const result = validateConsentPageData({
 *   clientId: 'app123',
 *   clientName: 'My App',
 *   userEmail: 'user@example.com',
 *   redirectUri: 'https://app.example.com/callback',
 *   scopeString: 'read',
 *   actionUrl: '/api/oauth/consent'
 * });
 *
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 * @public
 * @see file:./types.ts:16 - ConsentPageData interface
 */
export function validateConsentPageData(
  data: Partial<ConsentPageData>,
): ConsentPageValidationResult {
  const errors = [...validateRequiredFields(data), ...validateUrlFields(data)];

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Creates consent page data from OAuth authorization request parameters.
 *
 * This helper function constructs a complete ConsentPageData object from OAuth
 * authorization flow parameters. It automatically generates the clientInitial,
 * converts requestedScopes array to ScopeInfo objects with descriptions, creates
 * the scopeString, and constructs the actionUrl from the baseUrl.
 *
 * The params object shape is defined inline and includes clientId (OAuth client
 * identifier), clientName (human-readable client application name), userEmail
 * (email of user granting consent), requestedScopes (array of OAuth scope strings),
 * redirectUri (redirect URI from authorization request), state (optional state for
 * CSRF protection), codeChallenge (optional PKCE challenge), codeChallengeMethod
 * (optional PKCE method S256 or plain), and baseUrl (authorization server base URL).
 * @param params - Parameters from OAuth authorization request
 * @returns Complete consent page data ready for rendering
 * @example
 * ```typescript
 * const consentData = createConsentPageData({
 *   clientId: 'app123',
 *   clientName: 'My Application',
 *   userEmail: 'user@example.com',
 *   requestedScopes: ['read', 'mcp:write'],
 *   redirectUri: 'https://app.example.com/callback',
 *   state: 'random-state-string',
 *   codeChallenge: 'code-challenge-string',
 *   codeChallengeMethod: 'S256',
 *   baseUrl: 'https://auth.example.com'
 * });
 *
 * // consentData.actionUrl will be 'https://auth.example.com/api/oauth/consent'
 * // consentData.clientInitial will be 'M'
 * // consentData.scopes will have full descriptions
 * ```
 * @public
 * @see file:./types.ts:16 - ConsentPageData interface
 * @see file:./utils.ts:82 - generateClientInitial function
 * @see file:./utils.ts:62 - generateScopeInfo function
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
    clientInitial: ConsentTemplateUtils.generateClientInitial(params.clientName),
    userEmail: params.userEmail,
    scopes: ConsentTemplateUtils.generateScopeInfo(params.requestedScopes),
    redirectUri: params.redirectUri,
    state: params.state,
    scopeString,
    codeChallenge: params.codeChallenge,
    codeChallengeMethod: params.codeChallengeMethod,
    actionUrl: `${params.baseUrl}/api/oauth/consent`,
  };
}
