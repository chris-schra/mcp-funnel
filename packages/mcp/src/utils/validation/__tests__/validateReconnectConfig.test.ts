import { describe, it, expect } from 'vitest';
import { TransportError } from '@mcp-funnel/core';
import type { ReconnectionConfig } from '@mcp-funnel/models';
import { validateReconnectConfig } from '../validateReconnectConfig.js';

describe('validateReconnectConfig', () => {
  describe('maxAttempts validation', () => {
    it('should accept maxAttempts = 0 (boundary case)', () => {
      const config: ReconnectionConfig = { maxAttempts: 0 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject maxAttempts = -1 (negative)', () => {
      const config: ReconnectionConfig = { maxAttempts: -1 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });

    it('should reject maxAttempts = 1.5 (non-integer)', () => {
      const config: ReconnectionConfig = { maxAttempts: 1.5 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });

    it('should accept maxAttempts = undefined (optional)', () => {
      const config: ReconnectionConfig = { maxAttempts: undefined };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept maxAttempts = 5 (valid positive integer)', () => {
      const config: ReconnectionConfig = { maxAttempts: 5 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject maxAttempts = NaN', () => {
      const config: ReconnectionConfig = { maxAttempts: NaN };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });

    it('should reject maxAttempts = Infinity', () => {
      const config: ReconnectionConfig = { maxAttempts: Infinity };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });
  });

  describe('initialDelayMs validation', () => {
    it('should accept initialDelayMs = 0 (zero is valid)', () => {
      const config: ReconnectionConfig = { initialDelayMs: 0 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject initialDelayMs = -1 (negative)', () => {
      const config: ReconnectionConfig = { initialDelayMs: -1 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'initialDelayMs must be a positive number',
      );
    });

    it('should accept initialDelayMs = undefined (optional)', () => {
      const config: ReconnectionConfig = { initialDelayMs: undefined };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept initialDelayMs = 100 (valid positive)', () => {
      const config: ReconnectionConfig = { initialDelayMs: 100 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept initialDelayMs = 1.5 (decimal is valid)', () => {
      const config: ReconnectionConfig = { initialDelayMs: 1.5 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject initialDelayMs = -100 (negative)', () => {
      const config: ReconnectionConfig = { initialDelayMs: -100 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'initialDelayMs must be a positive number',
      );
    });
  });

  describe('maxDelayMs validation', () => {
    it('should accept maxDelayMs = 0 (zero is valid)', () => {
      const config: ReconnectionConfig = { maxDelayMs: 0 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject maxDelayMs = -1 (negative)', () => {
      const config: ReconnectionConfig = { maxDelayMs: -1 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow('maxDelayMs must be a positive number');
    });

    it('should accept maxDelayMs = undefined (optional)', () => {
      const config: ReconnectionConfig = { maxDelayMs: undefined };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept maxDelayMs = 5000 (valid positive)', () => {
      const config: ReconnectionConfig = { maxDelayMs: 5000 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept maxDelayMs = 2.5 (decimal is valid)', () => {
      const config: ReconnectionConfig = { maxDelayMs: 2.5 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject maxDelayMs = -5000 (negative)', () => {
      const config: ReconnectionConfig = { maxDelayMs: -5000 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow('maxDelayMs must be a positive number');
    });
  });

  describe('backoffMultiplier validation', () => {
    it('should reject backoffMultiplier = 1 (must be > 1)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 1 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });

    it('should reject backoffMultiplier = 0.5 (less than 1)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 0.5 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });

    it('should accept backoffMultiplier = 1.0001 (just above 1)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 1.0001 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept backoffMultiplier = undefined (optional)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: undefined };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept backoffMultiplier = 2 (valid)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 2 };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should reject backoffMultiplier = 0 (less than 1)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 0 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });

    it('should reject backoffMultiplier = -2 (negative)', () => {
      const config: ReconnectionConfig = { backoffMultiplier: -2 };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'backoffMultiplier must be greater than 1',
      );
    });
  });

  describe('complete configurations', () => {
    it('should accept valid complete config with all fields', () => {
      const config: ReconnectionConfig = {
        maxAttempts: 5,
        initialDelayMs: 1000,
        maxDelayMs: 30000,
        backoffMultiplier: 2,
      };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept empty config (all undefined)', () => {
      const config: ReconnectionConfig = {};
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept config with only some fields defined', () => {
      const config: ReconnectionConfig = {
        maxAttempts: 3,
        backoffMultiplier: 1.5,
      };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });

    it('should accept config with boundary values', () => {
      const config: ReconnectionConfig = {
        maxAttempts: 0,
        initialDelayMs: 0,
        maxDelayMs: 0,
        backoffMultiplier: 1.0001,
      };
      expect(() => validateReconnectConfig(config)).not.toThrow();
    });
  });

  describe('multiple validation failures', () => {
    it('should throw on first validation failure when multiple fields are invalid', () => {
      const config: ReconnectionConfig = {
        maxAttempts: -1,
        initialDelayMs: -100,
        backoffMultiplier: 0.5,
      };
      // Should fail on maxAttempts first (checked first in code)
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'maxAttempts must be a positive number',
      );
    });

    it('should throw on initialDelayMs when maxAttempts is valid but initialDelayMs is invalid', () => {
      const config: ReconnectionConfig = {
        maxAttempts: 5,
        initialDelayMs: -100,
        backoffMultiplier: 0.5,
      };
      expect(() => validateReconnectConfig(config)).toThrow(TransportError);
      expect(() => validateReconnectConfig(config)).toThrow(
        'initialDelayMs must be a positive number',
      );
    });
  });

  describe('TransportError properties', () => {
    it('should throw TransportError with correct code', () => {
      const config: ReconnectionConfig = { maxAttempts: -1 };
      try {
        validateReconnectConfig(config);
        expect.fail('Should have thrown TransportError');
      } catch (error) {
        expect(error).toBeInstanceOf(TransportError);
        expect((error as TransportError).code).toBe('protocol_error');
      }
    });

    it('should throw TransportError that is not retryable', () => {
      const config: ReconnectionConfig = { backoffMultiplier: 0.5 };
      try {
        validateReconnectConfig(config);
        expect.fail('Should have thrown TransportError');
      } catch (error) {
        expect(error).toBeInstanceOf(TransportError);
        expect((error as TransportError).isRetryable).toBe(false);
      }
    });
  });
});
