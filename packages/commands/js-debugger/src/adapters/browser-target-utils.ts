import { TargetDiscovery, BrowserTarget } from '../cdp/index.js';

/**
 * Find or create a browser target based on the target specification
 */
export async function findOrCreateTarget(
  targetDiscovery: TargetDiscovery,
  target: string,
): Promise<BrowserTarget> {
  let browserTarget: BrowserTarget | undefined;

  if (target === 'auto') {
    browserTarget = await targetDiscovery.findFirstPageTarget();
    if (!browserTarget) {
      // Create a new blank page if no existing page found
      browserTarget = await targetDiscovery.createTarget('about:blank');
    }
  } else if (target.startsWith('http')) {
    // Target is a URL pattern
    browserTarget = await targetDiscovery.findTarget(target);
    if (!browserTarget) {
      // Create a new page with this URL
      browserTarget = await targetDiscovery.createTarget(target);
    }
  } else {
    // Target might be a target ID or title
    const targets = await targetDiscovery.listTargets();
    browserTarget = targets.find(
      (t: BrowserTarget) => t.id === target || t.title.includes(target),
    );
  }

  if (!browserTarget) {
    throw new Error(`Could not find or create target: ${target}`);
  }

  return browserTarget;
}
