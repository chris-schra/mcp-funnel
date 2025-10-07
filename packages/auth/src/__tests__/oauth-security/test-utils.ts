/**
 * OAuth Security Test Utilities
 *
 * CRITICAL SECURITY VALIDATION: This module provides shared utilities for
 * security test validation including CSRF protection, PKCE implementation,
 * token security, concurrent flow isolation, and state management.
 */

import { vi } from 'vitest';
import { MemoryTokenStorage } from '../../implementations/memory-token-storage.js';
import type { OAuth2AuthCodeConfig } from '@mcp-funnel/models';

// Mock fetch globally for OAuth2 token requests
export const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock logger to prevent noise in tests while keeping other exports
vi.mock('@mcp-funnel/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@mcp-funnel/core')>();
  return {
    ...actual,
    logEvent: vi.fn(),
  };
});

/**
 * Creates a standard test configuration for OAuth2 Authorization Code flow.
 *
 * @param overrides - Optional configuration overrides to merge with defaults
 * @returns Complete OAuth2AuthCodeConfig with test values
 */
export function createTestConfig(overrides?: Partial<OAuth2AuthCodeConfig>): OAuth2AuthCodeConfig {
  return {
    type: 'oauth2-code',
    clientId: 'test-client',
    clientSecret: 'test-secret',
    authorizationEndpoint: 'https://auth.example.com/authorize',
    tokenEndpoint: 'https://auth.example.com/token',
    redirectUri: 'http://localhost:3000/callback',
    scope: 'read write',
    ...overrides,
  };
}

/**
 * Creates a new MemoryTokenStorage instance for testing.
 *
 * @returns Fresh MemoryTokenStorage instance
 */
export function createTestStorage(): MemoryTokenStorage {
  return new MemoryTokenStorage();
}

/**
 * Sets up a mock spy for console.info to capture OAuth URLs.
 *
 * @returns Vitest spy for console.info that can be restored later
 */
export function setupConsoleSpy(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'info').mockImplementation(() => {});
}

/**
 * Extracts the OAuth authorization URL from console.info spy calls.
 *
 * @param consoleSpy - The console.info spy to extract URL from
 * @returns The authorization URL if found, null otherwise
 */
export function extractAuthUrl(consoleSpy: ReturnType<typeof vi.spyOn>): string | null {
  const call = consoleSpy.mock.calls.find((c) =>
    String(c[0]).includes('Please visit the following URL'),
  );
  if (call && call[1]) {
    return String(call[1]);
  }
  return null;
}
