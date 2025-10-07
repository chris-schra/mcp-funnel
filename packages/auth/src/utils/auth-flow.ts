/**
 * OAuth2 Authorization Flow utilities
 * Pure functions for managing pending authorization flows
 */
import type { TokenData } from '@mcp-funnel/core';

/**
 * Pending authorization state with timestamp for expiration tracking
 */
export interface PendingAuth {
  state: string;
  codeVerifier: string;
  resolve: (token: TokenData) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  timestamp: number;
}

/**
 * Context for managing pending authorization flows
 */
export interface AuthFlowContext {
  pendingAuthFlows: Map<string, PendingAuth>;
  stateToProvider: Map<string, unknown>;
}

/**
 * Clean up specific pending authorization state by state key
 *
 * Removes the pending authorization from the context and clears its timeout.
 * If no state is provided, cleans up all pending authorizations (legacy cleanup).
 * @param context - The authorization flow context containing pending flows
 * @param state - Optional state key to clean up. If omitted, all pending flows are cleared
 * @internal
 * @see {@link PendingAuth}
 */
export function cleanupPendingAuth(context: AuthFlowContext, state?: string): void {
  if (state) {
    const pending = context.pendingAuthFlows.get(state);
    if (pending) {
      clearTimeout(pending.timeout);
      context.pendingAuthFlows.delete(state);
      context.stateToProvider.delete(state);
    }
  } else {
    // Legacy cleanup - clean all pending auths
    for (const [stateKey, pending] of context.pendingAuthFlows) {
      clearTimeout(pending.timeout);
      context.stateToProvider.delete(stateKey);
    }
    context.pendingAuthFlows.clear();
  }
}

/**
 * Clean up expired states
 *
 * Scans all pending authorization flows and removes those that have exceeded
 * the expiry time. Calls the optional callback for each expired state before cleanup.
 * @param context - The authorization flow context containing pending flows
 * @param stateExpiryMs - Maximum age in milliseconds before a state is considered expired
 * @param onExpired - Optional callback invoked for each expired state before cleanup
 * @internal
 */
export function cleanupExpiredStates(
  context: AuthFlowContext,
  stateExpiryMs: number,
  onExpired?: (state: string) => void,
): void {
  const now = Date.now();
  const expiredStates: string[] = [];

  for (const [state, pending] of context.pendingAuthFlows) {
    if (now - pending.timestamp > stateExpiryMs) {
      expiredStates.push(state);
    }
  }

  for (const state of expiredStates) {
    if (onExpired) {
      onExpired(state);
    }
    cleanupPendingAuth(context, state);
  }
}
