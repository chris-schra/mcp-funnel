// Using Node.js built-in fetch (Node 18+)
declare const fetch: typeof globalThis.fetch;

export interface BrowserTarget {
  id: string;
  title: string;
  type: 'page' | 'background_page' | 'app' | 'other';
  url: string;
  webSocketDebuggerUrl: string;
  devtoolsFrontendUrl?: string;
  faviconUrl?: string;
  thumbnailUrl?: string;
}

/**
 * Discovers available debugging targets from a Chrome DevTools Protocol endpoint
 */
export class TargetDiscovery {
  private readonly baseUrl: string;

  public constructor(host = 'localhost', port = 9222) {
    this.baseUrl = `http://${host}:${port}`;
  }

  /**
   * List all available debugging targets
   * @returns Array of available targets
   */
  public async listTargets(): Promise<BrowserTarget[]> {
    try {
      const response = await fetch(`${this.baseUrl}/json/list`);
      if (!response.ok) {
        throw new Error(
          `Failed to list targets: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as BrowserTarget[];
    } catch (error) {
      throw new Error(
        `Failed to discover targets: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Find a target by URL pattern or title
   * @param pattern URL pattern or title to match
   * @returns First matching target or undefined
   */
  public async findTarget(pattern: string): Promise<BrowserTarget | undefined> {
    const targets = await this.listTargets();
    const regex = new RegExp(pattern, 'i');

    return targets.find(
      (target) => regex.test(target.url) || regex.test(target.title),
    );
  }

  /**
   * Find the first page target (most common use case)
   * @returns First page target or undefined
   */
  public async findFirstPageTarget(): Promise<BrowserTarget | undefined> {
    const targets = await this.listTargets();
    return targets.find((target) => target.type === 'page');
  }

  /**
   * Create a new page target
   * @param url URL to navigate the new page to
   * @returns Created target information
   */
  public async createTarget(url = 'about:blank'): Promise<BrowserTarget> {
    try {
      const response = await fetch(
        `${this.baseUrl}/json/new?${encodeURIComponent(url)}`,
      );
      if (!response.ok) {
        throw new Error(
          `Failed to create target: ${response.status} ${response.statusText}`,
        );
      }
      return (await response.json()) as BrowserTarget;
    } catch (error) {
      throw new Error(
        `Failed to create target: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Close a target
   * @param targetId Target ID to close
   */
  public async closeTarget(targetId: string): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/json/close/${targetId}`);
      if (!response.ok) {
        throw new Error(
          `Failed to close target: ${response.status} ${response.statusText}`,
        );
      }
    } catch (error) {
      throw new Error(
        `Failed to close target: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Get version information from the browser
   * @returns Browser version info
   */
  public async getVersion(): Promise<{
    Browser: string;
    'Protocol-Version': string;
    'User-Agent': string;
    'V8-Version': string;
    'WebKit-Version': string;
    webSocketDebuggerUrl: string;
  }> {
    try {
      const response = await fetch(`${this.baseUrl}/json/version`);
      if (!response.ok) {
        throw new Error(
          `Failed to get version: ${response.status} ${response.statusText}`,
        );
      }
      return await response.json();
    } catch (error) {
      throw new Error(
        `Failed to get version: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Check if the debugging endpoint is available
   * @returns true if endpoint is available
   */
  public async isAvailable(): Promise<boolean> {
    try {
      await this.getVersion();
      return true;
    } catch {
      return false;
    }
  }
}
