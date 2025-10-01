import type {
  ConsoleEntry,
  ExceptionEntry,
  OutputBufferSnapshot,
  OutputCursor,
  OutputEntry,
  OutputQuery,
  OutputQueryResult,
  StdioEntry,
} from '../types/index.js';

const DEFAULT_MAX_ENTRIES = 2000;

/**
 * Maintains buffered output for a debugger session with cursor-based pagination.
 */
export class OutputBuffer {
  private entries: OutputEntry[] = [];
  private cursor: OutputCursor = 0;
  private readonly maxEntries: number;

  public constructor(maxEntries: number = DEFAULT_MAX_ENTRIES) {
    this.maxEntries = maxEntries;
  }

  public addStdio(entry: StdioEntry): void {
    this.pushEntry({ kind: 'stdio', cursor: this.nextCursor(), entry });
  }

  public addConsole(entry: ConsoleEntry): void {
    this.pushEntry({ kind: 'console', cursor: this.nextCursor(), entry });
  }

  public addException(entry: ExceptionEntry): void {
    this.pushEntry({ kind: 'exception', cursor: this.nextCursor(), entry });
  }

  public snapshot(): OutputBufferSnapshot {
    return {
      stdio: this.entries
        .filter(
          (entry): entry is Extract<OutputEntry, { kind: 'stdio' }> =>
            entry.kind === 'stdio',
        )
        .map((entry) => entry.entry),
      console: this.entries
        .filter(
          (entry): entry is Extract<OutputEntry, { kind: 'console' }> =>
            entry.kind === 'console',
        )
        .map((entry) => entry.entry),
      exceptions: this.entries
        .filter(
          (entry): entry is Extract<OutputEntry, { kind: 'exception' }> =>
            entry.kind === 'exception',
        )
        .map((entry) => entry.entry),
    };
  }

  public query(query: OutputQuery): OutputQueryResult {
    const since = query.since ?? 0;
    const limit = query.limit ?? 100;
    const streams = query.streams ? new Set(query.streams) : undefined;
    const levels = query.levels ? new Set(query.levels) : undefined;
    const includeExceptions = query.includeExceptions !== false;
    const search = query.search?.toLowerCase();

    const results: OutputEntry[] = [];
    let lastCursor = since;

    for (const entry of this.entries) {
      if (entry.cursor <= since) {
        continue;
      }

      if (
        !this.matchesFilters(entry, streams, levels, includeExceptions, search)
      ) {
        continue;
      }

      results.push(entry);
      lastCursor = entry.cursor;
      if (results.length >= limit) {
        break;
      }
    }

    const hasMore = this.entries.some(
      (entry) =>
        entry.cursor > lastCursor &&
        this.matchesFilters(entry, streams, levels, includeExceptions, search),
    );

    return {
      entries: results,
      nextCursor:
        results.length > 0 ? results[results.length - 1].cursor : since,
      hasMore,
    };
  }

  public getLastCursor(): OutputCursor {
    return this.cursor;
  }

  private nextCursor(): OutputCursor {
    this.cursor += 1;
    return this.cursor;
  }

  private pushEntry(entry: OutputEntry): void {
    this.entries.push(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.shift();
    }
  }

  private matchesFilters(
    entry: OutputEntry,
    streams: Set<string> | undefined,
    levels: Set<string> | undefined,
    includeExceptions: boolean,
    search: string | undefined,
  ): boolean {
    if (entry.kind === 'exception' && !includeExceptions) {
      return false;
    }

    if (entry.kind === 'stdio' && streams && !streams.has(entry.entry.stream)) {
      return false;
    }

    if (entry.kind === 'console' && levels && !levels.has(entry.entry.level)) {
      return false;
    }

    if (!search) {
      return true;
    }

    switch (entry.kind) {
      case 'stdio':
        return entry.entry.text.toLowerCase().includes(search);
      case 'console':
        if (entry.entry.text.toLowerCase().includes(search)) {
          return true;
        }
        return entry.entry.arguments.some((arg) =>
          arg.text.toLowerCase().includes(search),
        );
      case 'exception':
        return entry.entry.text.toLowerCase().includes(search);
      default:
        return true;
    }
  }
}
