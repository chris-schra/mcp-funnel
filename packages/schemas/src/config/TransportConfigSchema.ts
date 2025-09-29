import { z } from 'zod';
import { StdioTransportConfigSchema } from './StdioTransportConfigSchema.js';
import { SSETransportConfigSchema } from './SSETransportConfigSchema.js';
import { WebSocketTransportConfigSchema } from './WebSocketTransportConfigSchema.js';
import { StreamableHTTPTransportConfigSchema } from './StreamableHTTPTransportConfigSchema.js';

export const TransportConfigSchema = z.discriminatedUnion('type', [
  StdioTransportConfigSchema,
  SSETransportConfigSchema,
  WebSocketTransportConfigSchema,
  StreamableHTTPTransportConfigSchema,
]);
