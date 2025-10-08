/**
 * Tests with console output to verify log capture and association
 * Mix of console.log, console.error, console.warn with different test cases
 */
import { describe, it, expect } from 'vitest';

describe('Console output tests', () => {
  describe('stdout logging', () => {
    it('should log basic message', () => {
      console.log('Test case: basic message');
      expect(1 + 1).toBe(2);
    });

    it('should log multiple messages', () => {
      console.log('First message');
      console.log('Second message');
      console.log('Third message');
      expect(true).toBe(true);
    });

    it('should log objects', () => {
      console.log('User object:', { id: 1, name: 'Alice', role: 'admin' });
      const user = { id: 1, name: 'Alice' };
      expect(user.id).toBe(1);
    });
  });

  describe('stderr logging', () => {
    it('should log errors', () => {
      console.error('Error: something went wrong');
      expect(2 + 2).toBe(4);
    });

    it('should log warnings', () => {
      console.warn('Warning: deprecated feature used');
      expect(true).toBeTruthy();
    });

    it('should mix stdout and stderr', () => {
      console.log('Starting test');
      console.error('Error encountered');
      console.log('Test completed');
      expect(5).toBeGreaterThan(3);
    });
  });

  describe('complex logging', () => {
    it('should log arrays', () => {
      const items = [1, 2, 3, 4, 5];
      console.log('Items array:', items);
      expect(items.length).toBe(5);
    });

    it('should log nested objects', () => {
      const data = {
        user: { id: 1, name: 'Bob' },
        settings: { theme: 'dark', notifications: true },
      };
      console.log('Complex data:', data);
      expect(data.user.name).toBe('Bob');
    });

    it('should handle multiline logs', () => {
      console.log('Line 1\nLine 2\nLine 3');
      expect(true).toBe(true);
    });
  });

  describe('silent test', () => {
    it('should pass without any console output', () => {
      // This test has no console output
      expect(10).toBe(10);
    });
  });
});
