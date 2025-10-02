import type { Location } from './location';
import type { RemoteObjectSummary } from './remote-object-summary';
import type { Scope } from './scope';

/**
 * Call frame structure returned from `Debugger.paused`.
 */
export interface DebuggerCallFrame {
  callFrameId: string;
  functionName: string;
  functionLocation?: Location;
  location: Location;
  url: string;
  scopeChain: Scope[];
  this: RemoteObjectSummary;
  returnValue?: RemoteObjectSummary;
  canBeRestarted?: boolean;
}
