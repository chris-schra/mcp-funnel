/**
 * OAuth consent page template renderer
 * Provides secure HTML template rendering for OAuth consent flow
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConsentPageData } from './types.js';
import { ConsentTemplateUtils } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

  const {
    generateScopeInfo,
    generateClientInitial,
    escapeHtml,
    escapeAttribute,
  } = ConsentTemplateUtils;

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
    clientInitial: ConsentTemplateUtils.generateClientInitial(
      params.clientName,
    ),
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
