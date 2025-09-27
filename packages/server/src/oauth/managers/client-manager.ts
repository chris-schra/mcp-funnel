/**
 * Client management for OAuth provider
 * Handles client registration, validation, and secret rotation
 */

import type {
  IOAuthProviderStorage,
  OAuthProviderConfig,
  ClientRegistration,
  OAuthError,
} from '../../types/oauth-provider.js';

import {
  OAuthErrorCodes,
  GrantTypes,
  ResponseTypes,
} from '../../types/oauth-provider.js';

import {
  generateClientId,
  generateClientSecret,
  getCurrentTimestamp,
} from '../utils/oauth-utils.js';

export interface ClientRegistrationMetadata {
  client_name?: string;
  redirect_uris: string[];
  grant_types?: string[];
  response_types?: string[];
  scope?: string;
}

export interface ClientSecretRotationResult {
  success: boolean;
  client?: ClientRegistration;
  error?: OAuthError;
}

/**
 * Manages OAuth client lifecycle and operations
 */
export class ClientManager {
  constructor(
    private storage: IOAuthProviderStorage,
    private config: OAuthProviderConfig,
  ) {}

  /**
   * Register a new OAuth client
   */
  async registerClient(
    metadata: ClientRegistrationMetadata,
  ): Promise<ClientRegistration> {
    const { client_secret, client_secret_expires_at } =
      this.generateClientSecretMetadata();

    const client: ClientRegistration = {
      client_id: generateClientId(),
      client_secret,
      client_name: metadata.client_name,
      redirect_uris: metadata.redirect_uris,
      grant_types: metadata.grant_types || [GrantTypes.AUTHORIZATION_CODE],
      response_types: metadata.response_types || [ResponseTypes.CODE],
      scope: metadata.scope,
      client_id_issued_at: getCurrentTimestamp(),
      client_secret_expires_at,
    };

    await this.storage.saveClient(client);
    return client;
  }

  /**
   * Generate client secret with expiration metadata
   */
  private generateClientSecretMetadata(): {
    client_secret: string;
    client_secret_expires_at: number;
  } {
    const issuedAt = getCurrentTimestamp();
    const expiresIn = this.config.defaultClientSecretExpiry ?? 31536000;
    return {
      client_secret: generateClientSecret(),
      client_secret_expires_at: issuedAt + expiresIn,
    };
  }

  /**
   * Get client by ID
   */
  async getClient(clientId: string): Promise<ClientRegistration | null> {
    return this.storage.getClient(clientId);
  }

  /**
   * Rotate client secret
   */
  async rotateClientSecret(
    clientId: string,
    currentSecret: string,
  ): Promise<ClientSecretRotationResult> {
    const client = await this.storage.getClient(clientId);

    if (!client) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    if (!client.client_secret) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Client does not have a secret to rotate',
        },
      };
    }

    if (client.client_secret !== currentSecret) {
      return {
        success: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client secret',
        },
      };
    }

    const { client_secret, client_secret_expires_at } =
      this.generateClientSecretMetadata();

    const updatedClient: ClientRegistration = {
      ...client,
      client_secret,
      client_secret_expires_at,
    };

    await this.storage.saveClient(updatedClient);

    return { success: true, client: updatedClient };
  }

  /**
   * Delete a client
   */
  async deleteClient(clientId: string): Promise<void> {
    await this.storage.deleteClient(clientId);
  }

  /**
   * Validate that a client exists and is valid
   */
  async validateClientExists(clientId: string): Promise<{
    valid: boolean;
    client?: ClientRegistration;
    error?: OAuthError;
  }> {
    const client = await this.storage.getClient(clientId);
    if (!client) {
      return {
        valid: false,
        error: {
          error: OAuthErrorCodes.INVALID_CLIENT,
          error_description: 'Invalid client_id',
        },
      };
    }

    return { valid: true, client };
  }
}
