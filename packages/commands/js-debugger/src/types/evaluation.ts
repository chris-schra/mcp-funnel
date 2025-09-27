import type { CodeOrigin } from './debug-state.js';

export interface StackFrame {
  id: number;
  functionName: string;
  file: string;
  line: number;
  column?: number;
  origin?: CodeOrigin;
  relativePath?: string;
}

export interface Scope {
  type: 'global' | 'local' | 'closure' | 'with' | 'catch';
  name?: string;
  variables: Variable[];
}

export interface Variable {
  name: string;
  value: unknown;
  type: string;
  configurable?: boolean;
  enumerable?: boolean;
}

export interface EvaluationResult {
  value: unknown;
  type: string;
  description?: string;
  error?: string;
}
