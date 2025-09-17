/**
 * Mock implementation of RegistryContext for testing.
 *
 * This mock provides the same interface as the real RegistryContext but with
 * controllable behavior for testing scenarios. It follows the Vitest/Jest
 * __mocks__ pattern where the mock automatically replaces the real module
 * when vi.mock() is called.
 */

import { vi } from 'vitest';
import type { ProxyConfig } from '../../config.js';
import type { RegistryServer } from '../types/registry.types.js';

/**
 * Mock RegistryContext class that mimics the real implementation's interface.
 *
 * Export as RegistryContext (not MockRegistryContext) so it properly replaces
 * the real class when the module is mocked.
 */
export class RegistryContext {
  static instance: RegistryContext | null = null;
  private serverDetailsMock = vi.fn();

  static getInstance(_config?: ProxyConfig): RegistryContext {
    if (!RegistryContext.instance) {
      RegistryContext.instance = new RegistryContext();
    }
    return RegistryContext.instance;
  }

  static reset(): void {
    RegistryContext.instance = null;
  }

  async getServerDetails(registryId: string): Promise<RegistryServer | null> {
    return this.serverDetailsMock(registryId);
  }

  // Internal method for tests to control the mock behavior
  _setServerDetailsMock(mock: ReturnType<typeof vi.fn>): void {
    this.serverDetailsMock = mock;
  }
}
