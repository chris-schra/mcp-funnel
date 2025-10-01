# Debugger Tool Follow-up Plan

## Current Context
- The new `js-debugger` command (packages/commands/js-debugger/src/index.ts) plus runtime (`src/debugger/*.ts`) is active and exposed through the MCP server (`js-debugger_*` tools).
- Successful manual run: starting a session on `quicktest.ts` proved the debugger can attach, resume, and pause on the explicit `debugger;` statement. Scope inspection (`myCoolVariable`) and output buffering both work.
- Pain point: user-defined breakpoints (e.g., line 4 in `quicktest.ts`) never resolve because `tsx` emits a single-line generated script; CDP only knows the compiled location (`scriptId: "200"`, minified code) plus an inline source map.
- DevTools’ protocol trace (`ProtocolMonitor-20251001T221050.json`) confirms Node + Chrome receive `Debugger.scriptParsed` before user code runs, with inline `sourceMapURL` and `scriptId` values.

## Immediate Goal
Map user breakpoints (TypeScript line/column) to the generated coordinates before resuming, so V8 stops at the correct location just like Chrome/WebStorm.

## Proposed Approach
1. **Track script metadata**
   - On `Debugger.scriptParsed`, normalize file URLs (accept both `file:///…` and plain paths) and store: `scriptId`, `url`, inline `sourceMapURL` (if any).

2. **Parse inline source maps**
   - Detect the `data:application/json;base64,...` case (tsx default).
   - Decode + parse to obtain mappings from generated columns back to original TS positions.

3. **Resolve pending breakpoints**
   - Keep a queue of breakpoint specs submitted before the script loads.
   - When a matching `scriptParsed` arrives:
     - Translate the user’s `lineNumber` / `columnNumber` with the sourcemap.
     - Call `Debugger.setBreakpoint` using the scriptId + generated coordinates.
     - Update our internal records / `resolvedLocations`.

4. **Retry logic**
   - If sourcemap parsing fails (or no map), fall back to the raw line mapping (today’s behavior) but log a warning.
   - Ensure we only resume the runtime after all breakpoints for that script have been dispatched (or explicitly skipped).

## Validation Steps
- Fresh session on `packages/commands/js-debugger/src/quicktest.ts` with a breakpoint on line 4 should pause *before* the `console.log` rather than defaulting to the `debugger;` statement.
- `js-debugger_getScopeVariables` should return the same values when paused on the breakpoint.
- Confirm output listing shows the breakpoint as resolved (`resolvedLocations` non-empty) and reporting the scriptId sourced from `Debugger.setBreakpoint` rather than `setBreakpointByUrl`.
- Inspect server logs for a single `Debugger.setBreakpoint` dispatch matching the generated column derived from the sourcemap; unexpected fallbacks will emit a warning so they can be triaged.

## Supporting Notes
- The protocol dump shows `Debugger.getScriptSource` retrieving the compiled source alongside the sourcemap; we can use a similar call if we need to fetch maps lazily.
- Node emits `Debugger.scriptParsed` events for numerous internal modules before user code; watch for the first event whose URL matches the user entry point.
- Existing session code already stores a `scriptUrls` map; extend it to map both directions and trigger breakpoint reconciliation.

Keeping this plan in place ensures the next restart picks up exactly where we left off.
