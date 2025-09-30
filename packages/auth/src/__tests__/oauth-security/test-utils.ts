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

// Create standard test configuration
export function createTestConfig(
  overrides?: Partial<OAuth2AuthCodeConfig>,
): OAuth2AuthCodeConfig {
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

// Create test storage instance
export function createTestStorage(): MemoryTokenStorage {
  return new MemoryTokenStorage();
}

// Setup mock console spy
export function setupConsoleSpy(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(console, 'info').mockImplementation(() => {});
}

// Helper to extract URL from console.info mock
export function extractAuthUrl(
  consoleSpy: ReturnType<typeof vi.spyOn>,
): string | null {
  const call = consoleSpy.mock.calls.find((c) =>
    String(c[0]).includes('Please visit the following URL'),
  );
  if (call && call[1]) {
    return String(call[1]);
  }
  return null;
}
