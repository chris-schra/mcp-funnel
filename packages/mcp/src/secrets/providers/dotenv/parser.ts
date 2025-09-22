import { preprocessLines } from './line-preprocessor.js';
import { parseLogicalLine } from './logical-line-parser.js';
import { interpolateVariables } from './interpolation.js';
import type { DotEnvParserOptions, DotEnvVariables } from './types.js';

const DEFAULT_OPTIONS: DotEnvParserOptions = {
  environment: process.env,
};

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
