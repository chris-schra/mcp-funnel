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
 * State tracked during quote parsing.
 * @internal
 */
interface QuoteParsingState {
  inQuotes: boolean;
  quoteChar: string;
  equalsIndex: number;
  valueStart: number;
  escapeNext: boolean;
}

/**
 * Creates initial state for quote parsing.
 * @returns Initial parsing state
 * @internal
 */
function createInitialState(): QuoteParsingState {
  return {
    inQuotes: false,
    quoteChar: '',
    equalsIndex: -1,
    valueStart: -1,
    escapeNext: false,
  };
}

/**
 * Processes escape sequences in the line.
 * @param char - Current character
 * @param state - Current parsing state
 * @returns true if character was escaped (skip further processing)
 * @internal
 */
function processEscape(char: string, state: QuoteParsingState): boolean {
  if (state.escapeNext) {
    state.escapeNext = false;
    return true;
  }

  if (char === '\\' && state.inQuotes) {
    state.escapeNext = true;
    return true;
  }

  return false;
}

/**
 * Tracks the equals sign position in the line.
 * @param char - Current character
 * @param i - Current position
 * @param state - Current parsing state
 * @internal
 */
function processEqualsSign(char: string, i: number, state: QuoteParsingState): void {
  if (char === '=' && state.equalsIndex === -1 && !state.inQuotes) {
    state.equalsIndex = i;
  }
}

/**
 * Tracks where the value starts after the equals sign.
 * @param char - Current character
 * @param i - Current position
 * @param state - Current parsing state
 * @internal
 */
function trackValueStartPosition(char: string, i: number, state: QuoteParsingState): void {
  if (state.equalsIndex !== -1 && state.valueStart === -1) {
    if (char !== ' ' && char !== '\t') {
      state.valueStart = i;
    }
  }
}

/**
 * Processes quote characters and tracks quote state.
 * @param char - Current character
 * @param state - Current parsing state
 * @internal
 */
function processQuoteCharacter(char: string, state: QuoteParsingState): void {
  if (state.equalsIndex === -1 || state.valueStart === -1) {
    return;
  }

  if (!state.inQuotes && (char === '"' || char === "'")) {
    state.inQuotes = true;
    state.quoteChar = char;
  } else if (state.inQuotes && char === state.quoteChar) {
    state.inQuotes = false;
    state.quoteChar = '';
  }
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
function needsContinuation(line: string, hasBackslashContinuation: boolean): boolean {
  if (hasBackslashContinuation) {
    return true;
  }

  const trimmedLine = line.trim();
  if (!trimmedLine.includes('=')) {
    return false;
  }

  const state = createInitialState();

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (processEscape(char, state)) {
      continue;
    }

    processEqualsSign(char, i, state);
    trackValueStartPosition(char, i, state);
    processQuoteCharacter(char, state);
  }

  return state.inQuotes;
}

/**
 * Preprocesses .env file content into logical lines.
 *
 * Handles:
 * - Backslash continuations (backslash at end of line)
 * - Multiline quoted values (unclosed quotes)
 * - Heuristic-based continuation detection
 * - Fallback to single-line parsing for pathological cases (more than 10 lines)
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

    const continuationNeeded = needsContinuation(currentLine, hasBackslashContinuation);

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
