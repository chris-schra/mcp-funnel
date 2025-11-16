/**
 * Utility functions for MCP registry operations.
 *
 * This module contains pure functions and helpers extracted from RegistryContext
 * to reduce file size and improve maintainability.
 * @internal
 */

import type { ProxyConfig } from '@mcp-funnel/schemas';
import type { KeyValueInput, RegistrySearchResult, ServerDetail } from './types/registry.types.js';

/**
 * Converts headers from RegistryConfigEntry format to ServerConfig format.
 * @param headers - Headers in either object or array format
 * @returns Converted headers as a record object, or undefined if input is undefined
 * @internal
 */
export function convertHeaders(
  headers: Record<string, string> | KeyValueInput[] | undefined,
): Record<string, string> | undefined {
  if (!headers) {
    return undefined;
  }

  if (Array.isArray(headers)) {
    // Convert KeyValueInput[] to Record<string, string>
    const result: Record<string, string> = {};
    for (const header of headers) {
      result[header.name] = header.value || '';
    }
    return result;
  } else {
    // Already Record<string, string>
    return headers;
  }
}

/**
 * Extracts registry URLs from the proxy configuration.
 *
 * **MVP Implementation:** Returns default registry URL as registries configuration
 * is not yet defined in the main config schema.
 * **Phase 2:** Will extract actual registry URLs from config.registries field.
 * @param config - Proxy configuration object
 * @returns Array of registry URLs
 * @internal
 */
export function extractRegistryUrls(config: ProxyConfig): string[] {
  // MVP: Check for registries in config, fallback to default
  const registries = (config as ProxyConfig & { registries?: unknown }).registries;

  if (Array.isArray(registries)) {
    const validUrls = registries.filter(
      (url): url is string => typeof url === 'string' && url.length > 0,
    );
    if (validUrls.length > 0) {
      return validUrls;
    }
  }

  // For MVP, return default registry - will be extended in Phase 2
  console.info('[RegistryUtils] Using default registry URL');
  return ['https://registry.modelcontextprotocol.io'];
}

/**
 * Determines if a failed registry request should be retried.
 * This is a seam for future retry logic implementation.
 * @param _error - Error that occurred during the request
 * @param _attemptNumber - Current attempt number
 * @returns True if request should be retried, false otherwise
 * @internal
 */
export function shouldRetryRequest(_error: unknown, _attemptNumber: number): boolean {
  // MVP: No retry logic - will be implemented in future phase
  return false;
}

/**
 * Converts ServerDetail to RegistrySearchResult server entry format.
 * @param server - Server detail object from registry API
 * @returns Converted server entry for search results
 * @internal
 */
export function convertServerDetailToSearchResult(
  server: ServerDetail,
): NonNullable<RegistrySearchResult['servers']>[number] {
  return {
    name: server.name,
    description: server.description,
    registryId: server._meta?.['io.modelcontextprotocol.registry/official']?.id || server.id,
    isRemote: !!(server.remotes && server.remotes.length > 0),
    registryType:
      server.packages?.[0]?.registry_type ||
      server.registry_type ||
      (server.remotes && server.remotes.length > 0 ? 'remote' : 'unknown'),
  };
}

/**
 * Aggregates search results from multiple registries, handling errors gracefully.
 * @param searchResults - Array of results from each registry including errors
 * @returns Aggregated search result with combined servers and error messages
 * @internal
 */
export function aggregateSearchResults(
  searchResults: Array<{
    registryUrl: string;
    results: ServerDetail[];
    error: string | null;
  }>,
): RegistrySearchResult {
  const allResults: NonNullable<RegistrySearchResult['servers']> = [];
  const errors: string[] = [];

  // Aggregate results and collect errors
  for (const { registryUrl, results, error } of searchResults) {
    if (error) {
      errors.push(`${registryUrl}: ${error}`);
    } else {
      const convertedResults = results.map(convertServerDetailToSearchResult);
      allResults.push(...convertedResults);
    }
  }

  // Build response message
  let message: string;
  if (allResults.length > 0) {
    message = `Found ${allResults.length} servers`;
    if (errors.length > 0) {
      message += ` (${errors.length} registries had errors)`;
    }
  } else if (errors.length > 0) {
    message = `No servers found. Registry errors: ${errors.join(', ')}`;
  } else {
    message = 'No servers found';
  }

  console.info(
    `[RegistryUtils] Search completed: ${allResults.length} servers found, ${errors.length} errors`,
  );

  return {
    found: allResults.length > 0,
    servers: allResults,
    message,
  };
}
