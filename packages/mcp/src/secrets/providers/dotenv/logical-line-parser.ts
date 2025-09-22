import type { LogicalLineParseResult } from './types.js';
import { processValue } from './value-parser.js';

export function parseLogicalLine(line: string): LogicalLineParseResult | null {
  let trimmedLine = line.trim();

  if (!trimmedLine || trimmedLine.startsWith('#')) {
    return null;
  }

  if (trimmedLine.startsWith('export ')) {
    trimmedLine = trimmedLine.substring(7).trim();
  }

  const equalsIndex = trimmedLine.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }

  const key = trimmedLine.substring(0, equalsIndex).trim();
  const rawValue = trimmedLine.substring(equalsIndex + 1);

  if (!key) {
    return null;
  }

  const valueStartsWith = rawValue.trimStart();
  if (
    valueStartsWith.startsWith('=') &&
    !valueStartsWith.startsWith('="') &&
    !valueStartsWith.startsWith("='")
  ) {
    return null;
  }

  const value = processValue(rawValue);

  return { key, value };
}
