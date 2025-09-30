import { BreakpointRegistration } from '../../types/index.js';
import { CDPClient, CDPBreakpoint } from '../../cdp/index.js';
import { mapBreakpointLocations } from '../../utils/breakpoints.js';
import path from 'path';
import type { ScriptInfo } from './handlers/script-handler.js';
import { urlToFilePath } from './utils/location-mapper.js';

/**
 * Manages breakpoints for browser debugging
 */
export class BreakpointManager {
  private cdpClient: CDPClient;
  private breakpoints = new Map<string, CDPBreakpoint>();
  private scripts: Map<string, ScriptInfo>;
  private projectRoot?: string;

  constructor(
    cdpClient: CDPClient,
    scripts: Map<string, ScriptInfo>,
    projectRoot?: string,
  ) {
    this.cdpClient = cdpClient;
    this.scripts = scripts;
    this.projectRoot = projectRoot;
  }

  /**
   * Set a breakpoint at specified URL and line
   */
  async setBreakpoint(
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
   * Remove a breakpoint by ID
   */
  async removeBreakpoint(id: string): Promise<void> {
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
   * Get breakpoint by ID
   */
  getBreakpoint(id: string): CDPBreakpoint | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Clear all breakpoints
   */
  clearBreakpoints(): void {
    this.breakpoints.clear();
  }

  /**
   * Get breakpoints map
   */
  getBreakpoints(): Map<string, CDPBreakpoint> {
    return this.breakpoints;
  }

  /**
   * Update project root
   */
  updateProjectRoot(projectRoot?: string): void {
    this.projectRoot = projectRoot;
  }
}
