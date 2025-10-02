import type { StreamName } from './stream-name';

/**
 * Buffered chunk from a standard I/O stream with metadata for paging.
 */
export interface StdioEntry {
  stream: StreamName;
  text: string;
  timestamp: number;
  offset: number;
}
