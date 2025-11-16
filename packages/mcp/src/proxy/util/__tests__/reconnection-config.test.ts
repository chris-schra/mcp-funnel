import { describe, it, expect } from 'vitest';
import {
  createNormalizedReconnectionOptions,
  type NormalizedReconnectionOptions,
} from '../reconnection-config.js';
import type { ReconnectableTransportOptions } from '../../types.js';

describe('createNormalizedReconnectionOptions', () => {
  describe('empty options - all defaults applied', () => {
    it('should apply all default values when no options provided', () => {
      const options: ReconnectableTransportOptions = {
        command: 'test',
      };

      const result = createNormalizedReconnectionOptions(options);

      expect(result.healthChecks).toBe(true);
      expect(result.healthCheckInterval).toBe(30000);
      expect(result.reconnection.initialDelayMs).toBe(1000);
      expect(result.reconnection.maxDelayMs).toBe(30000);
      expect(result.reconnection.maxAttempts).toBe(10);
      expect(result.reconnection.backoffMultiplier).toBe(2);
      expect(result.reconnection.jitter).toBe(0.25);
    });

    it('should create alias fields matching canonical fields', () => {
      const options: ReconnectableTransportOptions = {
        command: 'test',
      };

      const result = createNormalizedReconnectionOptions(options);

      expect(result.reconnection.initialDelay).toBe(result.reconnection.initialDelayMs);
      expect(result.reconnection.maxDelay).toBe(result.reconnection.maxDelayMs);
      expect(result.reconnection.maxRetries).toBe(result.reconnection.maxAttempts);
    });

    it('should return type matching NormalizedReconnectionOptions', () => {
      const options: ReconnectableTransportOptions = {
        command: 'test',
      };

      const result: NormalizedReconnectionOptions = createNormalizedReconnectionOptions(options);

      expect(result).toHaveProperty('healthChecks');
      expect(result).toHaveProperty('healthCheckInterval');
      expect(result).toHaveProperty('reconnection');
      expect(typeof result.healthChecks).toBe('boolean');
      expect(typeof result.healthCheckInterval).toBe('number');
      expect(typeof result.reconnection).toBe('object');
    });
  });

  describe('partial options - mix of provided and defaulted values', () => {
    it('should use single provided values and default others', () => {
      const result1 = createNormalizedReconnectionOptions({
        command: 'test',
        reconnection: { initialDelayMs: 2000 },
      });
      expect(result1.reconnection.initialDelayMs).toBe(2000);
      expect(result1.reconnection.maxDelayMs).toBe(30000);

      const result2 = createNormalizedReconnectionOptions({
        command: 'test',
        healthChecks: false,
      });
      expect(result2.healthChecks).toBe(false);
      expect(result2.healthCheckInterval).toBe(30000);

      const result3 = createNormalizedReconnectionOptions({
        command: 'test',
        reconnection: { maxAttempts: 5 },
      });
      expect(result3.reconnection.maxAttempts).toBe(5);
      expect(result3.reconnection.initialDelayMs).toBe(1000);
    });

    it('should handle multiple provided values with some defaults', () => {
      const result = createNormalizedReconnectionOptions({
        command: 'test',
        healthChecks: false,
        healthCheckInterval: 60000,
        reconnection: { initialDelayMs: 500, maxAttempts: 20 },
      });

      expect(result.healthChecks).toBe(false);
      expect(result.healthCheckInterval).toBe(60000);
      expect(result.reconnection.initialDelayMs).toBe(500);
      expect(result.reconnection.maxAttempts).toBe(20);
      expect(result.reconnection.maxDelayMs).toBe(30000);
      expect(result.reconnection.backoffMultiplier).toBe(2);
    });
  });

  describe('full options provided - no defaults applied', () => {
    it('should use all provided values without applying defaults', () => {
      const options: ReconnectableTransportOptions = {
        command: 'test',
        healthChecks: false,
        healthCheckInterval: 45000,
        reconnection: {
          initialDelayMs: 1500,
          maxDelayMs: 60000,
          maxAttempts: 15,
          backoffMultiplier: 1.5,
          jitter: 0.1,
        },
      };

      const result = createNormalizedReconnectionOptions(options);

      expect(result.healthChecks).toBe(false);
      expect(result.healthCheckInterval).toBe(45000);
      expect(result.reconnection.initialDelayMs).toBe(1500);
      expect(result.reconnection.maxDelayMs).toBe(60000);
      expect(result.reconnection.maxAttempts).toBe(15);
      expect(result.reconnection.backoffMultiplier).toBe(1.5);
      expect(result.reconnection.jitter).toBe(0.1);
    });

    it('should create correct alias fields when all values provided', () => {
      const options: ReconnectableTransportOptions = {
        command: 'test',
        reconnection: {
          initialDelayMs: 1500,
          maxDelayMs: 60000,
          maxAttempts: 15,
          backoffMultiplier: 1.5,
          jitter: 0.1,
        },
      };

      const result = createNormalizedReconnectionOptions(options);

      expect(result.reconnection.initialDelay).toBe(1500);
      expect(result.reconnection.maxDelay).toBe(60000);
      expect(result.reconnection.maxRetries).toBe(15);
    });
  });

  describe('alias field creation', () => {
    it('should create all alias fields matching their canonical counterparts', () => {
      const testCases = [
        { initialDelayMs: 2000, maxDelayMs: 60000, maxAttempts: 15 },
        { initialDelayMs: 500 },
        { maxDelayMs: 10000 },
        { maxAttempts: 5 },
        {},
      ];

      testCases.forEach((reconnection) => {
        const result = createNormalizedReconnectionOptions({ command: 'test', reconnection });
        expect(result.reconnection.initialDelay).toBe(result.reconnection.initialDelayMs);
        expect(result.reconnection.maxDelay).toBe(result.reconnection.maxDelayMs);
        expect(result.reconnection.maxRetries).toBe(result.reconnection.maxAttempts);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle explicit false healthChecks and undefined/empty reconnection', () => {
      const result1 = createNormalizedReconnectionOptions({
        command: 'test',
        healthChecks: false,
      });
      expect(result1.healthChecks).toBe(false);

      const result2 = createNormalizedReconnectionOptions({
        command: 'test',
        reconnection: undefined,
      });
      expect(result2.reconnection.initialDelayMs).toBe(1000);

      const result3 = createNormalizedReconnectionOptions({ command: 'test', reconnection: {} });
      expect(result3.reconnection.maxDelayMs).toBe(30000);
    });

    it('should preserve zero values instead of replacing with defaults', () => {
      const result = createNormalizedReconnectionOptions({
        command: 'test',
        healthCheckInterval: 0,
        reconnection: {
          initialDelayMs: 0,
          maxDelayMs: 0,
          maxAttempts: 0,
          backoffMultiplier: 0,
          jitter: 0,
        },
      });

      expect(result.healthCheckInterval).toBe(0);
      expect(result.reconnection.initialDelayMs).toBe(0);
      expect(result.reconnection.maxDelayMs).toBe(0);
      expect(result.reconnection.maxAttempts).toBe(0);
      expect(result.reconnection.backoffMultiplier).toBe(0);
      expect(result.reconnection.jitter).toBe(0);
    });
  });

  describe('type safety - Required<ReconnectionConfig>', () => {
    it('should satisfy Required<ReconnectionConfig> with all fields as numbers', () => {
      const result = createNormalizedReconnectionOptions({ command: 'test' });

      // Compile-time check that the type satisfies Required<ReconnectionConfig>
      const config: Required<import('@mcp-funnel/models').ReconnectionConfig> = result.reconnection;

      // Runtime verification of all fields
      const fields = [
        'initialDelayMs',
        'initialDelay',
        'maxDelayMs',
        'maxDelay',
        'maxAttempts',
        'maxRetries',
        'backoffMultiplier',
        'jitter',
      ];
      fields.forEach((field) => {
        expect(config).toHaveProperty(field);
        expect(typeof config[field as keyof typeof config]).toBe('number');
      });
    });
  });

  describe('realistic configuration scenarios', () => {
    it('should handle various practical configurations', () => {
      // Aggressive
      const aggressive = createNormalizedReconnectionOptions({
        command: 'test',
        healthCheckInterval: 15000,
        reconnection: { initialDelayMs: 100, maxDelayMs: 5000, maxAttempts: 50 },
      });
      expect(aggressive.reconnection.initialDelayMs).toBe(100);
      expect(aggressive.reconnection.maxAttempts).toBe(50);

      // Conservative
      const conservative = createNormalizedReconnectionOptions({
        command: 'test',
        healthChecks: false,
        reconnection: { initialDelayMs: 10000, maxDelayMs: 120000, maxAttempts: 3 },
      });
      expect(conservative.healthChecks).toBe(false);
      expect(conservative.reconnection.maxAttempts).toBe(3);

      // Production-like
      const production = createNormalizedReconnectionOptions({
        command: 'node',
        healthCheckInterval: 60000,
        reconnection: { initialDelayMs: 1000, maxDelayMs: 60000, maxAttempts: 10 },
      });
      expect(production.healthCheckInterval).toBe(60000);
      expect(production.reconnection.maxDelayMs).toBe(60000);
    });
  });
});
