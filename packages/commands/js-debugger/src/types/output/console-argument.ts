import type { RemoteObjectSummary } from '../cdp/remote-object-summary';

/**
 * Represents a single argument passed to a console call with both raw and rendered data.
 */
export interface ConsoleArgument {
  remote: RemoteObjectSummary;
  text: string;
}
