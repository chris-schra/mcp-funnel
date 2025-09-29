import type { MCPRegistryClient } from '../registry-client.js';

/**
 * Registry ID to URL mapping for well-known registries.
 */
const REGISTRY_ID_MAPPING: Record<string, string> = {
  official: 'https://registry.modelcontextprotocol.io',
  // Future registry IDs can be added here
};

/**
 * Filters registries by name/ID, returning all if no filter specified.
 *
 * @param registries - Map of registry URL to client instances
 * @param registry - Optional registry name or ID to filter by
 * @returns Array of registry entries matching the filter
 */
export function filterRegistriesByName(
  registries: Map<string, MCPRegistryClient>,
  registry?: string,
): Array<[string, MCPRegistryClient]> {
  let registriesToSearch = Array.from(registries.entries());

  if (registry) {
    // First try to map registry ID to URL
    const registryUrl = REGISTRY_ID_MAPPING[registry.toLowerCase()];

    if (registryUrl) {
      // Exact match by registry ID
      registriesToSearch = registriesToSearch.filter(
        ([url]) => url === registryUrl,
      );
    } else {
      // Fallback to URL substring matching for custom registries
      registriesToSearch = registriesToSearch.filter(([url]) =>
        url.toLowerCase().includes(registry.toLowerCase()),
      );
    }
  }

  return registriesToSearch;
}

/**
 * Gets the registry ID mapping for external use.
 *
 * @returns Record of registry IDs to URLs
 */
export function getRegistryIdMapping(): Record<string, string> {
  return { ...REGISTRY_ID_MAPPING };
}
