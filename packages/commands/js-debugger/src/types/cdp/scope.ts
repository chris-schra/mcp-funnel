import type { Location } from './location';
import type { RemoteObjectSummary } from './remote-object-summary';

/**
 * Scope types reported in debugger pause events.
 */
export type ScopeType =
  | 'global'
  | 'local'
  | 'with'
  | 'closure'
  | 'catch'
  | 'block'
  | 'script'
  | 'eval'
  | 'module'
  | 'wasm-expression-stack';

/**
 * Represents a scope entry in the current call frame.
 */
export interface Scope {
  type: ScopeType;
  object: RemoteObjectSummary;
  name?: string;
  startLocation?: Location;
  endLocation?: Location;
}
