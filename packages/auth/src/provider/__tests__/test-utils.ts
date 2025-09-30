import { OAuthProvider } from '../oauth-provider.js';
import { MemoryOAuthStorage } from '../storage/memory-oauth-storage.js';
import { MemoryUserConsentService } from '../services/memory-consent-service.js';
import type { OAuthProviderConfig } from '@mcp-funnel/models';

export interface OAuthTestContext {
  oauthProvider: OAuthProvider;
  storage: MemoryOAuthStorage;
  consentService: MemoryUserConsentService;
  config: OAuthProviderConfig;
}

export const OauthTestUtils = {
  createOAuthProvider(): OAuthTestContext {
    const storage = new MemoryOAuthStorage();
    const consentService = new MemoryUserConsentService();
    const config: OAuthProviderConfig = {
      issuer: 'http://localhost:3000',
      baseUrl: 'http://localhost:3000/api/oauth',
      defaultTokenExpiry: 3600,
      defaultCodeExpiry: 600,
      supportedScopes: ['read', 'write', 'admin'],
      requirePkce: true,
      issueRefreshTokens: true,
    };
    const oauthProvider = new OAuthProvider(storage, consentService, config);

    return { oauthProvider, storage, consentService, config };
  },
};
