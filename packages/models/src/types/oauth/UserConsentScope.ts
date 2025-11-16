/**
 * User consent interface
 */
export interface UserConsentScope {
  scope: string;
  consentedAt: number;
  expiresAt: number | null;
}
