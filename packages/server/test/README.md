# Server Package Tests

This directory contains integration tests for the `@mcp-funnel/server` package, specifically focusing on record format configuration handling.

## Test Structure

### Integration Tests (`test/integration/`)

#### `api-config-record-format.test.ts`
Tests the API config endpoint (`/config`) with record format configurations:
- Single server record format handling
- Multiple servers record format handling
- Empty configurations and defaults
- Configuration updates via PATCH requests
- Error handling for invalid requests

**Key Test Scenarios:**
- Verifies the API correctly maps record format servers to array format in responses
- Ensures environment variables are excluded from API responses for security
- Tests configuration updates and tool list change notifications

#### `dev-loader-record-format.test.ts`
Tests the dev loader (`dev.ts`) configuration loading with record format:
- Record format configuration file loading
- Configuration file discovery (environment variable vs default path)
- Error handling for malformed JSON and missing files
- Validation scenarios for different record format structures

**Key Test Scenarios:**
- Verifies the `loadConfig` function can handle both array and record format configurations
- Tests fallback behavior when configuration files don't exist or are invalid
- Validates record format with minimal, full, and complex server configurations

#### `record-format-normalization.test.ts`
Tests the normalization logic that converts record format to array format:
- Record format to array format conversion
- Array format pass-through (unchanged)
- Edge cases (empty, single server, special characters in names)
- Full integration flow demonstration

**Key Test Scenarios:**
- Demonstrates the complete flow from config file → normalization → API response
- Verifies that server names with special characters are preserved
- Tests that all server configuration options (command, args, env) are maintained

## Running Tests

```bash
# Run all tests
yarn test

# Run tests in watch mode
yarn vitest

# Run only integration tests
yarn test:run test/integration/

# Run a specific test file
yarn test:run test/integration/api-config-record-format.test.ts
```

## Test Coverage

These integration tests verify that:

1. **API Config Endpoint** correctly handles record format configurations by:
   - Converting internal record format to the expected API response format
   - Properly excluding sensitive information (env variables)
   - Supporting configuration updates and change notifications

2. **Dev Loader** correctly loads record format configurations by:
   - Reading and parsing configuration files in both formats
   - Falling back to empty configuration when files are missing/invalid
   - Supporting environment variable configuration paths

3. **Record Format Normalization** works correctly by:
   - Converting record format to array format for internal processing
   - Preserving all server configuration details
   - Handling edge cases and validation scenarios

## Configuration Format Support

The tests verify support for both legacy array format and new record format:

**Array Format (Legacy):**
```json
{
  "servers": [
    { "name": "github", "command": "docker", "args": ["run", "github-mcp"] }
  ]
}
```

**Record Format (New):**
```json
{
  "servers": {
    "github": { "command": "docker", "args": ["run", "github-mcp"] }
  }
}
```

Both formats are supported and tested to ensure backward compatibility and new functionality work correctly.