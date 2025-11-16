import type { RegistryServer, ServerDetail } from '../types/registry.types.js';

/**
 * HTTP response interface for registry API responses.
 */
interface RegistryResponse<T> {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<T>;
}

/**
 * Checks if a string is a valid UUID.
 * @param identifier - String to check for UUID format
 * @returns True if string is a valid UUID, false otherwise
 * @internal
 */
export function isUuid(identifier: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);
}

/**
 * Fetches server details directly from the registry API by UUID.
 * @param baseUrl - Base URL of the registry
 * @param uuid - Server UUID to fetch
 * @returns Server details or null if not found (404)
 * @throws Error on HTTP errors (non-404)
 * @internal
 */
export async function fetchServerByUuid(
  baseUrl: string,
  uuid: string,
): Promise<RegistryServer | null> {
  console.info(`[MCPRegistryClient] Using direct API endpoint for UUID: ${uuid}`);

  const response = (await fetch(`${baseUrl}/v0/servers/${uuid}`, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  })) as RegistryResponse<RegistryServer>;

  if (response.ok) {
    const server = await response.json();
    console.info(
      `[MCPRegistryClient] Server details retrieved for: ${uuid} (matched: ${server.name})`,
    );
    return server;
  }

  if (response.status === 404) {
    console.info(`[MCPRegistryClient] Server not found: ${uuid}`);
    return null;
  }

  // Log HTTP error with consistent format
  console.error(
    `[MCPRegistryClient] HTTP error during server fetch for ${uuid}: ${response.status} ${response.statusText}`,
  );
  throw new Error(`Registry server fetch failed: ${response.status} ${response.statusText}`);
}

/**
 * Finds a server by exact name match from search results.
 * @param servers - Array of server details to search
 * @param name - Server name to match (case-insensitive)
 * @returns Matching server or null if not found
 * @internal
 */
export function findServerByName(servers: ServerDetail[], name: string): RegistryServer | null {
  return servers.find((s) => s.name.toLowerCase() === name.toLowerCase()) || null;
}
