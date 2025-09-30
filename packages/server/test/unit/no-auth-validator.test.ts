import { describe, it, expect, vi } from 'vitest';
import { NoAuthValidator } from '../../src/auth/index.js';
import { createMockContext } from './test-utils.js';

describe('NoAuthValidator', () => {
  it('should always authenticate successfully', async () => {
    const validator = new NoAuthValidator();

    const mockContext = createMockContext(vi.fn().mockReturnValue(undefined));

    const result = await validator.validateRequest(mockContext);

    expect(result.isAuthenticated).toBe(true);
    expect(result.context?.authType).toBe('none');
    expect(result.error).toBeUndefined();
  });

  it('should return correct type', () => {
    const validator = new NoAuthValidator();
    expect(validator.getType()).toBe('none');
  });
});
