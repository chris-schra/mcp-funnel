# MCP Proxy Port – Working Notes

_Last updated: after secret-provider coverage + transport integration suites._

## Snapshot Summary
- `packages/mcp/src/proxy/mcp-proxy.ts` mirrors feature branch commit `10c2269` while adhering to the modular seams:
  - Constructor `(config, configPath)` maintained; env resolution uses `resolveServerEnvironment` only when secret providers are present (new unit coverage verifies inline/default providers), otherwise falls back to the legacy merge for performance.
  - Legacy `.logs` output and TransportFactory shim removed; proxy now relies entirely on shared logging and transport factory exports.
  - Manual reconnect returns the in-flight promise to preserve async rejection timing consumed by the tests/event listeners.
- Server connection event payloads are exported via `packages/mcp/src/types`, and the tool registry still exposes `removeServerTools` for older callers.
- New unit test `packages/mcp/test/unit/env-resolver.test.ts` confirms secret-aware env resolution behaves correctly.

## Completed This Iteration
1. Reintegrated feature-branch proxy logic into the modular layout, removed legacy shims/logging, and added conditional env resolution.
2. Ran the full MCP unit suite plus WebSocket/SSE + OAuth E2E transport integrations with `RUN_INTEGRATION_TESTS=true` – all green.
3. Added unit coverage for `resolveServerEnvironment` including inline default/server secret providers.

## Remaining Follow-Ups
1. **Downstream audit** – Sweep server/web/command packages for assumptions about the old proxy surface (extra getters, `.logs` side effects) and clean up if present.
2. **Optional regression sweep** – After the audit, run any remaining non-transport integration suites (e.g., server API/CLI tests) to ensure no hidden assumptions remain.

## Test Matrix (latest)
- `yarn vitest run packages/mcp/test/unit`
- `RUN_INTEGRATION_TESTS=true yarn vitest run packages/mcp/test/integration/websocket-real-integration.test.ts`
- `RUN_INTEGRATION_TESTS=true yarn vitest run packages/mcp/test/integration/sse-integration.test.ts`
- `RUN_INTEGRATION_TESTS=true yarn vitest run packages/mcp/test/integration/oauth-websocket-e2e-integration.test.ts`
- `RUN_INTEGRATION_TESTS=true yarn vitest run packages/mcp/test/integration/oauth-sse-e2e-integration.test.ts`

(Update this file after the downstream audit.)
