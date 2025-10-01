/**
 * Location descriptor used to place or resolve a breakpoint.
 *
 * Callers should provide either a `scriptId` obtained from CDP events or a
 * `url` pointing to the source file. The pair of `lineNumber` and
 * `columnNumber` follows CDP's zero-based convention.
 */
export interface BreakpointLocation {
    /**
     * Unique script identifier known to the debugger.
     *
     * Either `scriptId` or `url` must be supplied.
     */
    scriptId?: string;
    /** Resolved URL or absolute path pointing to the script resource. */
    url?: string;
    /** Zero-based line number. */
    lineNumber: number;
    /** Optional zero-based column to disambiguate multiple statements. */
    columnNumber?: number;
}
