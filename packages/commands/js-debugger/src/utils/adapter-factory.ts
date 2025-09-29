import { IDebugAdapter, DebugRequest } from '../types/index.js';
import { NodeDebugAdapter } from '../adapters/node-adapter.js';
import { BrowserAdapter } from '../adapters/browser-adapter.js';

/**
 * Factory interface for creating debug adapters
 */
export interface IAdapterFactory {
  createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter;
}

/**
 * Real adapter factory - creates appropriate adapters based on platform
 */
export class AdapterFactory implements IAdapterFactory {
  public createAdapter(
    platform: 'node' | 'browser',
    request?: DebugRequest,
  ): IDebugAdapter {
    switch (platform) {
      case 'node':
        return new NodeDebugAdapter({
          request: request,
        });
      case 'browser':
        return new BrowserAdapter();
      default:
        throw new Error(`Unsupported platform: ${platform}`);
    }
  }
}
