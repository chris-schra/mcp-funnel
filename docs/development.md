# Development Guide

## 🚀 Development Scripts

```bash
yarn build          # Build the TypeScript code
yarn test           # Run "fast" tests
yarn test:e2e       # Run end-to-end tests with mock servers
yarn validate       # Run comprehensive code quality checks (lint, typecheck, prettier)
```

The project includes comprehensive e2e tests simulating Claude SDK conversations with mock MCP servers.

### Test Structure

- **Unit tests**: Test individual components and utilities in isolation
- **E2E tests**: Simulate full Claude SDK conversations with mock MCP servers
- **Integration tests**: Test the interaction between components

### Writing Tests

When adding new features:
1. Write unit tests for pure functions and utilities
2. Add integration tests for component interactions
3. Create E2E tests for critical user flows
4. Ensure all tests pass before submitting PR

## 🔧 Local Development Setup

1. Clone the repository:
```bash
git clone https://github.com/chris-schra/mcp-funnel.git
cd mcp-funnel
```

2. Install dependencies:
```bash
yarn install
```

3. Set up your configuration:
```bash
cp .mcp-funnel.example.json .mcp-funnel.json
# Edit .mcp-funnel.json with the servers you want to proxy
```

4. Run development server:
```bash
cd packages/server
yarn dev
```

## 🐛 Debugging

### Enable Debug Logging

Enable structured logging with:

```bash
MCP_FUNNEL_LOG=1 MCP_FUNNEL_LOG_LEVEL=debug yarn dev
```

`MCP_FUNNEL_LOG` toggles log emission; `MCP_FUNNEL_LOG_LEVEL` accepts `error`, `warn`, `info`, `debug`, or `trace`.

### Common Issues

1. **Server connection failures**: Check that server command paths are correct
2. **Permission errors**: Ensure proper file system permissions for server executables
3. **Port conflicts**: Make sure the MCP Funnel port (default: 3100) is available

## 💻 Code Standards

### TypeScript
- Strict mode enabled
- No `any` types without justification
- Use generics appropriately
- Follow existing patterns in codebase

### Code Style
- ESLint and Prettier are configured
- Run `yarn validate` before committing
- Follow conventional commit messages

### Best Practices
- Write tests for new features
- Update documentation when adding features
- Keep functions small and focused
- Use meaningful variable names
- Add JSDoc comments for public APIs
