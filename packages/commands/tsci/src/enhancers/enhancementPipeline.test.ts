/**
 * Tests for EnhancementPipeline
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type * as ts from 'typescript';
import type { ProjectReflection } from 'typedoc';
import { EnhancementPipeline } from './enhancementPipeline.js';
import type { ISymbolEnhancer, EnhancementContext } from './ISymbolEnhancer.js';
import type { SymbolMetadata } from '../types/index.js';

/**
 * Create a mock enhancer for testing
 *
 * @param name - Name identifier for the enhancer
 * @param enhanceFn - Optional enhance function implementation
 * @returns Mock enhancer instance
 */
function createMockEnhancer(
  name: string,
  enhanceFn?: (symbols: SymbolMetadata[], context: EnhancementContext) => Promise<void>,
): ISymbolEnhancer {
  return {
    name,
    enhance: enhanceFn || vi.fn().mockResolvedValue(undefined),
  };
}

/**
 * Create a mock enhancement context
 *
 * @returns Mock enhancement context
 */
function createMockContext(): EnhancementContext {
  return {
    project: {} as ProjectReflection,
    checker: {} as ts.TypeChecker,
    program: {} as ts.Program,
    symbolIndex: new Map(),
  };
}

describe('EnhancementPipeline', () => {
  let mockSymbols: SymbolMetadata[];
  let mockContext: EnhancementContext;

  beforeEach(() => {
    mockSymbols = [
      {
        id: 'test.symbol1',
        name: 'symbol1',
        kind: 1,
        isExported: true,
      },
    ];
    mockContext = createMockContext();
  });

  describe('single enhancer execution', () => {
    it('should execute a single enhancer', async () => {
      const enhancer = createMockEnhancer('TestEnhancer');
      const pipeline = new EnhancementPipeline([enhancer]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(enhancer.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
      expect(enhancer.enhance).toHaveBeenCalledTimes(1);
    });

    it('should execute multiple sequential stages', async () => {
      const enhancer1 = createMockEnhancer('Enhancer1');
      const enhancer2 = createMockEnhancer('Enhancer2');
      const enhancer3 = createMockEnhancer('Enhancer3');

      const pipeline = new EnhancementPipeline([enhancer1, enhancer2, enhancer3]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(enhancer1.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
      expect(enhancer2.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
      expect(enhancer3.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
    });
  });

  describe('parallel stage execution', () => {
    it('should execute enhancers in parallel stage concurrently', async () => {
      const callOrder: string[] = [];

      const enhancer1 = createMockEnhancer('Parallel1', async () => {
        callOrder.push('start-1');
        await new Promise((resolve) => setTimeout(resolve, 10));
        callOrder.push('end-1');
      });

      const enhancer2 = createMockEnhancer('Parallel2', async () => {
        callOrder.push('start-2');
        await new Promise((resolve) => setTimeout(resolve, 5));
        callOrder.push('end-2');
      });

      const pipeline = new EnhancementPipeline([[enhancer1, enhancer2]]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Both should start before either finishes (parallel execution)
      expect(callOrder.indexOf('start-1')).toBeLessThan(callOrder.indexOf('end-1'));
      expect(callOrder.indexOf('start-2')).toBeLessThan(callOrder.indexOf('end-2'));
      expect(callOrder.indexOf('start-1')).toBeLessThan(callOrder.indexOf('end-2'));
      expect(callOrder.indexOf('start-2')).toBeLessThan(callOrder.indexOf('end-1'));
    });

    it('should execute multiple parallel enhancers', async () => {
      const enhancer1 = createMockEnhancer('Parallel1');
      const enhancer2 = createMockEnhancer('Parallel2');
      const enhancer3 = createMockEnhancer('Parallel3');

      const pipeline = new EnhancementPipeline([[enhancer1, enhancer2, enhancer3]]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(enhancer1.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
      expect(enhancer2.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
      expect(enhancer3.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);
    });
  });

  describe('mixed stages', () => {
    it('should execute mixed sequential and parallel stages in order', async () => {
      const callOrder: string[] = [];

      const sequential1 = createMockEnhancer('Sequential1', async () => {
        callOrder.push('seq-1');
      });

      const parallel1 = createMockEnhancer('Parallel1', async () => {
        callOrder.push('par-1');
      });

      const parallel2 = createMockEnhancer('Parallel2', async () => {
        callOrder.push('par-2');
      });

      const sequential2 = createMockEnhancer('Sequential2', async () => {
        callOrder.push('seq-2');
      });

      const pipeline = new EnhancementPipeline([sequential1, [parallel1, parallel2], sequential2]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);

      // Sequential stages should be in order
      expect(callOrder.indexOf('seq-1')).toBe(0);
      expect(callOrder.indexOf('seq-2')).toBe(3);

      // Parallel stages should be between sequential stages
      expect(callOrder.indexOf('par-1')).toBeGreaterThan(0);
      expect(callOrder.indexOf('par-2')).toBeGreaterThan(0);
      expect(callOrder.indexOf('par-1')).toBeLessThan(3);
      expect(callOrder.indexOf('par-2')).toBeLessThan(3);
    });
  });

  describe('error handling', () => {
    it('should capture error from single enhancer and continue', async () => {
      const error = new Error('Enhancement failed');
      const failingEnhancer = createMockEnhancer('FailingEnhancer', async () => {
        throw error;
      });

      const successEnhancer = createMockEnhancer('SuccessEnhancer');

      const pipeline = new EnhancementPipeline([failingEnhancer, successEnhancer]);

      // Spy on console.error to verify error logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toEqual({
        enhancer: 'FailingEnhancer',
        error,
      });

      // Verify error was logged
      expect(consoleErrorSpy).toHaveBeenCalledWith('Enhancer FailingEnhancer failed:', error);

      // Verify second enhancer still ran
      expect(successEnhancer.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);

      consoleErrorSpy.mockRestore();
    });

    it('should capture multiple errors from parallel stage', async () => {
      const error1 = new Error('Error 1');
      const error2 = new Error('Error 2');

      const failing1 = createMockEnhancer('Failing1', async () => {
        throw error1;
      });

      const failing2 = createMockEnhancer('Failing2', async () => {
        throw error2;
      });

      const success = createMockEnhancer('Success');

      const pipeline = new EnhancementPipeline([[failing1, failing2, success]]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);

      const errorNames = result.errors.map((e) => e.enhancer).sort();
      expect(errorNames).toEqual(['Failing1', 'Failing2']);

      // Verify successful enhancer still ran
      expect(success.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);

      consoleErrorSpy.mockRestore();
    });

    it('should handle non-Error throws', async () => {
      const failingEnhancer = createMockEnhancer('StringThrower', async () => {
        throw 'string error';
      });

      const pipeline = new EnhancementPipeline([failingEnhancer]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].enhancer).toBe('StringThrower');
      expect(result.errors[0].error).toBeInstanceOf(Error);
      expect(result.errors[0].error.message).toBe('string error');

      consoleErrorSpy.mockRestore();
    });

    it('should collect all errors across multiple stages', async () => {
      const error1 = new Error('Stage 1 error');
      const error2 = new Error('Stage 2 parallel error');
      const error3 = new Error('Stage 3 error');

      const stage1Fail = createMockEnhancer('Stage1Fail', async () => {
        throw error1;
      });

      const stage2Fail = createMockEnhancer('Stage2Fail', async () => {
        throw error2;
      });

      const stage2Success = createMockEnhancer('Stage2Success');

      const stage3Fail = createMockEnhancer('Stage3Fail', async () => {
        throw error3;
      });

      const pipeline = new EnhancementPipeline([
        stage1Fail,
        [stage2Fail, stage2Success],
        stage3Fail,
      ]);

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(3);

      const errorNames = result.errors.map((e) => e.enhancer).sort();
      expect(errorNames).toEqual(['Stage1Fail', 'Stage2Fail', 'Stage3Fail']);

      // Verify successful enhancer in parallel stage still ran
      expect(stage2Success.enhance).toHaveBeenCalledWith(mockSymbols, mockContext);

      consoleErrorSpy.mockRestore();
    });
  });

  describe('edge cases', () => {
    it('should handle empty pipeline', async () => {
      const pipeline = new EnhancementPipeline([]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty parallel stage', async () => {
      const pipeline = new EnhancementPipeline([[]]);

      const result = await pipeline.enhance(mockSymbols, mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty symbols array', async () => {
      const enhancer = createMockEnhancer('TestEnhancer');
      const pipeline = new EnhancementPipeline([enhancer]);

      const result = await pipeline.enhance([], mockContext);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(enhancer.enhance).toHaveBeenCalledWith([], mockContext);
    });
  });
});
