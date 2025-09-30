import * as path from 'path';
import { ValidationSummary } from '../validator.js';

/**
 * Formats validation results as GitHub Actions workflow commands.
 *
 * Outputs diagnostic messages using the GitHub Actions annotation syntax:
 * - Validation results are mapped to `::error`, `::warning`, or `::notice`
 * - Tool status issues (failed/skipped) are reported as `::warning`
 * - File paths are made relative to the current working directory
 *
 * @param summary - Validation summary with file results and tool statuses
 * @public
 */
export function formatGitHubActionsAnnotations(
  summary: ValidationSummary,
): void {
  const cwd = process.cwd();

  // Output validation results
  for (const [filePath, results] of Object.entries(summary.fileResults)) {
    const relativePath = path.relative(cwd, filePath);

    for (const result of results) {
      const level =
        result.severity === 'error'
          ? 'error'
          : result.severity === 'warning'
            ? 'warning'
            : 'notice';

      const title = `${result.tool}(${result.ruleId || 'no-rule'})`;
      const location = `file=${relativePath},line=${result.line || 1},col=${result.column || 1}`;

      console.info(`::${level} ${location},title=${title}::${result.message}`);
    }
  }

  // Output tool status issues
  const failed =
    summary.toolStatuses?.filter((s) => s.status === 'failed') || [];
  const skipped =
    summary.toolStatuses?.filter((s) => s.status === 'skipped') || [];

  for (const status of [...failed, ...skipped]) {
    const message =
      status.error || status.reason || `${status.tool} ${status.status}`;
    console.info(`::warning title=${status.tool}-status::${message}`);
  }
}
