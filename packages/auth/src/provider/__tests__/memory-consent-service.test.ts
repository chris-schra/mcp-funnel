import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MemoryUserConsentService,
  type MemoryUserConsentServiceOptions,
} from '../services/memory-consent-service.js';

const USER_ID = 'user-123';
const CLIENT_ID = 'client-abc';

/**
 * Helper function to create a MemoryUserConsentService instance for testing
 * @param options - Optional configuration for the consent service
 * @returns Configured MemoryUserConsentService instance
 */
function createService(options?: MemoryUserConsentServiceOptions) {
  return new MemoryUserConsentService(options);
}

describe('MemoryUserConsentService', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('stores consent per scope and merges additional approvals', async () => {
    const consentService = createService();

    await consentService.recordUserConsent(USER_ID, CLIENT_ID, ['read']);

    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read']),
    ).resolves.toBe(true);
    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['write']),
    ).resolves.toBe(false);

    await consentService.recordUserConsent(USER_ID, CLIENT_ID, ['write']);

    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read', 'write']),
    ).resolves.toBe(true);
  });

  it('expires consent after the configured TTL', async () => {
    vi.useFakeTimers();
    const consentService = createService({ defaultTtlSeconds: 60 });

    await consentService.recordUserConsent(USER_ID, CLIENT_ID, ['read']);
    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read']),
    ).resolves.toBe(true);

    vi.advanceTimersByTime(61_000);

    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read']),
    ).resolves.toBe(false);
  });

  it('honours remember flag to persist consent beyond the default TTL', async () => {
    vi.useFakeTimers();
    const consentService = createService({
      defaultTtlSeconds: 60,
      rememberedTtlSeconds: null,
    });

    await consentService.recordUserConsent(USER_ID, CLIENT_ID, ['read'], {
      remember: true,
    });

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read']),
    ).resolves.toBe(true);
  });

  it('revokes specific scopes without affecting remaining approvals', async () => {
    const consentService = createService();

    await consentService.recordUserConsent(USER_ID, CLIENT_ID, [
      'read',
      'write',
    ]);
    await consentService.revokeUserConsent(USER_ID, CLIENT_ID, ['write']);

    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['write']),
    ).resolves.toBe(false);
    await expect(
      consentService.hasUserConsented(USER_ID, CLIENT_ID, ['read']),
    ).resolves.toBe(true);
  });
});
