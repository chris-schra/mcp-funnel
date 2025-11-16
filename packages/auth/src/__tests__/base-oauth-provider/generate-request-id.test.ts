import { describe, it, expect, beforeEach } from 'vitest';
import { TestOAuthProvider, MockTokenStorage } from './test-utils.js';

describe('BaseOAuthProvider - generateRequestId', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should generate unique request IDs', () => {
    const id1 = provider.testGenerateRequestId();
    const id2 = provider.testGenerateRequestId();

    expect(id1).not.toBe(id2);
    expect(typeof id1).toBe('string');
    expect(typeof id2).toBe('string');
    expect(id1.length).toBeGreaterThan(0);
    expect(id2.length).toBeGreaterThan(0);
  });

  it('should generate correct format', () => {
    const id = provider.testGenerateRequestId();

    const uuidRegex = /^\d{13}_[a-f0-9]{8}$/i;
    expect(id).toMatch(uuidRegex);
  });
});
