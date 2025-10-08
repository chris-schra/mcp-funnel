import { describe, it, expect } from 'vitest';
import { parseSessionStatusArgs } from '../parsers.js';

describe('parseSessionStatusArgs', () => {
  it('should extract sessionId from valid input', () => {
    const result = parseSessionStatusArgs({
      sessionId: 'status-session-123',
    });

    expect(result).toBe('status-session-123');
  });

  it('should reject missing sessionId', () => {
    expect(() => {
      parseSessionStatusArgs({});
    }).toThrow('sessionId must be a non-empty string');
  });

  it('should reject empty string sessionId', () => {
    expect(() => {
      parseSessionStatusArgs({ sessionId: '' });
    }).toThrow('sessionId must be a non-empty string');
  });

  it('should reject non-string sessionId', () => {
    expect(() => {
      parseSessionStatusArgs({ sessionId: 999 });
    }).toThrow('sessionId must be a non-empty string');
  });

  it('should reject undefined sessionId', () => {
    expect(() => {
      parseSessionStatusArgs({ sessionId: undefined });
    }).toThrow('sessionId must be a non-empty string');
  });

  it('should reject null sessionId', () => {
    expect(() => {
      parseSessionStatusArgs({ sessionId: null });
    }).toThrow('sessionId must be a non-empty string');
  });

  it('should ignore extra fields and only return sessionId', () => {
    const result = parseSessionStatusArgs({
      sessionId: 'sess-abc',
      extraField: 'ignored',
      anotherField: 123,
    });

    expect(result).toBe('sess-abc');
  });
});
