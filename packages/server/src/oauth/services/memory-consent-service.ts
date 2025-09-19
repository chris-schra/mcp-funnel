/**
 * In-memory user consent service for OAuth provider
 * Tracks user consent for client applications and scopes
 */

import type { IUserConsentService } from '../../types/oauth-provider.js';

interface UserConsent {
  userId: string;
  clientId: string;
  scopes: string[];
  consentedAt: number;
}

export class MemoryUserConsentService implements IUserConsentService {
  private consents = new Map<string, UserConsent>();

  private getConsentKey(userId: string, clientId: string): string {
    return `${userId}:${clientId}`;
  }

  async hasUserConsented(
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<boolean> {
    const key = this.getConsentKey(userId, clientId);
    const consent = this.consents.get(key);

    if (!consent) {
      return false;
    }

    // Check if all requested scopes are included in the consented scopes
    return scopes.every((scope) => consent.scopes.includes(scope));
  }

  async recordUserConsent(
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<void> {
    const key = this.getConsentKey(userId, clientId);
    const existingConsent = this.consents.get(key);

    // Merge with existing consented scopes
    const allScopes = existingConsent
      ? [...new Set([...existingConsent.scopes, ...scopes])]
      : scopes;

    const consent: UserConsent = {
      userId,
      clientId,
      scopes: allScopes,
      consentedAt: Math.floor(Date.now() / 1000),
    };

    this.consents.set(key, consent);
  }

  async revokeUserConsent(userId: string, clientId: string): Promise<void> {
    const key = this.getConsentKey(userId, clientId);
    this.consents.delete(key);
  }

  // Development helpers
  async getUserConsents(userId: string): Promise<UserConsent[]> {
    return Array.from(this.consents.values()).filter(
      (consent) => consent.userId === userId,
    );
  }

  async getClientConsents(clientId: string): Promise<UserConsent[]> {
    return Array.from(this.consents.values()).filter(
      (consent) => consent.clientId === clientId,
    );
  }

  async clear(): Promise<void> {
    this.consents.clear();
  }
}
