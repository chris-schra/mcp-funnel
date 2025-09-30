import { preprocessLines } from './line-preprocessor.js';
import { parseLogicalLine } from './logical-line-parser.js';
import { interpolateVariables } from './interpolation.js';
import type { DotEnvParserOptions, DotEnvVariables } from './types.js';

const DEFAULT_OPTIONS: DotEnvParserOptions = {
  environment: process.env,
};

/**
 * Parses .env file content into variables with interpolation.
 *
 * Main entry point for .env parsing. Orchestrates:
 * 1. Line preprocessing (multiline handling)
 * 2. Logical line parsing (key-value extraction)
 * 3. Variable interpolation (${VAR} resolution)
 * @param content - Raw .env file contents
 * @param options - Parser options (environment for interpolation fallback)
 * @returns Parsed and interpolated variables as key-value pairs
 * @internal
 */
export function parseDotEnvContent(
  content: string,
  options: DotEnvParserOptions = DEFAULT_OPTIONS,
): DotEnvVariables {
  const result: DotEnvVariables = {};

  const logicalLines = preprocessLines(content);

  for (const line of logicalLines) {
    const parsed = parseLogicalLine(line);
    if (parsed) {
      result[parsed.key] = parsed.value;
    }
  }

  return interpolateVariables(result, options);
}
