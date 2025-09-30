import type {
  ITypedCDPClient,
  BreakpointRegistration,
} from '../../types/index.js';
import type { CDPBreakpoint } from '../../cdp/types.js';

/**
 * Manages breakpoint operations for Node.js debugging.
 *
 * Handles setting, removing, and tracking breakpoints via CDP.
 * Stores breakpoint registrations and handles line number conversions
 * between 1-based (human-readable) and 0-based (CDP protocol) indexing.
 * @public
 * @see file:../node-adapter.ts:81 - NodeDebugAdapter usage
 */
export class BreakpointManager {
  /**
   * Creates a breakpoint manager instance.
   * @param cdpClient - CDP client for sending breakpoint commands
   * @param breakpoints - Map storing active breakpoint registrations
   */
  public constructor(
    private readonly cdpClient: ITypedCDPClient,
    private readonly breakpoints: Map<string, CDPBreakpoint>,
  ) {}

  /**
   * Sets a breakpoint at the specified file and line.
   *
   * Sends a CDP setBreakpointByUrl command and stores the result. Line numbers
   * use 1-based indexing (human-readable), but are converted to 0-based for CDP.
   *
   * The breakpoint may resolve to multiple locations if the file is loaded multiple
   * times or the line maps to multiple source locations.
   * @param file - Absolute path or URL of the file (e.g., 'file:///path/to/script.js' or '/path/to/script.js')
   * @param line - Line number (1-based) where breakpoint should be set
   * @param condition - Optional conditional expression (breakpoint triggers only when condition is truthy)
   * @returns Promise resolving to breakpoint registration with ID and resolved locations
   * @example
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/index.js', 42);
   * console.log(`Breakpoint ${bp.id} verified: ${bp.verified}`);
   * ```
   * @example With condition
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/loop.js', 15, 'i > 100');
   * // Breakpoint only triggers when i > 100
   * ```
   * @public
   * @see file:../../types/breakpoint.ts:1 - BreakpointRegistration type
   */
  public async setBreakpoint(
    file: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    const result = await this.cdpClient.send<CDPBreakpoint>(
      'Debugger.setBreakpointByUrl',
      {
        url: file,
        lineNumber: line - 1, // CDP uses 0-based line numbers
        condition,
      },
    );

    this.breakpoints.set(result.breakpointId, result);

    return {
      id: result.breakpointId,
      verified: result.locations.length > 0,
      resolvedLocations: result.locations.map((loc) => ({
        file,
        line: loc.lineNumber + 1, // Convert back to 1-based
        column: loc.columnNumber,
      })),
    };
  }

  /**
   * Removes a previously set breakpoint by ID.
   * @param id - Breakpoint ID returned from setBreakpoint
   * @example
   * ```typescript
   * const bp = await adapter.setBreakpoint('/app/index.js', 42);
   * await adapter.removeBreakpoint(bp.id);
   * ```
   * @public
   */
  public async removeBreakpoint(id: string): Promise<void> {
    await this.cdpClient.send('Debugger.removeBreakpoint', {
      breakpointId: id,
    });
    this.breakpoints.delete(id);
  }

  /**
   * Clears all breakpoints from internal storage.
   *
   * Used during disconnect/cleanup. Does not send CDP commands to remove
   * breakpoints from the debugger (disconnect handles that automatically).
   * @internal
   */
  public clearAll(): void {
    this.breakpoints.clear();
  }
}
