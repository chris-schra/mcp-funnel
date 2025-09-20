/**
 * In-memory user consent service for OAuth provider
 * Tracks user consent for client applications and scopes
 */

import type {
  IUserConsentService,
  RecordUserConsentOptions,
  UserConsentScope,
} from '../../types/oauth-provider.js';

export interface MemoryUserConsentServiceOptions {
  /** Default TTL (seconds) applied when a consent decision is not remembered */
  defaultTtlSeconds?: number;
  /** TTL when the caller asks to remember consent; null means no expiry */
  rememberedTtlSeconds?: number | null;
}

type ConsentScopeRecord = UserConsentScope;

interface ConsentBucket {
  userId: string;
  clientId: string;
  scopes: Map<string, ConsentScopeRecord>;
}

interface ConsentSummary {
  userId: string;
  clientId: string;
  scopes: ConsentScopeRecord[];
}

export class MemoryUserConsentService implements IUserConsentService {
  private readonly defaultTtlSeconds: number;
  private readonly rememberedTtlSeconds: number | null;

  private consents = new Map<string, ConsentBucket>();

  constructor(options: MemoryUserConsentServiceOptions = {}) {
    this.defaultTtlSeconds =
      options.defaultTtlSeconds ?? 60 * 60; /* default 1 hour */
    this.rememberedTtlSeconds =
      options.rememberedTtlSeconds ?? 60 * 60 * 24 * 30; /* default 30 days */
  }

  private getConsentKey(userId: string, clientId: string): string {
    return `${userId}:${clientId}`;
  }

  private resolveExpiry(
    issuedAt: number,
    options?: RecordUserConsentOptions,
  ): number | null {
    if (options?.ttlSeconds !== undefined) {
      if (options.ttlSeconds <= 0) {
        return issuedAt;
      }
      return issuedAt + options.ttlSeconds;
    }

    if (options?.remember) {
      if (this.rememberedTtlSeconds === null) {
        return null;
      }
      return issuedAt + this.rememberedTtlSeconds;
    }

    return issuedAt + this.defaultTtlSeconds;
  }

  private purgeExpiredScopes(bucket: ConsentBucket): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [scope, record] of bucket.scopes) {
      if (record.expiresAt !== null && record.expiresAt <= now) {
        bucket.scopes.delete(scope);
      }
    }

    if (bucket.scopes.size === 0) {
      this.consents.delete(this.getConsentKey(bucket.userId, bucket.clientId));
    }
  }

  async hasUserConsented(
    userId: string,
    clientId: string,
    scopes: string[],
  ): Promise<boolean> {
    const key = this.getConsentKey(userId, clientId);
    const bucket = this.consents.get(key);

    if (!bucket) {
      return false;
    }

    this.purgeExpiredScopes(bucket);

    if (scopes.length === 0) {
      return bucket.scopes.size > 0;
    }

    const now = Math.floor(Date.now() / 1000);

    for (const scope of scopes) {
      const record = bucket.scopes.get(scope);
      if (!record) {
        return false;
      }

      if (record.expiresAt !== null) {
        if (record.expiresAt <= now) {
          bucket.scopes.delete(scope);
          if (bucket.scopes.size === 0) {
            this.consents.delete(key);
          }
          return false;
        }
      }
    }

    return true;
  }

  async recordUserConsent(
    userId: string,
    clientId: string,
    scopes: string[],
    options?: RecordUserConsentOptions,
  ): Promise<void> {
    if (scopes.length === 0) {
      return;
    }

    const key = this.getConsentKey(userId, clientId);
    const bucket =
      this.consents.get(key) ??
      ({
        userId,
        clientId,
        scopes: new Map<string, ConsentScopeRecord>(),
      } as ConsentBucket);

    const issuedAt = options?.consentedAt ?? Math.floor(Date.now() / 1000);
    const expiresAt = this.resolveExpiry(issuedAt, options);

    for (const scope of scopes) {
      bucket.scopes.set(scope, {
        scope,
        consentedAt: issuedAt,
        expiresAt,
      });
    }

    this.consents.set(key, bucket);
  }

  async revokeUserConsent(
    userId: string,
    clientId: string,
    scopes?: string[],
  ): Promise<void> {
    const key = this.getConsentKey(userId, clientId);
    if (!scopes || scopes.length === 0) {
      this.consents.delete(key);
      return;
    }

    const bucket = this.consents.get(key);
    if (!bucket) {
      return;
    }

    for (const scope of scopes) {
      bucket.scopes.delete(scope);
    }

    if (bucket.scopes.size === 0) {
      this.consents.delete(key);
    }
  }

  // Development helpers
  async getUserConsents(userId: string): Promise<ConsentSummary[]> {
    const results: ConsentSummary[] = [];
    for (const bucket of this.consents.values()) {
      if (bucket.userId !== userId) {
        continue;
      }
      this.purgeExpiredScopes(bucket);
      if (bucket.scopes.size > 0) {
        results.push({
          userId: bucket.userId,
          clientId: bucket.clientId,
          scopes: Array.from(bucket.scopes.values()),
        });
      }
    }
    return results;
  }

  async getClientConsents(clientId: string): Promise<ConsentSummary[]> {
    const results: ConsentSummary[] = [];
    for (const bucket of this.consents.values()) {
      if (bucket.clientId !== clientId) {
        continue;
      }
      this.purgeExpiredScopes(bucket);
      if (bucket.scopes.size > 0) {
        results.push({
          userId: bucket.userId,
          clientId: bucket.clientId,
          scopes: Array.from(bucket.scopes.values()),
        });
      }
    }
    return results;
  }

  async clear(): Promise<void> {
    this.consents.clear();
  }
}
