# Development Guide

## 🚀 Development Scripts

```bash
yarn dev            # Run the development server with hot reload
yarn build          # Build the TypeScript code
yarn test           # Run all tests
yarn test:e2e       # Run end-to-end tests with mock servers
yarn validate       # Run comprehensive code quality checks (lint, typecheck, format)
yarn lint           # Run ESLint
yarn typecheck      # Run TypeScript type checking
yarn format         # Auto-format code with Prettier
```

## 🧪 Testing

Run the test suite:

```bash
yarn test           # Run all tests
yarn test:e2e       # Run end-to-end tests
yarn validate       # Run linting, type checking, and formatting checks
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

## 📦 Project Structure

```
mcp-funnel/
├── src/
│   ├── config/          # Configuration management
│   ├── proxy/           # MCP proxy implementation
│   ├── secrets/         # Secret provider system
│   ├── services/        # Core services
│   ├── types/           # TypeScript type definitions
│   └── utils/           # Utility functions
├── tests/
│   ├── unit/           # Unit tests
│   ├── integration/    # Integration tests
│   └── e2e/            # End-to-end tests
└── docs/               # Documentation
```

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
cp config/mcp-config.example.json config/mcp-config.json
# Edit config/mcp-config.json with your server configurations
```

4. Run development server:
```bash
yarn dev
```

## 🐛 Debugging

### Enable Debug Logging

Set the `DEBUG` environment variable:
```bash
DEBUG=mcp:* yarn dev
```

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