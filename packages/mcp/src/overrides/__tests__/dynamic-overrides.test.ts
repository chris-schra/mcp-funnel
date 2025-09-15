import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DynamicOverrideManager, MCPProxy } from '../dynamic-overrides.js';
import { OverrideManager } from '../override-manager.js';
import { ToolOverride } from '../../config.js';

// Mock the OverrideManager
vi.mock('../override-manager.js', () => ({
  OverrideManager: vi.fn().mockImplementation((overrides) => ({
    _overrides: overrides,
    applyOverrides: vi.fn((tool, _name) => tool),
    clearCache: vi.fn(),
  })),
}));

type MockMCPProxy = MCPProxy & {
  _overrideManager?: OverrideManager;
  populateToolCaches: ReturnType<typeof vi.fn>;
  _server: {
    sendToolListChanged: ReturnType<typeof vi.fn>;
  };
};

describe('DynamicOverrideManager', () => {
  let mockProxy: MockMCPProxy;
  let dynamicManager: DynamicOverrideManager;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProxy = {
      _overrideManager: undefined,
      populateToolCaches: vi.fn().mockResolvedValue(undefined),
      _server: {
        sendToolListChanged: vi.fn(),
      },
    } as MockMCPProxy;

    dynamicManager = new DynamicOverrideManager(mockProxy);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('updateOverrides', () => {
    it('should preserve existing state when adding new overrides', async () => {
      // First, set some initial overrides
      const initialOverrides: Record<string, ToolOverride> = {
        server1__tool1: {
          description: 'Initial tool 1',
          annotations: { category: 'initial' },
        },
        server1__tool2: {
          description: 'Initial tool 2',
        },
      };

      await dynamicManager.updateOverrides(initialOverrides);

      // Verify the override manager was created with initial overrides
      expect(OverrideManager).toHaveBeenCalledWith(initialOverrides);
      expect(mockProxy._overrideManager).toBeDefined();
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(1);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(1);

      // Now add new overrides
      const newOverrides: Record<string, ToolOverride> = {
        server2__tool1: {
          description: 'New tool 1',
          annotations: { category: 'new' },
        },
        server1__tool1: {
          description: 'Updated tool 1', // This should override the existing one
          annotations: { category: 'updated' },
        },
      };

      await dynamicManager.updateOverrides(newOverrides);

      // Verify that overrides were merged (newer call should have merged overrides)
      expect(OverrideManager).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(OverrideManager).mock.calls[1];
      expect(secondCall[0]).toEqual({
        server1__tool1: {
          description: 'Updated tool 1',
          annotations: { category: 'updated' },
        }, // Updated value
        server1__tool2: { description: 'Initial tool 2' }, // Existing tool2 should be preserved
        server2__tool1: {
          description: 'New tool 1',
          annotations: { category: 'new' },
        }, // New override
      });

      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(2);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(2);
    });

    it('should create new override manager when none exists', async () => {
      const overrides: Record<string, ToolOverride> = {
        test__tool: {
          description: 'Test description',
        },
      };

      await dynamicManager.updateOverrides(overrides);

      expect(OverrideManager).toHaveBeenCalledWith(overrides);
      expect(mockProxy._overrideManager).toBeDefined();
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(1);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(1);
    });
  });

  describe('setOverride', () => {
    it('should add/update single override', async () => {
      const toolName = 'github__create_issue';
      const override: ToolOverride = {
        description: 'Create a GitHub issue',
        annotations: { category: 'github' },
      };

      await dynamicManager.setOverride(toolName, override);

      expect(OverrideManager).toHaveBeenCalledWith({
        [toolName]: override,
      });
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(1);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(1);
    });

    it('should update existing override', async () => {
      // First set an override
      await dynamicManager.setOverride('test__tool', {
        description: 'Original description',
      });

      // Then update it
      const updatedOverride: ToolOverride = {
        description: 'Updated description',
        annotations: { category: 'updated' },
      };

      await dynamicManager.setOverride('test__tool', updatedOverride);

      expect(OverrideManager).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(OverrideManager).mock.calls[1];
      expect(secondCall[0]).toEqual({
        test__tool: updatedOverride,
      });
    });
  });

  describe('removeOverride', () => {
    it('should remove specific override', async () => {
      // First, set up some overrides
      const initialOverrides = {
        server__tool1: { description: 'Tool 1' },
        server__tool2: { description: 'Tool 2' },
        server__tool3: { description: 'Tool 3' },
      };

      await dynamicManager.updateOverrides(initialOverrides);

      // Now remove one override
      await dynamicManager.removeOverride('server__tool2');

      expect(OverrideManager).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(OverrideManager).mock.calls[1];
      expect(secondCall[0]).toEqual({
        server__tool1: { description: 'Tool 1' },
        server__tool3: { description: 'Tool 3' },
      });
      expect(secondCall[0]).not.toHaveProperty('server__tool2');

      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(2);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(2);
    });

    it('should do nothing when no override manager exists', async () => {
      await dynamicManager.removeOverride('nonexistent__tool');

      expect(OverrideManager).not.toHaveBeenCalled();
      expect(mockProxy.populateToolCaches).not.toHaveBeenCalled();
      expect(mockProxy._server.sendToolListChanged).not.toHaveBeenCalled();
    });

    it('should do nothing when removing non-existent override', async () => {
      // Set up some overrides first
      await dynamicManager.updateOverrides({
        server__tool1: { description: 'Tool 1' },
      });

      // Reset the mock call counts after setup
      vi.clearAllMocks();

      // Try to remove a non-existent override - should return early and do nothing
      await dynamicManager.removeOverride('server__nonexistent');

      // Should not create a new OverrideManager since the override doesn't exist
      expect(OverrideManager).not.toHaveBeenCalled();

      // Should not refresh cache or notify since nothing changed
      expect(mockProxy.populateToolCaches).not.toHaveBeenCalled();
      expect(mockProxy._server.sendToolListChanged).not.toHaveBeenCalled();
    });
  });

  describe('getCurrentOverrides', () => {
    it('should return current state', async () => {
      // Initially should be empty
      expect(dynamicManager.getCurrentOverrides()).toEqual({});

      // Add some overrides
      const overrides = {
        server__tool1: { description: 'Tool 1' },
        server__tool2: { description: 'Tool 2' },
      };
      await dynamicManager.updateOverrides(overrides);

      // Should return the current overrides
      expect(dynamicManager.getCurrentOverrides()).toEqual(overrides);

      // Remove one override
      await dynamicManager.removeOverride('server__tool1');

      // Should return updated state
      expect(dynamicManager.getCurrentOverrides()).toEqual({
        server__tool2: { description: 'Tool 2' },
      });
    });
  });

  describe('clearAllOverrides', () => {
    it('should clear all overrides', async () => {
      // First set some overrides
      await dynamicManager.updateOverrides({
        server__tool1: { description: 'Tool 1' },
        server__tool2: { description: 'Tool 2' },
      });

      // Then clear all
      await dynamicManager.clearAllOverrides();

      expect(OverrideManager).toHaveBeenCalledTimes(2);
      const secondCall = vi.mocked(OverrideManager).mock.calls[1];
      expect(secondCall[0]).toEqual({});

      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(2);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(2);
    });
  });

  describe('cache refresh and notifications', () => {
    it('should refresh cache and send notifications on all operations', async () => {
      // Test updateOverrides
      await dynamicManager.updateOverrides({
        test__tool: { description: 'Test' },
      });
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(1);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(1);

      // Test setOverride
      await dynamicManager.setOverride('another__tool', {
        description: 'Another',
      });
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(2);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(2);

      // Test removeOverride
      await dynamicManager.removeOverride('test__tool');
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(3);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(3);

      // Test clearAllOverrides
      await dynamicManager.clearAllOverrides();
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(4);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(4);
    });

    it('should handle cache refresh errors gracefully', async () => {
      const error = new Error('Cache refresh failed');
      mockProxy.populateToolCaches.mockRejectedValueOnce(error);

      // Mock console.error to verify error logging
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        dynamicManager.updateOverrides({ test__tool: { description: 'Test' } }),
      ).rejects.toThrow(error);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DynamicOverrideManager] Failed to refresh caches:',
        error,
      );

      consoleSpy.mockRestore();
    });

    it('should handle notification errors gracefully', async () => {
      const error = new Error('Notification failed');
      mockProxy._server.sendToolListChanged.mockImplementationOnce(() => {
        throw error;
      });

      // Mock console.error to verify error logging
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await expect(
        dynamicManager.updateOverrides({ test__tool: { description: 'Test' } }),
      ).rejects.toThrow(error);

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DynamicOverrideManager] Failed to refresh caches:',
        error,
      );

      consoleSpy.mockRestore();
    });
  });

  describe('complex scenarios', () => {
    it('should handle pattern-based overrides', async () => {
      const overrides: Record<string, ToolOverride> = {
        'github__list_*': {
          annotations: { category: 'query', tags: ['read-only'] },
        },
        'github__create_*': {
          annotations: { category: 'mutation', tags: ['write'] },
        },
      };

      await dynamicManager.updateOverrides(overrides);

      expect(OverrideManager).toHaveBeenCalledWith(overrides);
      expect(mockProxy.populateToolCaches).toHaveBeenCalledTimes(1);
      expect(mockProxy._server.sendToolListChanged).toHaveBeenCalledTimes(1);
    });

    it('should handle input schema overrides', async () => {
      const override: ToolOverride = {
        description: 'Enhanced tool',
        inputSchema: {
          strategy: 'merge',
          properties: {
            newParam: {
              type: 'string',
              description: 'New parameter',
            },
          },
          propertyOverrides: {
            existingParam: {
              description: 'Updated description',
              default: 'default_value',
            },
          },
        },
      };

      await dynamicManager.setOverride('server__tool', override);

      expect(OverrideManager).toHaveBeenCalledWith({
        server__tool: override,
      });
    });

    it('should handle annotation overrides', async () => {
      const override: ToolOverride = {
        annotations: {
          category: 'utility',
          tags: ['helper', 'internal'],
          deprecated: true,
          deprecationMessage: 'Use the new version instead',
        },
      };

      await dynamicManager.setOverride('deprecated__tool', override);

      expect(OverrideManager).toHaveBeenCalledWith({
        deprecated__tool: override,
      });
    });
  });
});
