/**
 * Heuristic to detect if a line looks like a variable declaration.
 *
 * Used to determine if multiline value parsing should stop. Returns true
 * if the line is empty, a comment, or starts with a pattern like KEY=.
 * @param line - Line to check
 * @returns true if line appears to be a new variable declaration
 * @internal
 */
function isLikelyVariableDeclaration(line: string | undefined): boolean {
  if (!line) {
    return false;
  }

  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }

  if (trimmed.startsWith('#') || trimmed.startsWith('export ')) {
    return true;
  }

  if (trimmed.startsWith('=')) {
    return true;
  }

  return /^[A-Z_][A-Z0-9_]*=/.test(trimmed);
}

/**
 * Determines if a line needs continuation (multiline value not yet complete).
 *
 * Returns true if there's a backslash continuation or if quotes are unclosed.
 * Handles escape sequences and tracks quote state to detect incomplete values.
 * @param line - Current line being processed
 * @param hasBackslashContinuation - Whether line ends with backslash
 * @returns true if more lines needed to complete the value
 * @internal
 */
function needsContinuation(
  line: string,
  hasBackslashContinuation: boolean,
): boolean {
  if (hasBackslashContinuation) {
    return true;
  }

  const trimmedLine = line.trim();
  if (!trimmedLine.includes('=')) {
    return false;
  }

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
 * Preprocesses .env file content into logical lines.
 *
 * Handles:
 * - Backslash continuations (\ at end of line)
 * - Multiline quoted values (unclosed quotes)
 * - Heuristic-based continuation detection
 * - Fallback to single-line parsing for pathological cases (>10 lines)
 * @param content - Raw .env file contents
 * @returns Array of logical lines ready for parsing
 * @internal
 */
export function preprocessLines(content: string): string[] {
  const rawLines = content.split('\n');
  const logicalLines: string[] = [];
  let currentLine = '';
  let previousWasBackslashContinuation = false;
  let multilineStartLine = -1;

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const trimmedLine = line.trimEnd();
    const hasBackslashContinuation = trimmedLine.endsWith('\\');

    if (currentLine) {
      if (previousWasBackslashContinuation) {
        if (hasBackslashContinuation) {
          currentLine += trimmedLine.slice(0, -1);
        } else {
          currentLine += line;
        }
      } else {
        currentLine += '\n' + line;
      }
    } else {
      multilineStartLine = i;
      if (hasBackslashContinuation) {
        currentLine = trimmedLine.slice(0, -1);
      } else {
        currentLine = line;
      }
    }

    const continuationNeeded = needsContinuation(
      currentLine,
      hasBackslashContinuation,
    );

    if (continuationNeeded && !hasBackslashContinuation) {
      const nextLine = rawLines[i + 1];
      if (isLikelyVariableDeclaration(nextLine)) {
        logicalLines.push(currentLine);
        currentLine = '';
        previousWasBackslashContinuation = false;
        multilineStartLine = -1;
        continue;
      }
    }

    if (continuationNeeded && i - multilineStartLine > 10) {
      logicalLines.push(rawLines[multilineStartLine]);
      for (let j = multilineStartLine + 1; j <= i; j++) {
        if (rawLines[j].trim()) {
          logicalLines.push(rawLines[j]);
        }
      }
      currentLine = '';
      previousWasBackslashContinuation = false;
      multilineStartLine = -1;
    } else if (continuationNeeded) {
      previousWasBackslashContinuation = hasBackslashContinuation;
      continue;
    } else {
      logicalLines.push(currentLine);
      currentLine = '';
      previousWasBackslashContinuation = false;
      multilineStartLine = -1;
    }
  }

  if (currentLine) {
    logicalLines.push(currentLine);
  }

  return logicalLines;
}
