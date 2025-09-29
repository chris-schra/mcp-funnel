import { SourceMapConsumer } from 'source-map';
import { CDPClient } from '../cdp/client.js';

/**
 * Enable required CDP domains for browser debugging
 */
export async function enableCDPDomains(cdpClient: CDPClient): Promise<void> {
  await cdpClient.send('Runtime.enable');
  await cdpClient.send('Debugger.enable');
  await cdpClient.send('Console.enable');
  await cdpClient.send('Page.enable');

  // Set pause on exceptions if needed
  await cdpClient.send('Debugger.setPauseOnExceptions', {
    state: 'uncaught', // Can be 'none', 'uncaught', or 'all'
  });
}

/**
 * Disable CDP domains during cleanup
 */
export async function disableCDPDomains(cdpClient: CDPClient): Promise<void> {
  try {
    // Disable CDP domains
    await cdpClient.send('Debugger.disable');
    await cdpClient.send('Runtime.disable');
    await cdpClient.send('Console.disable');
    await cdpClient.send('Page.disable');
  } catch (_error) {
    // Ignore errors during cleanup
  }
}

/**
 * Load source map for a script
 */
export async function loadSourceMap(
  sourceMapURL: string,
): Promise<SourceMapConsumer | null> {
  try {
    // Handle relative URLs and data URLs
    let sourceMapContent: string;

    if (sourceMapURL.startsWith('data:')) {
      // Data URL
      const base64Data = sourceMapURL.split(',')[1];
      sourceMapContent = Buffer.from(base64Data, 'base64').toString('utf-8');
    } else if (sourceMapURL.startsWith('http')) {
      // Absolute URL - try to use built-in fetch or skip
      try {
        // Use Node.js built-in fetch (Node 18+) if available
        if (typeof globalThis.fetch === 'function') {
          const response = await globalThis.fetch(sourceMapURL);
          sourceMapContent = await response.text();
        } else {
          // Skip HTTP source maps if fetch is not available
          console.warn(
            `HTTP source map skipped (no fetch available): ${sourceMapURL}`,
          );
          return null;
        }
      } catch (fetchError) {
        console.warn(
          `Failed to fetch source map from ${sourceMapURL}:`,
          fetchError,
        );
        return null;
      }
    } else {
      // Relative path - this is tricky in browser context
      // For now, skip relative source maps
      return null;
    }

    const sourceMapData = JSON.parse(sourceMapContent);
    return await new SourceMapConsumer(sourceMapData);
  } catch (error) {
    // Source map loading is best-effort
    console.warn(`Failed to load source map ${sourceMapURL}:`, error);
    return null;
  }
}
