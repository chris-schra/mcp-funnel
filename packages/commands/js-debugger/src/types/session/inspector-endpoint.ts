/**
 * Connection details for the inspector transport associated with a session.
 */
export interface InspectorEndpoint {
  host: string;
  port: number;
  /** Full WebSocket endpoint exposed by the runtime. */
  url: string;
}
