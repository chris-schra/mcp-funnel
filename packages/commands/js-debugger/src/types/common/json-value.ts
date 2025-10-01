/**
 * JSON-compatible value used when materialising runtime data for log output.
 */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | { [key: string]: JsonValue }
  | JsonValue[];
