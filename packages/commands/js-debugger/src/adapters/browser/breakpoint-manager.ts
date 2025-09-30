import { BreakpointRegistration } from '../../types/index.js';
import { CDPClient, CDPBreakpoint } from '../../cdp/index.js';
import { mapBreakpointLocations } from '../../utils/breakpoints.js';
import path from 'path';
import type { ScriptInfo } from './handlers/script-handler.js';
import { urlToFilePath } from './utils/location-mapper.js';

/**
 * Manages breakpoints for browser debugging sessions via Chrome DevTools Protocol.
 *
 * Handles breakpoint lifecycle operations including setting, removing, and tracking
 * breakpoints across browser scripts. Automatically resolves breakpoint locations
 * from URLs to file paths and manages project root discovery.
 * @example
 * ```typescript
 * const manager = new BreakpointManager(cdpClient, scriptsMap, '/path/to/project');
 * const registration = await manager.setBreakpoint('https://example.com/app.js', 42);
 * console.log(`Breakpoint ${registration.id} verified: ${registration.verified}`);
 * ```
 * @internal
 * @see file:./handlers/breakpoint-handler.ts - Breakpoint event handling
 * @see file:../../utils/breakpoints.ts - Location mapping utilities
 */
export class BreakpointManager {
  private cdpClient: CDPClient;
  private breakpoints = new Map<string, CDPBreakpoint>();
  private scripts: Map<string, ScriptInfo>;
  private projectRoot?: string;

  public constructor(
    cdpClient: CDPClient,
    scripts: Map<string, ScriptInfo>,
    projectRoot?: string,
  ) {
    this.cdpClient = cdpClient;
    this.scripts = scripts;
    this.projectRoot = projectRoot;
  }

  /**
   * Sets a breakpoint at the specified URL and line number.
   *
   * Communicates with the browser via CDP to register the breakpoint. Automatically
   * resolves the breakpoint's actual location(s) after registration, converting URLs
   * to file paths. May discover and update the project root during resolution.
   * @param url - Script URL where the breakpoint should be set (e.g., 'https://example.com/app.js' or 'file:///path/to/file.js')
   * @param line - 1-based line number where the breakpoint should be set
   * @param condition - Optional JavaScript expression that must evaluate to true for the breakpoint to trigger
   * @returns Promise resolving to breakpoint registration with ID, verification status, and resolved locations
   * @throws \{Error\} When CDP communication fails or the breakpoint cannot be set
   * @example
   * ```typescript
   * // Simple breakpoint
   * const bp = await manager.setBreakpoint('file:///app/main.js', 10);
   *
   * // Conditional breakpoint
   * const conditionalBp = await manager.setBreakpoint(
   *   'https://example.com/app.js',
   *   42,
   *   'user.id === 123'
   * );
   * ```
   */
  public async setBreakpoint(
    url: string,
    line: number,
    condition?: string,
  ): Promise<BreakpointRegistration> {
    try {
      const result = await this.cdpClient.send<{
        breakpointId: string;
        locations: Array<{
          scriptId: string;
          lineNumber: number;
          columnNumber?: number;
        }>;
      }>('Debugger.setBreakpointByUrl', {
        url,
        lineNumber: line - 1, // CDP uses 0-based line numbers
        condition,
      });

      this.breakpoints.set(result.breakpointId, result);

      const resolvedLocations = mapBreakpointLocations(result.locations, {
        resolveScriptUrl: (scriptId) => this.scripts.get(scriptId)?.url,
        convertScriptUrlToPath: (scriptUrl) => urlToFilePath(scriptUrl),
        fallbackUrl: url,
        onPathResolved: (filePath) => {
          if (!this.projectRoot && path.isAbsolute(filePath)) {
            this.projectRoot = path.dirname(filePath).replace(/\\/g, '/');
          }
        },
      });

      return {
        id: result.breakpointId,
        verified: resolvedLocations.length > 0,
        resolvedLocations,
      };
    } catch (error) {
      throw new Error(
        `Failed to set breakpoint: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Removes a previously set breakpoint by its ID.
   * @param id - Breakpoint ID returned from setBreakpoint()
   * @throws \{Error\} When CDP communication fails or the breakpoint ID is invalid
   */
  public async removeBreakpoint(id: string): Promise<void> {
    try {
      await this.cdpClient.send('Debugger.removeBreakpoint', {
        breakpointId: id,
      });

      this.breakpoints.delete(id);
    } catch (error) {
      throw new Error(
        `Failed to remove breakpoint: ${error instanceof Error ? error.message : error}`,
      );
    }
  }

  /**
   * Retrieves CDP breakpoint details by ID.
   * @param id - Breakpoint ID to look up
   * @returns CDP breakpoint object containing breakpoint ID and resolved locations, or undefined if not found
   */
  public getBreakpoint(id: string): CDPBreakpoint | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Clears all breakpoints from local tracking.
   *
   * Note: This only clears the local breakpoint registry. It does not communicate
   * with CDP to remove breakpoints from the actual debugging session.
   */
  public clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  /**
   * Returns the internal breakpoints map.
   * @returns Read-only reference to the breakpoints map, keyed by breakpoint ID
   */
  public getBreakpoints(): Map<string, CDPBreakpoint> {
    return this.breakpoints;
  }

  /**
   * Updates the project root path used for path resolution.
   * @param projectRoot - New project root path, or undefined to clear it
   */
  public updateProjectRoot(projectRoot?: string): void {
    this.projectRoot = projectRoot;
  }
}
