import { z } from 'zod';
import { ProxyConfigSchema, TargetServerSchema } from './config/index.js';

export * from './config/index.js';

export type TargetServer = z.infer<typeof TargetServerSchema>;
export type ProxyConfig = z.infer<typeof ProxyConfigSchema>;
