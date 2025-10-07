import type { RecordUserConsentOptions } from './RecordUserConsentOptions.js';

export interface IUserConsentService {
  /**
   * Check if user has already consented to the requested scopes
   */
  hasUserConsented(userId: string, clientId: string, scopes: string[]): Promise<boolean>;

  /**
   * Record user consent for specific scopes
   */
  recordUserConsent(
    userId: string,
    clientId: string,
    scopes: string[],
    options?: RecordUserConsentOptions,
  ): Promise<void>;

  /**
   * Revoke user consent for a client
   */
  revokeUserConsent(userId: string, clientId: string, scopes?: string[]): Promise<void>;
}
