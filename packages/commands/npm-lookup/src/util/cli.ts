/**
 * CLI argument parsing utilities
 */
import { MAX_SEARCH_RESULTS } from '../types.js';

/**
 * Parse limit flag from CLI arguments
 */
function parseLimitFlag(args: string[]): {
  limit: number | undefined;
  remainingArgs: string[];
} {
  const limitIndex = args.indexOf('--limit');
  if (limitIndex === -1 || limitIndex >= args.length - 1) {
    return { limit: undefined, remainingArgs: args };
  }

  const limitValue = parseInt(args[limitIndex + 1], 10);
  if (isNaN(limitValue)) {
    return { limit: undefined, remainingArgs: args };
  }

  const limit = Math.min(Math.max(1, limitValue), MAX_SEARCH_RESULTS);
  const remainingArgs = [
    ...args.slice(0, limitIndex),
    ...args.slice(limitIndex + 2),
  ];

  return { limit, remainingArgs };
}

/**
 * Parse CLI arguments for npm command
 */
export function parseCLIArgs(args: string[]): {
  subcommand: string | undefined;
  packageName?: string;
  query?: string;
  limit?: number;
} {
  if (args.length === 0) {
    return { subcommand: undefined };
  }

  const [subcommand, ...rest] = args;

  if (subcommand === 'lookup') {
    return {
      subcommand: 'lookup',
      packageName: rest[0],
    };
  }

  if (subcommand === 'search') {
    const { limit, remainingArgs } = parseLimitFlag(rest);
    const query = remainingArgs.join(' ');
    return {
      subcommand: 'search',
      query,
      limit,
    };
  }

  return { subcommand };
}
