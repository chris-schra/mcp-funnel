/**
 * Single navigation step inside a scope object graph.
 *
 * String values represent property keys, while the object form with an `index`
 * targets array-like positions. This abstraction allows callers to walk
 * arbitrarily nested structures without exposing CDP-specific handles.
 */
export type ScopePathSegment = string | { index: number };
