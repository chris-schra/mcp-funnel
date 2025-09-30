import type { Handler } from 'hono';
import { OAuthProvider } from '@mcp-funnel/auth';
import type {
  IOAuthProviderStorage,
  IUserConsentService,
  OAuthProviderConfig,
} from '@mcp-funnel/models';

export type OAuthEnv = {
  Variables: {
    oauthProvider: OAuthProvider;
    consentService: IUserConsentService;
    storage: IOAuthProviderStorage;
    oauthConfig: OAuthProviderConfig;
  };
};
export type OAuthHandler = Handler<OAuthEnv>;
