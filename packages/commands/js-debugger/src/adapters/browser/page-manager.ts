import { CDPClient, TargetDiscovery, BrowserTarget } from '../../cdp/index.js';

/**
 * Manages page navigation and target discovery for browser debugging.
 *
 * Internal helper class for BrowserAdapter that handles Chrome DevTools Protocol
 * target discovery and navigation. Wraps TargetDiscovery to provide higher-level
 * operations like finding targets by pattern, auto-connecting to pages, and
 * navigating connected targets.
 * @internal
 * @see file:./../../cdp/target-discovery.ts - Lower-level target discovery
 * @see file:./../browser-adapter.ts:84 - Usage in BrowserAdapter
 */
export class PageManager {
  private targetDiscovery: TargetDiscovery;
  private currentTarget: BrowserTarget | null = null;

  /**
   * Creates a new PageManager instance.
   * @param host - Chrome DevTools Protocol host address (e.g., 'localhost')
   * @param port - Chrome DevTools Protocol port number (e.g., 9222)
   */
  public constructor(host: string, port: number) {
    this.targetDiscovery = new TargetDiscovery(host, port);
  }

  /**
   * Connect to a browser debugging target.
   *
   * Finds an existing target or creates a new one based on the target parameter:
   * - 'auto': Finds first page target, creates blank page if none exists
   * - URL (starts with 'http'): Finds matching target by URL or creates new page with that URL
   * - Other string: Searches for matching target ID or title substring
   * @param target - URL pattern, target ID, title substring, or 'auto' for first page
   * @returns Promise resolving to the discovered or created browser target
   * @throws When Chrome DevTools endpoint is unavailable
   * @throws When target cannot be found or created
   */
  public async findTarget(target: string): Promise<BrowserTarget> {
    // Check if endpoint is available
    const isAvailable = await this.targetDiscovery.isAvailable();
    if (!isAvailable) {
      throw new Error(
        'Chrome DevTools endpoint not available. Make sure Chrome is running with --remote-debugging-port=9222',
      );
    }

    // Find or create target
    let browserTarget: BrowserTarget | undefined;

    if (target === 'auto') {
      browserTarget = await this.targetDiscovery.findFirstPageTarget();
      if (!browserTarget) {
        // Create a new blank page if no existing page found
        browserTarget = await this.targetDiscovery.createTarget('about:blank');
      }
    } else if (target.startsWith('http')) {
      // Target is a URL pattern
      browserTarget = await this.targetDiscovery.findTarget(target);
      if (!browserTarget) {
        // Create a new page with this URL
        browserTarget = await this.targetDiscovery.createTarget(target);
      }
    } else {
      // Target might be a target ID or title
      const targets = await this.targetDiscovery.listTargets();
      browserTarget = targets.find(
        (t: BrowserTarget) => t.id === target || t.title.includes(target),
      );
    }

    if (!browserTarget) {
      throw new Error(`Could not find or create target: ${target}`);
    }

    this.currentTarget = browserTarget;
    return browserTarget;
  }

  /**
   * Navigate the connected target to a URL.
   * @param cdpClient - CDP client connected to the target
   * @param url - Absolute URL to navigate to
   * @returns Promise that resolves when navigation is complete
   */
  public async navigate(cdpClient: CDPClient, url: string): Promise<void> {
    await cdpClient.send('Page.navigate', { url });
  }

  /**
   * Get current target.
   * @returns The currently connected browser target, or null if none is connected
   */
  public getCurrentTarget(): BrowserTarget | null {
    return this.currentTarget;
  }

  /**
   * Clear current target.
   *
   * Resets the internal target reference without closing the target itself.
   * Used during adapter cleanup and disconnection.
   */
  public clearTarget(): void {
    this.currentTarget = null;
  }
}
