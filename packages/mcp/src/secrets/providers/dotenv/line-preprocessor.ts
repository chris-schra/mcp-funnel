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
