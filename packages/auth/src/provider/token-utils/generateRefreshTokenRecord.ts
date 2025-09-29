import { OAuthUtils } from '../../utils/index.js';
import type { RefreshToken } from '@mcp-funnel/models';

export const generateRefreshTokenRecord = (
  clientId: string,
  userId: string,
  scopes: string[],
  defaultRefreshTokenExpiry = 2592000,
): RefreshToken => {
  const issuedAt = OAuthUtils.getCurrentTimestamp();
  return {
    token: OAuthUtils.generateRefreshToken(),
    client_id: clientId,
    user_id: userId,
    scopes,
    expires_at: issuedAt + defaultRefreshTokenExpiry,
    created_at: issuedAt,
  };
};
