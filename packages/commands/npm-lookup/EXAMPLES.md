# NPM Command Examples

This document provides real-world usage examples for the NPM command in various scenarios.

## Table of Contents

1. [Package Research](#package-research)
2. [Dependency Analysis](#dependency-analysis)
3. [Technology Exploration](#technology-exploration)
4. [Security Assessment](#security-assessment)
5. [CLI Examples](#cli-examples)
6. [Error Scenarios](#error-scenarios)
7. [Advanced Workflows](#advanced-workflows)

## Package Research

### Finding the Right Testing Framework

**Scenario**: You need a testing framework for a new TypeScript project.

```bash
# Search for testing frameworks
npx mcp-funnel run npm search "typescript testing framework"

# Example output:
# 1. jest (Score: 0.92)
#    Version: 29.7.0
#    Description: Delightful JavaScript Testing Framework with a focus on simplicity.
#    Keywords: testing, javascript, jest, unit, integration, test
#
# 2. vitest (Score: 0.88)
#    Version: 0.34.6
#    Description: A blazing fast unit test framework powered by Vite.
#    Keywords: vite, vitest, test, testing, unit, fast

# Get detailed info about the top candidate
npx mcp-funnel run npm lookup jest
```

**Expected Jest Lookup Output**:

```
Package Information:

Name: jest
Version: 29.7.0
Description: Delightful JavaScript Testing Framework with a focus on simplicity.

Author: Meta Platforms, Inc.
License: MIT
Homepage: https://jestjs.io/

Repository:
  Type: git
  URL: git+https://github.com/jestjs/jest.git

Keywords: testing, javascript, jest, unit, integration, test, snapshot, runner, framework

Dependencies:
  @jest/core: ^29.7.0
  @jest/types: ^29.6.3
  import-local: ^3.0.2
  jest-cli: ^29.7.0

Published: 2023-10-04T14:20:36.000Z
Downloads: ~50,000,000 weekly
```

### Comparing Similar Packages

**Scenario**: Choosing between date manipulation libraries.

```bash
# Compare popular date libraries
npx mcp-funnel run npm search "date manipulation" --limit 5
npx mcp-funnel run npm lookup moment
npx mcp-funnel run npm lookup dayjs
npx mcp-funnel run npm lookup date-fns
```

## Dependency Analysis

### Understanding Package Dependencies

**Scenario**: Before adding a package, understand its dependency footprint.

```bash
# Check Express.js dependencies
npx mcp-funnel run npm lookup express
```

**Expected Output (Dependencies Section)**:

```
Dependencies:
  accepts: ^1.3.8
  array-flatten: 1.1.1
  body-parser: 1.20.1
  content-disposition: 0.5.4
  cookie: 0.5.0
  cookie-signature: 1.0.6
  debug: 2.6.9
  depd: 2.0.0
  destroy: 1.2.0
  encodeurl: 1.0.2
  escape-html: 1.0.3
  etag: 1.8.1
  finalhandler: 1.2.0
  fresh: 0.5.2
  http-errors: 2.0.0
  merge-descriptors: 1.0.1
  methods: 1.1.2
  on-finished: 2.4.1
  parseurl: 1.3.3
  path-to-regexp: 0.1.7
  proxy-addr: 2.0.7
  qs: 6.11.0
  range-parser: 1.2.1
  safe-buffer: 5.2.1
  send: 0.18.0
  serve-static: 1.15.0
  setprototypeof: 1.2.0
  statuses: 2.0.1
  type-is: 1.6.18
  utils-merge: 1.0.1
  vary: 1.1.2
```

### Checking for TypeScript Support

**Scenario**: Verify if a package includes TypeScript definitions.

```bash
# Check if package includes types
npx mcp-funnel run npm lookup lodash

# Look for TypeScript definitions separately
npx mcp-funnel run npm lookup @types/lodash
```

## Technology Exploration

### Discovering React Ecosystem Tools

**Scenario**: Building a React application and need to explore available tools.

```bash
# Find React state management solutions
npx mcp-funnel run npm search "react state management" --limit 10

# Find React testing utilities
npx mcp-funnel run npm search "react testing" --limit 5

# Get details on popular options
npx mcp-funnel run npm lookup redux
npx mcp-funnel run npm lookup zustand
npx mcp-funnel run npm lookup @testing-library/react
```

### Exploring Build Tools

**Scenario**: Comparing modern build tools for a project.

```bash
# Search for build tools
npx mcp-funnel run npm search "build tool bundler" --limit 8

# Compare specific tools
npx mcp-funnel run npm lookup webpack
npx mcp-funnel run npm lookup vite
npx mcp-funnel run npm lookup esbuild
npx mcp-funnel run npm lookup rollup
```

## Security Assessment

### Checking Package Maintenance

**Scenario**: Assess if a package is actively maintained.

```bash
# Check package details for maintenance indicators
npx mcp-funnel run npm lookup some-package-name
```

**Look for these indicators in the output**:

- Recent `Published` date
- Active maintainers list
- Repository URL (check GitHub activity)
- Download statistics
- License information

### Finding Security-Focused Packages

**Scenario**: Need security utilities for your application.

```bash
# Find security-related packages
npx mcp-funnel run npm search "security validation sanitization"
npx mcp-funnel run npm search "authentication jwt"

# Check specific security packages
npx mcp-funnel run npm lookup helmet
npx mcp-funnel run npm lookup validator
npx mcp-funnel run npm lookup bcrypt
```

## CLI Examples

### Basic Package Lookup

```bash
# Popular frameworks
npx mcp-funnel run npm lookup react
npx mcp-funnel run npm lookup vue
npx mcp-funnel run npm lookup angular

# Utility libraries
npx mcp-funnel run npm lookup lodash
npx mcp-funnel run npm lookup ramda
npx mcp-funnel run npm lookup underscore

# Development tools
npx mcp-funnel run npm lookup typescript
npx mcp-funnel run npm lookup eslint
npx mcp-funnel run npm lookup prettier
```

### Search Queries

```bash
# Broad searches
npx mcp-funnel run npm search "web framework"
npx mcp-funnel run npm search "database orm"
npx mcp-funnel run npm search "css framework"

# Specific functionality
npx mcp-funnel run npm search "image processing"
npx mcp-funnel run npm search "pdf generation"
npx mcp-funnel run npm search "email validation"

# Technology-specific
npx mcp-funnel run npm search "react component library"
npx mcp-funnel run npm search "node.js middleware"
npx mcp-funnel run npm search "typescript utilities"
```

## Error Scenarios

### Package Not Found

```bash
npx mcp-funnel run npm lookup nonexistent-package-xyz123

# Expected output:
# Error: Package "nonexistent-package-xyz123" not found on NPM registry
```

### Network Issues

```bash
# When NPM registry is unreachable
npx mcp-funnel run npm lookup express

# Potential output during network issues:
# Error: Failed to fetch package "express": getaddrinfo ENOTFOUND registry.npmjs.org
```

### Invalid Search Query

```bash
# Empty or very short queries may return unexpected results
npx mcp-funnel run npm search ""
npx mcp-funnel run npm search "a"
```

### Rate Limiting

```bash
# After many rapid requests
npx mcp-funnel run npm search "test"

# Potential output:
# Error: NPM registry returned 429: Too Many Requests
# Please wait before making additional requests.
```

## Advanced Workflows

### Package Comparison Workflow

**Scenario**: Systematically compare multiple packages for the same purpose.

```bash
#!/bin/bash
# compare-frameworks.sh

echo "Comparing web frameworks..."

# Get basic info
frameworks=("express" "koa" "fastify" "hapi")

for fw in "${frameworks[@]}"; do
    echo "=== $fw ==="
    npx mcp-funnel run npm lookup "$fw"
    echo ""
    sleep 1  # Respect rate limits
done
```

### Dependency Tree Analysis

**Scenario**: Analyze the full dependency chain of a package.

```bash
# Start with main package
npx mcp-funnel run npm lookup webpack

# Then look at key dependencies
npx mcp-funnel run npm lookup webpack-cli
npx mcp-funnel run npm lookup webpack-dev-server

# Check for peer dependencies
npx mcp-funnel run npm lookup @webpack-cli/serve
```

### Technology Stack Discovery

**Scenario**: Build a complete technology stack by discovering compatible packages.

```bash
# 1. Find base framework
npx mcp-funnel run npm search "node.js web framework" --limit 3

# 2. Find database tools
npx mcp-funnel run npm search "postgresql orm" --limit 3

# 3. Find authentication
npx mcp-funnel run npm search "jwt authentication middleware"

# 4. Find validation
npx mcp-funnel run npm search "request validation schema"

# 5. Get details on selected packages
npx mcp-funnel run npm lookup express
npx mcp-funnel run npm lookup prisma
npx mcp-funnel run npm lookup passport
npx mcp-funnel run npm lookup joi
```

### Package Trend Analysis

**Scenario**: Research trending packages in a specific domain.

```bash
# Find React state management trends
npx mcp-funnel run npm search "react state" --limit 10

# Check download stats and recency for top results
npx mcp-funnel run npm lookup redux
npx mcp-funnel run npm lookup zustand
npx mcp-funnel run npm lookup recoil
npx mcp-funnel run npm lookup jotai

# Compare based on:
# - Published dates (how recent)
# - Download numbers (in description)
# - Dependency count (complexity)
# - Maintenance activity (recent updates)
```

## Integration with Other MCP Tools

### Combined Workflows

When using NPM command alongside other MCP Funnel tools:

```bash
# 1. Search for packages
npx mcp-funnel run npm search "typescript testing"

# 2. Get detailed package info
npx mcp-funnel run npm lookup jest

# 3. Use filesystem tools to check if already installed
# (This would use filesystem MCP server if configured)

# 4. Use web tools to visit package homepage
# (This would use web browsing MCP server if configured)
```

## Performance Tips

1. **Use Caching**: Results are cached for 5 minutes, so repeated lookups are fast
2. **Limit Search Results**: Use `--limit` parameter to get focused results
3. **Specific Queries**: More specific search terms yield better, faster results
4. **Batch Operations**: Space out multiple requests to avoid rate limiting

## Troubleshooting

### Debug Output

Enable debug logging to see detailed information:

```bash
DEBUG=mcp-funnel:npm npx mcp-funnel run npm lookup express

# This will show:
# - Cache hits/misses
# - API request URLs
# - Response times
# - Error details
```

### Common Solutions

1. **Slow responses**: Check internet connection and NPM registry status
2. **Empty search results**: Try broader or different search terms
3. **Package info incomplete**: Some packages may have minimal metadata
4. **Version conflicts**: Always check the latest version in package info

---

For more examples and advanced usage patterns, see the [NPM Command README](./README.md) and [MCP Funnel Documentation](../../../README.md).
