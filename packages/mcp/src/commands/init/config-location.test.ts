import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promises as fs } from 'fs';
import readline from 'node:readline/promises';
import { analyzeConfigs, determineTargetPath } from './config-location.js';

vi.mock('fs', () => ({
  promises: {
    access: vi.fn(),
  },
}));

describe('config-location', () => {
  const mockFs = vi.mocked(fs);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('analyzeConfigs', () => {
    it('should analyze config locations correctly', async () => {
      // Mock file existence checks
      mockFs.access
        .mockResolvedValueOnce(undefined) // repo config exists
        .mockRejectedValueOnce({ code: 'ENOENT' }); // user config doesn't exist

      const result = await analyzeConfigs();

      expect(result).toMatchObject({
        repoExists: true,
        userExists: false,
      });
      expect(result.repoPath).toContain('.mcp-funnel.json');
      expect(result.userPath).toContain('.mcp-funnel.json');
    });

    it('should handle both configs existing', async () => {
      // Mock both files existing
      mockFs.access
        .mockResolvedValueOnce(undefined) // repo config exists
        .mockResolvedValueOnce(undefined); // user config exists

      const result = await analyzeConfigs();

      expect(result).toMatchObject({
        repoExists: true,
        userExists: true,
      });
    });

    it('should handle neither config existing', async () => {
      // Mock both files not existing
      mockFs.access
        .mockRejectedValueOnce({ code: 'ENOENT' }) // repo config doesn't exist
        .mockRejectedValueOnce({ code: 'ENOENT' }); // user config doesn't exist

      const result = await analyzeConfigs();

      expect(result).toMatchObject({
        repoExists: false,
        userExists: false,
      });
    });
  });

  describe('determineTargetPath', () => {
    const mockQuestion = vi.fn().mockImplementation((_query: string) => Promise.resolve('1'));
    const mockRl = {
      question: mockQuestion,
    } as Partial<readline.Interface> as readline.Interface;

    const mockAnalysis = {
      repoPath: '/current/dir/.mcp-funnel.json',
      userPath: '/home/user/.mcp-funnel.json',
      repoExists: false,
      userExists: false,
    };

    beforeEach(() => {
      vi.clearAllMocks();
      // Mock console methods to avoid test output noise
      vi.spyOn(console, 'info').mockImplementation(() => {});
      vi.spyOn(console, 'warn').mockImplementation(() => {});
    });

    it('should prompt for location when neither config exists', async () => {
      mockQuestion.mockResolvedValue('1');

      const result = await determineTargetPath(mockAnalysis, mockRl);

      expect(result).toBe(mockAnalysis.repoPath);
      expect(mockQuestion).toHaveBeenCalledWith('Select (1-2): ');
    });

    it('should choose user path when user selects option 2', async () => {
      mockQuestion.mockResolvedValue('2');

      const result = await determineTargetPath(mockAnalysis, mockRl);

      expect(result).toBe(mockAnalysis.userPath);
    });

    it('should use existing user config when only user config exists', async () => {
      const analysis = { ...mockAnalysis, userExists: true };

      const result = await determineTargetPath(analysis, mockRl);

      expect(result).toBe(mockAnalysis.userPath);
      expect(mockQuestion).not.toHaveBeenCalled();
    });

    it('should use existing repo config when only repo config exists', async () => {
      const analysis = { ...mockAnalysis, repoExists: true };

      const result = await determineTargetPath(analysis, mockRl);

      expect(result).toBe(mockAnalysis.repoPath);
      expect(mockQuestion).not.toHaveBeenCalled();
    });

    it('should prioritize repo config when both exist', async () => {
      const analysis = {
        ...mockAnalysis,
        repoExists: true,
        userExists: true,
      };

      const result = await determineTargetPath(analysis, mockRl);

      expect(result).toBe(mockAnalysis.repoPath);
      expect(console.warn).toHaveBeenCalledWith(
        expect.stringContaining('Found configs in both locations'),
      );
      expect(mockQuestion).not.toHaveBeenCalled();
    });
  });
});
