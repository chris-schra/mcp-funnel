import { readFileSync } from 'fs';
import { resolve, isAbsolute } from 'path';
import { BaseSecretProvider } from './base-provider.js';
import type { DotEnvProviderConfig } from './provider-configs.js';

/**
 * Secret provider that reads secrets from a .env file.
 *
 * Supports the full .env specification including:
 * - Basic KEY=VALUE pairs
 * - Comments (lines starting with #)
 * - Empty lines
 * - Quoted values (both single and double quotes)
 * - Multiline values
 * - Escape sequences (\n, \t, \\, \", \', \uXXXX)
 * - Export statements (export VAR=value)
 * - Variable interpolation ($VAR, ${VAR})
 * - Backslash line continuations
 * - Robust parsing with proper quote and comment handling
 */
export class DotEnvProvider extends BaseSecretProvider {
  private readonly filePath: string;
  private readonly encoding: BufferEncoding;

  constructor(config: DotEnvProviderConfig['config'], configFileDir?: string) {
    super('dotenv');
    this.encoding = (config.encoding as BufferEncoding) || 'utf-8';

    // Resolve path based on whether it's absolute or relative
    if (isAbsolute(config.path)) {
      this.filePath = config.path;
    } else {
      // For relative paths, resolve relative to config file location if provided,
      // otherwise relative to current working directory
      const baseDir = configFileDir || process.cwd();
      this.filePath = resolve(baseDir, config.path);
    }
  }

