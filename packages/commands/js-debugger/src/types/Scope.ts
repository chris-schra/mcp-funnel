import type { Variable } from './index.js';

export interface Scope {
  type: 'global' | 'local' | 'closure' | 'with' | 'catch';
  name?: string;
  variables: Variable[];
}
