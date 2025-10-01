/**
 * Primary runtime type discriminants reported by CDP remote objects.
 */
export type RemoteObjectType =
  | 'object'
  | 'function'
  | 'undefined'
  | 'string'
  | 'number'
  | 'boolean'
  | 'symbol'
  | 'bigint';
