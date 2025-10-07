/**
 * CLI argument parsing utilities for npm-lookup command.
 *
 * Handles parsing of CLI arguments for package lookup and search operations,
 * including special handling for the --limit flag with validation and bounds checking.
 * @internal
 */
import { MAX_SEARCH_RESULTS } from '../types.js';

/**
 * Parses the --limit flag from CLI arguments and clamps it to valid range.
 *
 * Extracts the --limit flag and its value from the arguments array, validates it,
 * and ensures it falls within the valid range (1 to MAX_SEARCH_RESULTS).
 * Returns the parsed limit and remaining arguments with the flag removed.
 * @param args - Raw CLI arguments array
 * @returns Object containing the validated limit and remaining arguments
 * @internal
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
  const remainingArgs = [...args.slice(0, limitIndex), ...args.slice(limitIndex + 2)];

  return { limit, remainingArgs };
}

/**
 * Parses CLI arguments for npm-lookup command into structured format.
 *
 * Handles two subcommands:
 * - 'lookup \<package-name\>': Returns subcommand and packageName
 * - 'search \<query\> [--limit N]': Returns subcommand, query, and optional limit
 *
 * The --limit flag is automatically extracted, validated, and clamped to valid range.
 * @param args - CLI arguments array (e.g., ['search', 'react', '--limit', '10'])
 * @returns Parsed arguments object with subcommand and relevant parameters
 * @example
 * ```typescript
 * const result = parseCLIArgs(['lookup', 'react']);
 * // \{ subcommand: 'lookup', packageName: 'react' \}
 *
 * const result2 = parseCLIArgs(['search', 'typescript', '--limit', '5']);
 * // \{ subcommand: 'search', query: 'typescript', limit: 5 \}
 * ```
 * @public
 * @see file:../../command.ts:152 - Usage in CLI execution
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
