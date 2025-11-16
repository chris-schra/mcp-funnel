import type { TestModule } from 'vitest/node';
import { SummaryStats } from '../types/summary';

/**
 * Build summary statistics from test modules
 *
 * @param testModules - Array of test modules
 * @returns Summary with aggregate stats
 */
export function buildSummary(testModules: readonly TestModule[]): SummaryStats {
  let total = 0;
  let passed = 0;
  const failed: SummaryStats['failed'] = {};
  let skipped = 0;
  let duration = 0;

  for (const module of testModules) {
    const moduleDiagnostic = module.diagnostic();
    duration += moduleDiagnostic.duration;

    for (const test of module.children.allTests()) {
      total++;

      const result = test.result();
      if (result.state === 'passed') {
        passed++;
      } else if (result.state === 'failed') {
        failed[test.module.moduleId] ||= [];
        failed[test.module.moduleId].push({
          testName: test.name,
          errors: result.errors
            .map((it) => {
              const firstStack = it.stacks?.[0];

              const lineAndFile = firstStack ? ` (${firstStack.file}:${firstStack.line})` : ``;
              return `${it.message}${lineAndFile}`;
            })
            .filter(Boolean) as string[],
        });
      } else if (result.state === 'skipped') {
        skipped++;
      }
    }
  }

  return {
    total,
    passed,
    failed,
    skipped,
    duration,
  };
}
