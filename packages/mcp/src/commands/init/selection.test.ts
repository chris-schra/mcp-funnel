import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Interface } from 'node:readline/promises';
import { selectServerConfigs } from './selection.js';
import type { AggregatedServer } from './detection.js';
import type { LocatedConfigSnapshot, ServerConfig } from '../init.js';

describe('selectServerConfigs', () => {
  let mockRl: Interface;

  beforeEach(() => {
    mockRl = {
      question: vi.fn(),
    } as unknown as Interface;
    vi.spyOn(console, 'info').mockImplementation(() => {});
  });

  it('uses single configuration directly without prompting', async () => {
    const aggregated: AggregatedServer[] = [
      {
        name: 'github',
        occurrences: [
          {
            snapshot: { label: 'Claude Code' } as LocatedConfigSnapshot,
            config: {
              command: 'npx',
              args: ['@modelcontextprotocol/server-github'],
            } as ServerConfig,
          },
        ],
      },
    ];

    const result = await selectServerConfigs(aggregated, mockRl);

    expect(result).toEqual({
      github: { command: 'npx', args: ['@modelcontextprotocol/server-github'] },
    });
    expect(mockRl.question).not.toHaveBeenCalled();
  });

  it('prompts when multiple different configurations exist', async () => {
    const config1: ServerConfig = { command: 'npx', args: ['github-v1'] };
    const config2: ServerConfig = { command: 'npx', args: ['github-v2'] };

    const aggregated: AggregatedServer[] = [
      {
        name: 'github',
        occurrences: [
          {
            snapshot: { label: 'Source 1' } as LocatedConfigSnapshot,
            config: config1,
          },
          {
            snapshot: { label: 'Source 2' } as LocatedConfigSnapshot,
            config: config2,
          },
        ],
      },
    ];

    vi.mocked(mockRl.question).mockResolvedValueOnce('1');

    const result = await selectServerConfigs(aggregated, mockRl);

    expect(mockRl.question).toHaveBeenCalledWith(
      expect.stringContaining('Select configuration for "github"'),
    );
    expect(result).toEqual({ github: config1 });
  });

  it('groups identical configurations from multiple sources', async () => {
    const config: ServerConfig = { command: 'npx', args: ['github'] };

    const aggregated: AggregatedServer[] = [
      {
        name: 'github',
        occurrences: [
          { snapshot: { label: 'Source 1' } as LocatedConfigSnapshot, config },
          { snapshot: { label: 'Source 2' } as LocatedConfigSnapshot, config },
          { snapshot: { label: 'Source 3' } as LocatedConfigSnapshot, config },
        ],
      },
    ];

    const result = await selectServerConfigs(aggregated, mockRl);

    // Should not prompt since all configs are identical
    expect(mockRl.question).not.toHaveBeenCalled();
    expect(result).toEqual({ github: config });
  });

  it('allows skipping servers when prompted', async () => {
    const config1: ServerConfig = { command: 'npx', args: ['v1'] };
    const config2: ServerConfig = { command: 'npx', args: ['v2'] };

    const aggregated: AggregatedServer[] = [
      {
        name: 'server1',
        occurrences: [
          {
            snapshot: { label: 'Source 1' } as LocatedConfigSnapshot,
            config: config1,
          },
          {
            snapshot: { label: 'Source 2' } as LocatedConfigSnapshot,
            config: config2,
          },
        ],
      },
    ];

    vi.mocked(mockRl.question).mockResolvedValueOnce('s');

    const result = await selectServerConfigs(aggregated, mockRl);

    expect(result).toEqual({});
  });

  it('handles invalid input and reprompts', async () => {
    const config1: ServerConfig = { command: 'npx', args: ['v1'] };
    const config2: ServerConfig = { command: 'npx', args: ['v2'] };

    const aggregated: AggregatedServer[] = [
      {
        name: 'server',
        occurrences: [
          {
            snapshot: { label: 'Source 1' } as LocatedConfigSnapshot,
            config: config1,
          },
          {
            snapshot: { label: 'Source 2' } as LocatedConfigSnapshot,
            config: config2,
          },
        ],
      },
    ];

    vi.mocked(mockRl.question)
      .mockResolvedValueOnce('invalid')
      .mockResolvedValueOnce('3') // Out of range
      .mockResolvedValueOnce('2'); // Valid

    const result = await selectServerConfigs(aggregated, mockRl);

    expect(mockRl.question).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ server: config2 });
  });
});