  protected async doResolveSecrets(): Promise<Record<string, string>> {
    try {
      const content = readFileSync(this.filePath, this.encoding);
      return this.parseEnvContent(content);
    } catch (error) {
      // Handle file not found gracefully (return empty object, don't throw)
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return {};
      }
      // Re-throw other errors as they indicate more serious issues
      throw error;
    }
  }

  /**
   * Parses .env file content into key-value pairs.
   *
   * Supports the full .env specification including:
   * - Comments (lines starting with #)
   * - Empty lines
   * - Quoted values (both single and double quotes)
   * - Multiline values
   * - Escape sequences (\n, \t, \\, \", \', \uXXXX)
   * - Export statements (export VAR=value)
   * - Variable interpolation ($VAR, ${VAR})
   * - Backslash line continuations
   * - Values with special characters
   * - Keys with equals signs in values (splits on first =)
   */
  private parseEnvContent(content: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Step 1: Preprocess lines to handle backslash continuations
    const logicalLines = this.preprocessLines(content);

    // Step 2: Parse each logical line
    for (const line of logicalLines) {
      const parsed = this.parseLogicalLine(line);
      if (parsed) {
        result[parsed.key] = parsed.value;
      }
    }

    // Step 3: Process variable interpolation
    return this.interpolateVariables(result);
  }

  /**
   * Preprocesses lines to handle backslash continuations and multiline quoted values.
   * Lines ending with \ (ignoring trailing whitespace) are joined with the next line.
   * Quoted values can span multiple lines preserving the newlines.
   */
  private preprocessLines(content: string): string[] {
    const rawLines = content.split('\n');
    const logicalLines: string[] = [];
    let currentLine = '';
    let previousWasBackslashContinuation = false;
    let multilineStartLine = -1;

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmedLine = line.trimEnd();
      const hasBackslashContinuation = trimmedLine.endsWith('\\');

      // Build the current logical line
      if (currentLine) {
        if (previousWasBackslashContinuation) {
          // Previous line had backslash, join without newline
          if (hasBackslashContinuation) {
            currentLine += trimmedLine.slice(0, -1);
          } else {
            currentLine += line;
          }
        } else {
          // Multiline quote continuation, preserve newline
          currentLine += '\n' + line;
        }
      } else {
        // Start new logical line
        multilineStartLine = i;
        if (hasBackslashContinuation) {
          currentLine = trimmedLine.slice(0, -1);
        } else {
          currentLine = line;
        }
      }

      // Check if we need to continue based on quotes and backslash
      const needsContinuation = this.needsContinuation(
        currentLine,
        hasBackslashContinuation,
      );

      // If this line started a quoted value that remains unclosed and the next
      // logical line looks like a new variable declaration, treat the current
      // line as malformed rather than continuing the quote. This prevents
      // accidentally merging subsequent variable declarations into the
      // previous value when a quote is left open.
      if (needsContinuation && !hasBackslashContinuation) {
        const nextLine = rawLines[i + 1]?.trim();
        if (
          nextLine === undefined ||
          nextLine === '' ||
          nextLine.startsWith('#') ||
          nextLine.startsWith('export ') ||
          nextLine.startsWith('=') ||
          /^[A-Z_][A-Z0-9_]*=/.test(nextLine)
        ) {
          logicalLines.push(currentLine);
          currentLine = '';
          previousWasBackslashContinuation = false;
          multilineStartLine = -1;
          continue;
        }
      }

      // Heuristic: if we've accumulated more than 10 lines for a single value,
      // it's likely a malformed entry - stop and treat each line separately
      if (needsContinuation && i - multilineStartLine > 10) {
        // This is likely malformed, emit current line and reset
        logicalLines.push(rawLines[multilineStartLine]);
        // Add remaining lines as separate entries
        for (let j = multilineStartLine + 1; j <= i; j++) {
          if (rawLines[j].trim()) {
            logicalLines.push(rawLines[j]);
          }
        }
        currentLine = '';
        previousWasBackslashContinuation = false;
        multilineStartLine = -1;
      } else if (needsContinuation) {
        previousWasBackslashContinuation = hasBackslashContinuation;
        continue;
      } else {
        // Complete line
        logicalLines.push(currentLine);
        currentLine = '';
        previousWasBackslashContinuation = false;
        multilineStartLine = -1;
      }
    }

    // Add any remaining content
    if (currentLine) {
      logicalLines.push(currentLine);
    }

    return logicalLines;
  }

  /**
   * Checks if a line needs continuation based on unclosed quotes or backslash.
   * For proper .env behavior, only allow multiline quotes with explicit indication.
   */
  private needsContinuation(
    line: string,
    hasBackslashContinuation: boolean,
  ): boolean {
    if (hasBackslashContinuation) {
      return true;
    }

    // For malformed input detection: if the line doesn't have an equals sign,
    // don't treat it as needing continuation
    const trimmedLine = line.trim();
    if (!trimmedLine.includes('=')) {
      return false;
    }

    // Check for unclosed quotes
    let inQuotes = false;
    let quoteChar = '';
    let equalsIndex = -1;
    let valueStart = -1;
    let escapeNext = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (escapeNext) {
        escapeNext = false;
        continue;
      }

      if (char === '\\' && inQuotes) {
        escapeNext = true;
        continue;
      }

      if (char === '=' && equalsIndex === -1 && !inQuotes) {
        equalsIndex = i;
        continue;
      }

      if (equalsIndex !== -1 && valueStart === -1) {
        // Find start of value (after equals, skip whitespace)
        if (char !== ' ' && char !== '\t') {
          valueStart = i;
        }
      }

      if (equalsIndex !== -1 && valueStart !== -1) {
        if (!inQuotes && (char === '"' || char === "'")) {
          inQuotes = true;
          quoteChar = char;
        } else if (inQuotes && char === quoteChar && !escapeNext) {
          inQuotes = false;
          quoteChar = '';
        }
      }
    }

    return inQuotes;
  }

  /**
   * Parses a single logical line into key-value pair.
   * Handles export statements, comments, and empty lines.
   */
  private parseLogicalLine(
    line: string,
  ): { key: string; value: string } | null {
    let trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      return null;
    }

    // Handle export statements
    if (trimmedLine.startsWith('export ')) {
      trimmedLine = trimmedLine.substring(7).trim();
    }

    // Find the first equals sign to split key and value
    const equalsIndex = trimmedLine.indexOf('=');
    if (equalsIndex === -1) {
      // Skip lines without equals signs
      return null;
    }

    const key = trimmedLine.substring(0, equalsIndex).trim();
    const rawValue = trimmedLine.substring(equalsIndex + 1);

    // Skip empty keys
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

    // Process the value based on quoting and escape sequences
    const value = this.processValue(rawValue);

    return { key, value };
  }

  /**
   * Processes a raw value handling quotes, escape sequences, and comments.
   */
  private processValue(rawValue: string): string {
    // For multiline support, we need to check quotes at the start after trimming
    // but preserve the original value for processing
    const leadingTrimmed = rawValue.trimStart();

    // Handle double-quoted values
    if (leadingTrimmed.startsWith('"')) {
      return this.parseDoubleQuotedValue(rawValue);
    }

    // Handle single-quoted values
    if (leadingTrimmed.startsWith("'")) {
      return this.parseSingleQuotedValue(rawValue);
    }

    // Handle unquoted values - remove trailing comments
    return this.parseUnquotedValue(rawValue.trim());
  }

  /**
   * Parses double-quoted values with escape sequence processing.
   */
  private parseDoubleQuotedValue(value: string): string {
    // Find the opening quote, handling leading whitespace
    const trimmed = value.trimStart();
    let result = '';
    let i = 1; // Skip opening quote
    let closed = false;

    while (i < trimmed.length) {
      const char = trimmed[i];

      if (char === '"') {
        closed = true;
        break;
      } else if (char === '\\' && i + 1 < trimmed.length) {
        // Handle escape sequences
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
          case 'u':
            // Handle Unicode escape \uXXXX
            if (i + 5 < trimmed.length) {
              const hexCode = trimmed.substring(i + 2, i + 6);
              if (/^[0-9a-fA-F]{4}$/.test(hexCode)) {
                result += String.fromCharCode(parseInt(hexCode, 16));
                i += 6; // Skip \u and 4 hex digits
                continue;
              }
            }
            // Invalid Unicode escape, treat as literal
            result += char + nextChar;
            break;
          default:
            // Unknown escape sequence, treat as literal
            result += char + nextChar;
            break;
        }
        i += 2; // Skip escape sequence
      } else {
        result += char;
        i++;
      }
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
   * Parses single-quoted values (mostly literal, only \' is escaped).
   */
  private parseSingleQuotedValue(value: string): string {
    // Find the opening quote, handling leading whitespace
    const trimmed = value.trimStart();
    let result = '';
    let i = 1; // Skip opening quote
    let closed = false;

    while (i < trimmed.length) {
      const char = trimmed[i];

      if (char === "'") {
        closed = true;
        break;
      } else if (
        char === '\\' &&
        i + 1 < trimmed.length &&
        trimmed[i + 1] === "'"
      ) {
        // Handle escaped single quote
        result += "'";
        i += 2;
      } else {
        result += char;
        i++;
      }
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
   * Parses unquoted values, removing trailing comments.
   */
  private parseUnquotedValue(value: string): string {
    // Find the first # that's not inside quotes
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < value.length; i++) {
      const char = value[i];

      if (!inQuotes && (char === '"' || char === "'")) {
        inQuotes = true;
        quoteChar = char;
      } else if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
      } else if (!inQuotes && char === '#') {
        // Found unquoted comment marker, truncate here
        return value.substring(0, i).trim();
      }
    }

    return value;
  }

  /**
   * Processes variable interpolation for all values.
   * Supports $VAR and ${VAR} syntax in double-quoted and unquoted values.
   */
  private interpolateVariables(
    variables: Record<string, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const processing = new Set<string>();

    // Process variables in dependency order to handle references
    const processVariable = (key: string): string => {
      // If we're already processing this variable, it's a circular reference
      if (processing.has(key)) {
        return '';
      }

      // If already processed, return the result
      if (Object.prototype.hasOwnProperty.call(result, key)) {
        return result[key];
      }

      processing.add(key);
      const value = variables[key] || '';

      // Replace variable references
      const interpolated = value.replace(
        /\$\{([^}]+)\}|\$([A-Za-z_][A-Za-z0-9_]*)/g,
        (match, braced, simple) => {
          const varName = braced || simple;

          // Recursively process referenced variable
          if (Object.prototype.hasOwnProperty.call(variables, varName)) {
            return processVariable(varName);
          }

          const envFallback = process.env[varName];
          if (typeof envFallback === 'string') {
            return envFallback;
          }

          // Variable not found, return empty string
          return '';
        },
      );

      processing.delete(key);
      result[key] = interpolated;
      return interpolated;
    };

    // Process all variables
    for (const key of Object.keys(variables)) {
      if (!Object.prototype.hasOwnProperty.call(result, key)) {
        processVariable(key);
      }
    }

    return result;
  }
}
