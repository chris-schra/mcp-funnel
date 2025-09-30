JSDoc Policy (Pragmatic, Human & Machine Readable)

Purpose

- Provide clear, useful documentation for developers and AI agents
- Balance thoroughness with maintainability
- Support machine-readable references without bureaucratic overhead

Scope

- Required for all exported APIs in `packages/**/src/**`
- Optional but encouraged for complex internal functions
- Tests use minimal JSDoc (describe what's being tested)

Core Principles

- **Clarity over compliance** - Focus on explaining what code does and why
- **Type inference first** - Let TypeScript handle types, document behavior
- **Examples over theory** - Show real usage patterns
- **References for navigation** - Use file:line format for cross-references

Required Elements (Public APIs)

- Clear description of purpose and behavior
- `@public`, `@internal`, `@experimental`, or `@deprecated` visibility
- `@example` for non-trivial APIs showing typical usage
- `@throws` when errors are part of the API contract
- `@see` using simple file:line references for related code

Optional Elements (Use When Helpful)

- `@remarks` for important caveats or design decisions
- `@param` only when it adds value beyond the type
- `@returns` only when non-obvious from signature
- `@since` for tracking API introduction (simple semver)
- Additional `@example` blocks for edge cases

Machine-Readable References

Use the file protocol for cross-references that tools can navigate:
- `@see file:./path/to/file.ts:42` - specific line
- `@see file:./path/to/file.ts:42-58` - line range
- `@see file:../contracts/user.contract.ts` - whole file
- `@see https://github.com/org/repo/issues/123` - external links

Keep references focused on actual code locations, not process artifacts.

Templates

## Class/Module Documentation

```typescript
/**
 * MCP Registry Client for interacting with the Model Context Protocol registry API.
 *
 * This client provides a high-level interface for searching and retrieving MCP server
 * information from the registry, with built-in caching support for improved performance.
 *
 * Key features:
 * - Server search with keyword-based queries
 * - Individual server detail retrieval
 * - Configurable caching layer with TTL support
 * - Comprehensive error handling
 *
 * @example
 * ```typescript
 * import { MCPRegistryClient } from './registry-client.js';
 *
 * const client = new MCPRegistryClient('https://registry.modelcontextprotocol.io');
 * const servers = await client.searchServers('github');
 * ```
 *
 * @public
 * @see file:./interfaces/cache.interface.ts - Cache interface definition
 */
export class MCPRegistryClient { /* ... */ }
```

## Method Documentation

```typescript
/**
 * Searches for MCP servers in the registry based on keywords.
 *
 * Performs a keyword-based search across server names and descriptions.
 * Results are cached to improve performance for repeated queries.
 *
 * @param keywords - Search terms to query for
 * @returns Promise resolving to array of matching servers
 * @throws {NetworkError} When the registry is unreachable
 * @throws {ValidationError} When the response format is invalid
 *
 * @example
 * ```typescript
 * const servers = await client.searchServers('github');
 * console.log(`Found ${servers.length} servers`);
 * ```
 *
 * @see file:./types/registry.types.ts:34 - ServerDetail type
 */
async searchServers(keywords: string): Promise<ServerDetail[]> { /* ... */ }
```

## Interface/Type Documentation

```typescript
/**
 * Configuration options for server initialization.
 *
 * @see file:./implementations/server.ts:45-92 - Usage in server implementation
 * @public
 */
export interface ServerOptions {
  /** Server name for prefixing tools */
  name: string;
  /** Command to execute the server */
  command: string;
  /** Optional command arguments */
  args?: string[];
  /** Environment variables to pass to the server process */
  env?: Record<string, string>;
}
```

## Test Documentation

```typescript
/**
 * Tests parallel server connection behavior
 * @see file:../../src/registry/registry-client.ts:210 - searchServers implementation
 */
describe('Parallel Server Connection', () => {
  it('should connect to multiple servers in parallel', async () => {
    // test implementation
  });
});
```

## Best Practices

1. **Focus on the "why" not just the "what"** - Types tell us what, docs explain why
2. **Use @example for complex APIs** - Show typical usage patterns
3. **Document error conditions** - Use @throws for expected errors
4. **Keep descriptions concise** - Get to the point quickly
5. **Use file references for navigation** - Help tools and developers find related code
6. **Let TypeScript do its job** - Don't repeat type information in prose

## TSDoc Tag Reference

Standard TSDoc tags (from https://tsdoc.org):
- `@alpha`, `@beta`, `@experimental` - API stability markers
- `@deprecated` - Mark obsolete APIs with migration path
- `@example` - Code examples
- `@inheritDoc` - Inherit documentation from base class/interface
- `@internal` - Internal APIs not part of public contract
- `@link` - Inline links to other symbols
- `@override` - Marks overridden methods
- `@param` - Document parameters (when it adds value)
- `@public` - Public API marker
- `@readonly` - Marks read-only properties
- `@remarks` - Additional context or caveats
- `@returns` - Document return values (when non-obvious)
- `@see` - References to related code or resources
- `@throws` - Document exceptions
- `@typeParam` - Document generic type parameters

## Comprehensive Tag Reference Example

**IMPORTANT**: This example demonstrates ALL TSDoc tags for reference purposes only.
In practice:
- Simple functions like `add(x: number, y: number): number` need minimal docs
- Only use tags that add genuine value beyond what TypeScript already tells us
- This is a reference for understanding tag syntax, not a template to copy blindly

```typescript
/**
 * Advanced data processor demonstrating all TSDoc tags.
 *
 * @remarks
 * This class shows every TSDoc tag for reference. In real code, you'd only
 * use the tags that add value. The TypeScript types already tell us most
 * of what we need to know.
 *
 * @typeParam TInput - The input data type, must extend BaseData
 * @typeParam TOutput - The processed output type
 * @typeParam TConfig - Configuration options type with defaults
 *
 * @example Basic usage
 * ```typescript
 * const processor = new DataProcessor<UserData, ProcessedUser>();
 * const result = await processor.process(userData);
 * ```
 *
 * @example With custom config
 * ```typescript
 * const processor = new DataProcessor<UserData, ProcessedUser, CustomConfig>({
 *   strict: true,
 *   maxRetries: 3
 * });
 * ```
 *
 * @see file:./base-processor.ts:45 - Base implementation
 * @see file:./interfaces/config.ts:12-34 - Config interface definition
 * @see https://github.com/org/repo/wiki/processors - External documentation
 *
 * @alpha - This API is still in early development and will change
 * @since 2.0.0
 * @public
 */
export class DataProcessor<TInput extends BaseData, TOutput, TConfig = DefaultConfig> {
  /**
   * Configuration object for the processor.
   * @readonly - Once set in constructor, cannot be modified
   * @internal - Not exposed in public API
   */
  private readonly config: TConfig;

  /**
   * Processes input data with validation and transformation.
   *
   * Transforms {@link BaseData} objects into the output format using the
   * configured pipeline. See {@link Pipeline.execute} for details.
   *
   * @param input - The data to process
   * @param options - Optional processing parameters (overrides config)
   * @returns Promise resolving to processed data
   *
   * @throws {ValidationError} When input validation fails - check input.isValid()
   * @throws {ProcessingError} When transformation fails - see error.code for details
   *
   * @beta - The options parameter structure is still being finalized
   * @override - Extends BaseProcessor.process with validation
   * @inheritDoc - Includes all base behavior plus validation step
   */
  async process(input: TInput, options?: ProcessOptions): Promise<TOutput> {
    // implementation
  }

  /**
   * @deprecated Use {@link process} instead. Will be removed in 3.0.0.
   *
   * Migration path:
   * ```typescript
   * // Before:
   * processor.processLegacy(data)
   * // After:
   * processor.process(data as UserData)
   * ```
   *
   * @param data - Legacy data format (untyped)
   */
  async processLegacy(data: any): Promise<any> {
    // legacy implementation
  }

  /**
   * Validates input before processing.
   * @internal - Helper method not part of public API
   */
  private validate(input: TInput): boolean {
    // internal implementation
  }

  /**
   * Batch processing for multiple items.
   * @experimental - API may change or be removed without notice
   */
  async processBatch(items: TInput[]): Promise<TOutput[]> {
    // experimental implementation
  }
}

/**
 * Simple utility function - minimal documentation needed.
 *
 * @param a - First number
 * @param b - Second number
 * @returns Sum of a and b
 */
export function add(a: number, b: number): number {
  return a + b;
}

/**
 * Complex utility with non-obvious behavior - more documentation warranted.
 *
 * Merges configurations with environment-specific overrides, handling
 * nested objects and arrays according to the merge strategy.
 *
 * @param base - Base configuration
 * @param overrides - Environment-specific overrides
 * @param strategy - How to handle array merging ('replace' | 'concat' | 'merge')
 * @returns Merged configuration
 *
 * @throws {ConfigError} When circular references are detected
 *
 * @example
 * ```typescript
 * const config = mergeConfig(
 *   baseConfig,
 *   { api: { timeout: 5000 } },
 *   'merge'
 * );
 * ```
 *
 * @see file:./strategies/merge-strategy.ts:23 - Strategy implementations
 */
export function mergeConfig<T extends object>(
  base: T,
  overrides: DeepPartial<T>,
  strategy: MergeStrategy = 'replace'
): T {
  // complex implementation
}
```

### Key Takeaways from This Reference:

1. **Tag Syntax Examples:**
   - Inline references: `{@link ClassName}` for same-file, `{@link Package.Class}` for external
   - Block references: `@see file:./path:line` for code navigation
   - Lifecycle progression: `@alpha` → `@beta` → `@public` → `@deprecated`

2. **When to Use Each Tag:**
   - `@typeParam` - Only for non-obvious generic constraints
   - `@override` + `@inheritDoc` - When extending behavior
   - `@internal` - Private implementation details
   - `@readonly` - When immutability isn't obvious from context
   - `@experimental` vs `@beta` vs `@alpha` - Different stability levels

3. **Pragmatic Application:**
   - Simple `add()` function: Just basics
   - Complex `mergeConfig()`: Full documentation with examples and edge cases
   - The right amount of documentation depends on complexity and non-obviousness

## Validation

Linting should enforce:
- Public exports have visibility markers (@public/@internal/@experimental)
- @example blocks compile without errors
- File references in @see tags point to valid locations
- No excessive documentation (>100 lines is a code smell)
