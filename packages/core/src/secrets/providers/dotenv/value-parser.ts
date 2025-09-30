/**
 * Processes a dotenv value by detecting and parsing quotes or returning trimmed unquoted value.
 *
 * Routes to the appropriate parser based on the leading quote character (double, single, or none).
 * @param rawValue - The raw value string from dotenv file
 * @returns Processed value with quotes removed and escape sequences handled
 * @public
 */
export function processValue(rawValue: string): string {
  const leadingTrimmed = rawValue.trimStart();

  if (leadingTrimmed.startsWith('"')) {
    return parseDoubleQuotedValue(rawValue);
  }

  if (leadingTrimmed.startsWith("'")) {
    return parseSingleQuotedValue(rawValue);
  }

  return parseUnquotedValue(rawValue.trim());
}

/**
 * Parses a double-quoted dotenv value with escape sequence processing.
 *
 * Handles standard escape sequences (newline, tab, carriage return, backslash, quotes) and Unicode escapes.
 * If the closing quote is missing, truncates at first newline and returns with leading quote.
 * @param value - Value string starting with double quote
 * @returns Parsed value with escape sequences resolved and quotes removed
 * @public
 */
export function parseDoubleQuotedValue(value: string): string {
  const trimmed = value.trimStart();
  let result = '';
  let i = 1;
  let closed = false;

  while (i < trimmed.length) {
    const char = trimmed[i];

    if (char === '"') {
      closed = true;
      break;
    }

    if (char === '\\' && i + 1 < trimmed.length) {
      const nextChar = trimmed[i + 1];
      switch (nextChar) {
        case 'n':
          result += '\n';
          break;
        case 't':
          result += '\t';
          break;
        case 'r':
          result += '\r';
          break;
        case '\\':
          result += '\\';
          break;
        case '"':
          result += '"';
          break;
        case "'":
          result += "'";
          break;
        case 'u': {
          if (i + 5 < trimmed.length) {
            const hexCode = trimmed.substring(i + 2, i + 6);
            if (/^[0-9a-fA-F]{4}$/.test(hexCode)) {
              result += String.fromCharCode(parseInt(hexCode, 16));
              i += 6;
              continue;
            }
          }
          result += char + nextChar;
          break;
        }
        default:
          result += char + nextChar;
          break;
      }
      i += 2;
      continue;
    }

    result += char;
    i++;
  }

  if (!closed) {
    const newlineIndex = result.indexOf('\n');
    const truncated =
      newlineIndex !== -1 ? result.slice(0, newlineIndex) : result;
    return `"${truncated}`;
  }

  return result;
}

/**
 * Parses a single-quoted dotenv value with minimal escape processing.
 *
 * Only handles escaped single quotes (\'), treating all other characters literally.
 * If the closing quote is missing, truncates at first newline and returns with leading quote.
 * @param value - Value string starting with single quote
 * @returns Parsed value with escaped quotes resolved and quotes removed
 * @public
 */
export function parseSingleQuotedValue(value: string): string {
  const trimmed = value.trimStart();
  let result = '';
  let i = 1;
  let closed = false;

  while (i < trimmed.length) {
    const char = trimmed[i];

    if (char === "'") {
      closed = true;
      break;
    }

    if (char === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === "'") {
      result += "'";
      i += 2;
      continue;
    }

    result += char;
    i++;
  }

  if (!closed) {
    const newlineIndex = result.indexOf('\n');
    const truncated =
      newlineIndex !== -1 ? result.slice(0, newlineIndex) : result;
    return `'${truncated}`;
  }

  return result;
}

/**
 * Parses an unquoted dotenv value by trimming and handling inline comments.
 *
 * Truncates at the first unquoted # character to remove inline comments,
 * while preserving # characters inside quoted sections.
 * @param value - Unquoted value string
 * @returns Trimmed value with inline comments removed
 * @public
 */
export function parseUnquotedValue(value: string): string {
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < value.length; i++) {
    const char = value[i];

    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
      continue;
    }

    if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = '';
      continue;
    }

    if (!inQuotes && char === '#') {
      return value.substring(0, i).trim();
    }
  }

  return value;
}
