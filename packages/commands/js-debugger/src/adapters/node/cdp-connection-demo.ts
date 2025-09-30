/**
 * Demo showing Emittery-based CDP connection usage
 * This demonstrates both typed and untyped event handling
 */

import { CDPConnection } from './cdp-connection.js';
import type { CDPDebuggerPausedParams } from '../../cdp/types.js';

/**
 * Demo function showing Emittery-based CDP connection usage
 */
async function demoEmitterySupport() {
  const cdpConnection = new CDPConnection();

  // Typed event handling using onTyped method
  const unsubscribeTyped = cdpConnection.onTyped(
    'Debugger.paused',
    (params) => {
      // params is automatically typed as CDPDebuggerPausedParams | undefined
      console.info('Typed handler - paused with reason:', params?.reason);
    },
  );

  // Untyped event handling for backward compatibility (ICDPClient interface)
  cdpConnection.on('Debugger.paused', (params: unknown) => {
    const pausedParams = params as CDPDebuggerPausedParams;
    console.info('Untyped handler - paused with reason:', pausedParams.reason);
  });

  // Both event handlers for Debugger.resumed (no parameters)
  cdpConnection.onTyped('Debugger.resumed', () => {
    console.info('Typed handler - debugger resumed');
  });

  cdpConnection.on('Debugger.resumed', () => {
    console.info('Untyped handler - debugger resumed');
  });

  // Console events with typed handling
  cdpConnection.onTyped('Runtime.consoleAPICalled', (params) => {
    // params is automatically typed as CDPConsoleAPICalledParams | undefined
    console.info('Console message:', params?.type, params?.args);
  });

  // Example of removing typed event handlers
  unsubscribeTyped(); // Removes the typed Debugger.paused handler

  console.info('CDP Connection demo setup complete!');
  console.info('Benefits of Emittery refactoring:');
  console.info('1. Type safety with onTyped() method');
  console.info('2. Better async event handling');
  console.info('3. Cleaner unsubscribe pattern');
  console.info('4. Backward compatibility with ICDPClient interface');
}

// Don't run the demo by default, just export for demonstration
export { demoEmitterySupport };
