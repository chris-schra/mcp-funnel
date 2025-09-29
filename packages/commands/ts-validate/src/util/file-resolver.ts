import { globby } from 'globby';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { ValidateOptions } from '../validator.js';

/**
 * Resolves files to validate based on options
 * @param options - Validation options
 * @returns List of absolute file paths
 */
export async function resolveFiles(
  options: ValidateOptions,
): Promise<string[]> {
  if (options.files) {
    // Process each provided path
    const patterns: string[] = [];

    for (const file of options.files) {
      const absolutePath = path.isAbsolute(file)
        ? file
        : path.resolve(process.cwd(), file);

      try {
        const stats = await fs.stat(absolutePath);

        if (stats.isDirectory()) {
          // Convert directory to glob pattern
          patterns.push(path.join(absolutePath, '**/*.{ts,tsx,js,jsx,json}'));
        } else {
          // Keep files as-is
          patterns.push(absolutePath);
        }
      } catch {
        // If stat fails, treat as a glob pattern or non-existent file
        // Let it be handled by globby or fail later in validation
        patterns.push(absolutePath);
      }
    }

    // Use globby to expand all patterns
    // Only ignore node_modules for performance - let each tool handle its own ignores
    return globby(patterns, {
      ignore: ['**/node_modules/**'],
      absolute: true,
    });
  }

  const pattern = options.glob || 'packages/**/*.{ts,tsx,js,jsx,json}';
  // Only ignore node_modules for performance - let each tool handle its own ignores
  return globby(pattern, {
    ignore: ['**/node_modules/**'],
    absolute: true,
  });
}
