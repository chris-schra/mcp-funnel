import { describe, it, expect, beforeEach } from 'vitest';
import { TestOAuthProvider, MockTokenStorage, createTestToken } from './test-utils.js';

describe('BaseOAuthProvider - Proactive Refresh Scheduling', () => {
  let provider: TestOAuthProvider;
  let mockStorage: MockTokenStorage;

  beforeEach(() => {
    mockStorage = new MockTokenStorage();
    provider = new TestOAuthProvider(mockStorage);
  });

  it('should schedule refresh for tokens with sufficient time', async () => {
    const token = createTestToken(3600000); // 1 hour
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    await provider.testEnsureValidToken();

    expect(mockStorage.scheduleRefreshMock).toHaveBeenCalled();
    const callback = mockStorage.scheduleRefreshMock.mock.calls[0][0];
    expect(typeof callback).toBe('function');
  });

  it('should not schedule refresh for tokens expiring soon', async () => {
    const token = createTestToken(60000); // 1 minute (less than 5 minute buffer)
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    await provider.testEnsureValidToken();

    // ScheduleRefresh should NOT be called because refresh time would be in the past
    expect(mockStorage.scheduleRefreshMock).not.toHaveBeenCalled();
  });

  it('should handle refresh callback errors gracefully', async () => {
    const token = createTestToken(3600000);
    mockStorage.setToken(token);
    mockStorage.isExpiredMock.mockResolvedValue(false);

    // Mock refresh to fail
    provider.acquireTokenMock.mockRejectedValue(new Error('Refresh failed'));

    await provider.testEnsureValidToken();

    // Simulate proactive refresh callback
    await expect(mockStorage.triggerRefreshCallback()).resolves.not.toThrow();
  });
});
