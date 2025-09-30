import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SessionManager } from './session-manager.js';
import { JsDebuggerCommand } from './command.js';

describe('Session Cleanup Mechanisms', () => {
  let sessionManager: SessionManager;
  let command: JsDebuggerCommand;

  beforeEach(() => {
    // Reset singleton before each test
    SessionManager.resetInstance();
    sessionManager = SessionManager.getInstance();
    command = new JsDebuggerCommand();
  });

  afterEach(() => {
    // Clean up after each test
    SessionManager.resetInstance();
  });

  it('should initialize with default cleanup configuration', () => {
    const config = sessionManager.getCleanupConfig?.();
    expect(config).toBeDefined();
    expect(config?.sessionTimeoutMs).toBe(30 * 60 * 1000); // 30 minutes
    expect(config?.maxConsoleOutputEntries).toBe(1000);
    expect(config?.enableAutoCleanup).toBe(true);
    expect(config?.enableHeartbeat).toBe(true);
  });

  it('should allow cleanup configuration updates', () => {
    const newConfig = {
      sessionTimeoutMs: 10 * 60 * 1000, // 10 minutes
      maxConsoleOutputEntries: 500,
      enableHeartbeat: false,
    };

    sessionManager.setCleanupConfig?.(newConfig);
    const updatedConfig = sessionManager.getCleanupConfig?.();

    expect(updatedConfig?.sessionTimeoutMs).toBe(10 * 60 * 1000);
    expect(updatedConfig?.maxConsoleOutputEntries).toBe(500);
    expect(updatedConfig?.enableHeartbeat).toBe(false);
    // Other values should remain as defaults
    expect(updatedConfig?.enableAutoCleanup).toBe(true);
  });

  it('should track session metadata correctly', () => {
    const sessions = sessionManager.listSessions();
    expect(sessions).toHaveLength(0);

    // Sessions array should show enhanced metadata structure
    expect(Array.isArray(sessions)).toBe(true);
  });

  it('should handle cleanup_sessions tool correctly', async () => {
    // Test dry run
    const dryRunResult = await command.executeToolViaMCP('cleanup_sessions', {
      dryRun: true,
    });

    expect(dryRunResult.isError).toBeFalsy();
    expect(dryRunResult.content).toHaveLength(1);

    const dryRunText = (dryRunResult.content[0]?.text ?? '{}') as string;
    const response = JSON.parse(dryRunText);
    expect(response.dryRun).toBe(true);
    expect(response.totalSessions).toBe(0);
    expect(response.sessionsToCleanup).toBe(0);
    expect(response.message).toContain('Dry run completed');
  });

  it('should handle cleanup with no sessions', async () => {
    const result = await command.executeToolViaMCP('cleanup_sessions', {
      force: false,
    });

    expect(result.isError).toBeFalsy();
    const responseText = (result.content[0]?.text ?? '{}') as string;
    const response = JSON.parse(responseText);
    expect(response.cleanedSessions).toBe(0);
    expect(response.totalSessions).toBe(0);
  });

  it('should provide manual cleanup trigger functionality', async () => {
    const result = await command.executeToolViaMCP('cleanup_sessions', {
      force: true,
    });

    expect(result.isError).toBeFalsy();
    expect(result.content).toHaveLength(1);

    const manualText = (result.content[0]?.text ?? '{}') as string;
    const response = JSON.parse(manualText);
    expect(response).toHaveProperty('totalSessions');
    expect(response).toHaveProperty('cleanedSessions');
    expect(response).toHaveProperty('cleanupConfig');
    expect(response).toHaveProperty('timestamp');
  });

  it('should handle enhanced session listing with metadata', () => {
    const sessions = sessionManager.listSessions();

    // Verify the enhanced structure matches our expectations
    sessions.forEach((session) => {
      expect(session).toHaveProperty('id');
      expect(session).toHaveProperty('platform');
      expect(session).toHaveProperty('target');
      expect(session).toHaveProperty('state');
      expect(session).toHaveProperty('startTime');
      // metadata is optional, but should have correct structure if present
      if (session.metadata) {
        expect(session.metadata).toHaveProperty('lifecycleState');
        expect(session.metadata).toHaveProperty('lastActivity');
        expect(session.metadata).toHaveProperty('resourceCount');
      }
    });
  });

  it('should handle cleanup errors gracefully', async () => {
    // Mock the cleanup method to throw an error
    const mockCleanup = vi.fn().mockRejectedValue(new Error('Cleanup failed'));
    if (sessionManager.cleanupInactiveSessions) {
      sessionManager.cleanupInactiveSessions = mockCleanup;
    }

    const result = await command.executeToolViaMCP('cleanup_sessions', {
      force: false,
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Cleanup failed');
  });
});

describe('Resource Management', () => {
  let sessionManager: SessionManager;

  beforeEach(() => {
    SessionManager.resetInstance();
    sessionManager = SessionManager.getInstance();
  });

  afterEach(() => {
    SessionManager.resetInstance();
  });

  it('should have resource tracking capabilities', () => {
    // Verify resource tracking is initialized
    const config = sessionManager.getCleanupConfig?.();
    expect(config).toBeDefined();

    // Test that cleanup mechanisms exist
    expect(typeof sessionManager.cleanupInactiveSessions).toBe('function');
    expect(typeof sessionManager.getCleanupConfig).toBe('function');
    expect(typeof sessionManager.setCleanupConfig).toBe('function');
  });
});
