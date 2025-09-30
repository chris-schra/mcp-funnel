import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combines CSS class names with Tailwind CSS conflict resolution.
 *
 * Merges multiple class name inputs using clsx for conditional classes,
 * then applies tailwind-merge to resolve conflicting Tailwind utility classes.
 * This ensures the last specified Tailwind utility takes precedence without
 * class duplication.
 * @param {...ClassValue} inputs - Class names, objects, arrays, or conditionals to merge
 * @returns {string} Single merged class name string with conflicts resolved
 * @example
 * ```typescript
 * // Basic usage
 * cn('px-2 py-1', 'px-4') // => 'py-1 px-4' (px-2 overridden)
 *
 * // Conditional classes
 * cn('text-base', error && 'text-red-500') // => 'text-base text-red-500' or 'text-base'
 *
 * // Object syntax
 * cn('p-4', { 'bg-blue-500': isActive, 'bg-gray-500': !isActive })
 * ```
 * @public
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
