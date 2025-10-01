/**
 * Single navigation step inside a scope object graph.
 *
 * Callers may either provide an explicit object (`{ property: "foo" }` or
 * `{ index: 0 }`) or use the shorthand string form (`"foo"`) when selecting a
 * property. The server normalises the shorthand to the object representation so
 * future extensions can enrich the metadata without breaking callers.
 */
export type ScopePathSegment =
  | { index: number }
  | { property: string }
  | string;
