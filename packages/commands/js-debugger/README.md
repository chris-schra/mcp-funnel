# @mcp-funnel/command-js-debugger

Debugger command package for MCP Funnel. This implementation focuses on a lean Node.js debugging experience with clear seams for future adapters.

## Status

- `src/index.ts` exposes the MCP tools for starting sessions, issuing debugger commands, inspecting scopes, and querying buffered output.
- `src/debugger` contains the Node session runtime (process spawning, CDP bridge, output buffering, breakpoint management).
- `src/types` documents the command payloads, session descriptors, and CDP projections used throughout the tool.

## Architecture Snapshot

- `src/debugger/output-buffer.ts` – cursor-based buffering for stdout, stderr, console, and exceptions.
- `src/debugger/session.ts` – full lifecycle for a Node.js debug session (launch, CDP wiring, breakpoint handling, scope inspection).
- `src/debugger/session-manager.ts` – lightweight registry for active sessions.
- `src/index.ts` – MCP command facade with input validation and schema definitions.
- `src/types/common|cdp|commands|output|session` – strongly typed contracts with JSDoc for future reference.

## Available MCP Tools

| Tool method             | Input schema          | Notes |
|-------------------------|-----------------------|-------|
| `startDebugSession`     | `DebugSessionConfig`  | Spawns `node --inspect-brk=0`, attaches over CDP, registers optional breakpoints, returns descriptor + initial pause info. |
| `debuggerCommand`       | `DebuggerCommand`     | Executes `continue`, `pause`, `step*`, or `continueToLocation`, with inline breakpoint mutations. |
| `getScopeVariables`     | `ScopeQuery`          | Expands scoped variables using bounded depth/size. |
| `queryOutput`           | `OutputQuery`         | Pages through buffered stdio/console/exception output with cursor + filters. |

## Launch Strategy

1. Generate a session identifier (UUID when not provided).
2. Spawn Node with `--inspect-brk=0` (+ `--import tsx` when `useTsx` is true).
3. Parse the "Debugger listening" banner, connect via WebSocket, and enable `Runtime`, `Debugger`, and `Log` domains.
4. Wait for the initial pause, apply any requested breakpoints, and optionally resume.

## Output Buffering

- Each stdio/console/exception event increments a cursor and is stored in `OutputBuffer` (default cap: 2000 entries).
- `queryOutput` supports `since`, `limit`, stream/level filters, case-insensitive search, and optional exception suppression.

## Scope Inspection

- `getScopeVariables` requires `sessionId`, `callFrameId`, and `scopeNumber`.
- Optional `path`, `depth`, and `maxProperties` keep traversal predictable. `path`
  entries accept either `{ property: "name" }` / `{ index: 0 }` objects or the
  shorthand string form (`"name"`).
- Large payloads are trimmed to top-level summaries once they exceed the
  configured size guard. When the result is marked `truncated`, issue narrower
  follow-up queries to inspect nested values. Guidance is also returned in the
  `messages` array so callers do not need to scrape console output.
- Remote values are returned as `RemoteObjectSummary` with rendered text and preserved `objectId` handles for follow-up expansion.

## Next Steps

1. Add automated tests that exercise the session lifecycle against sample scripts.
2. Consider a browser adapter (via Puppeteer) behind the same abstractions.
3. Layer in session cleanup tooling and cancellation support.
4. Explore richer formatting for complex console arguments or scope previews.

This README is designed to help future developers or AI agents rehydrate context quickly—start by reviewing the type contracts in `src/types`, then follow the flow in `src/debugger/session.ts` and `src/index.ts`.
