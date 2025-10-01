import type { OutputCursor, OutputEntry } from './output-entry';

/**
 * Response payload produced by an output query.
 */
export interface OutputQueryResult {
    /** Entries matching the query. */
    entries: OutputEntry[];
    /** Cursor to supply in the next query to continue paging. */
    nextCursor: OutputCursor;
    /** True when additional entries are available beyond this page. */
    hasMore: boolean;
}
