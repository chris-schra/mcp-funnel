// NPM command with lookup and search functionality
export { NPMCommand } from './command.js';
export {
  NPMClient,
  PackageNotFoundError,
  NPMRegistryError,
} from './npm-client.js';
export type {
  PackageInfo,
  SearchResults,
  SearchResultItem,
  NPMPackageResponse,
  NPMSearchResponse,
} from './types.js';

import { NPMCommand } from './command.js';

// Export default instance for easy consumption
export default new NPMCommand();
