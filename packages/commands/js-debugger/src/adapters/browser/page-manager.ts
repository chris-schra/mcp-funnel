import { CDPClient, TargetDiscovery, BrowserTarget } from '../../cdp/index.js';

/**
 * Manages page navigation and target discovery for browser debugging
 */
export class PageManager {
  private targetDiscovery: TargetDiscovery;
  private currentTarget: BrowserTarget | null = null;

  constructor(host: string, port: number) {
    this.targetDiscovery = new TargetDiscovery(host, port);
  }

  /**
   * Connect to a browser debugging target
   * @param target URL pattern, target ID, or 'auto' to connect to first page
   */
  async findTarget(target: string): Promise<BrowserTarget> {
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
   * Navigate the connected target to a URL
   */
  async navigate(cdpClient: CDPClient, url: string): Promise<void> {
    await cdpClient.send('Page.navigate', { url });
  }

  /**
   * Get current target
   */
  getCurrentTarget(): BrowserTarget | null {
    return this.currentTarget;
  }

  /**
   * Clear current target
   */
  clearTarget(): void {
    this.currentTarget = null;
  }
}
