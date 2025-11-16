import type { ConsoleLevel } from '../output/console-level';
import type { DebugSessionId } from '../session/debug-session-id';
import type { StreamName } from '../output/stream-name';
import type { OutputCursor } from './output-entry';

/**
 * Query parameters for retrieving buffered output from a session.
 */
export interface OutputQuery {
  /** Session identifier the query targets. */
  sessionId: DebugSessionId;

  /**
   * Cursor returned from a previous query. Results strictly newer than this
   * cursor are returned. When omitted, the query starts from the beginning.
   */
  since?: OutputCursor;

  /** Maximum number of entries to return. */
  limit?: number;

  /**
   * Restrict results to specific process streams (stdout or stderr).
   */
  streams?: StreamName[];

  /**
   * Restrict console messages by severity. Ignored for stdio entries.
   */
  levels?: ConsoleLevel[];

  /**
   * Include runtime exceptions in the response. Defaults to true.
   */
  includeExceptions?: boolean;

  /**
   * Free-text search applied to rendered output strings.
   */
  search?: string;
}
