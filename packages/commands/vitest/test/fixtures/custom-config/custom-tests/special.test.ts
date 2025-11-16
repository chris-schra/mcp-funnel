/**
 * Tests in a non-standard location to verify custom vitest config
 * This fixture demonstrates custom testMatch patterns and strict TypeScript mode
 */
import { describe, it, expect } from 'vitest';

describe('Custom configuration tests', () => {
  describe('strict type checking', () => {
    it('should enforce strict type safety', () => {
      // Strict mode enabled in tsconfig
      const value: number = 42;
      expect(value).toBe(42);
    });

    it('should handle typed arrays', () => {
      const numbers: number[] = [1, 2, 3, 4, 5];
      const sum = numbers.reduce((acc, curr) => acc + curr, 0);
      expect(sum).toBe(15);
    });
  });

  describe('custom test location', () => {
    it('should run from custom-tests directory', () => {
      // This test is in custom-tests/ instead of standard test/ or __tests__/
      expect(true).toBe(true);
    });

    it('should respect custom timeout settings', () => {
      // Timeout set to 5000ms in vitest.config.ts
      const start = Date.now();
      // Simulate some work
      let count = 0;
      for (let i = 0; i < 1000; i++) {
        count += i;
      }
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(5000);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('type inference', () => {
    it('should infer types correctly', () => {
      interface User {
        id: number;
        name: string;
        email: string;
      }

      const user: User = {
        id: 1,
        name: 'Test User',
        email: 'test@example.com',
      };

      expect(user.id).toBe(1);
      expect(user.name).toBe('Test User');
    });

    it('should handle generic types', () => {
      /**
       *
       * @param value
       */
      function identity<T>(value: T): T {
        return value;
      }

      expect(identity(42)).toBe(42);
      expect(identity('hello')).toBe('hello');
    });
  });
});
