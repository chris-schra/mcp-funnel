/**
 * Single navigation step inside a scope object graph.
 *
 * `{ property }` selects a named property, while `{ index }` addresses
 * array-like positions. The explicit object form keeps JSON schema validation
 * straightforward for MCP tooling.
 */
export type ScopePathSegment = { index: number } | { property: string };
