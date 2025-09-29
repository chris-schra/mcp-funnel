export interface Variable {
  name: string;
  value: unknown;
  type: string;
  configurable?: boolean;
  enumerable?: boolean;
}
