import type { JsonValue } from '../common/json-value';
import type { RemoteObjectSubtype } from './remote-object-subtype';
import type { RemoteObjectType } from './remote-object-type';

/**
 * Lightweight projection of a `Runtime.RemoteObject` enriched with rendered text.
 */
export interface RemoteObjectSummary {
  type: RemoteObjectType;
  subtype?: RemoteObjectSubtype;
  className?: string;
  description?: string;
  value?: JsonValue | bigint;
  unserializableValue?: string;
  objectId?: string;
  preview?: string;
}
