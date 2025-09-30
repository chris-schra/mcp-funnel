import { describe, it, expect } from 'vitest';
import {
  generateInstallInstructions,
  type RegistryServer,
} from './test-utils.js';

describe('Config Generation', () => {
  describe('generateInstallInstructions', () => {
    it('should generate helpful instructions for npm packages', () => {
      const server: RegistryServer = {
        id: 'npm-instructions',
        name: 'NPM Instructions Server',
        description: 'Server for testing npm installation instructions',
        packages: [
          {
            identifier: '@example/mcp-server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'API_KEY', is_required: true },
              { name: 'DEBUG', value: 'false' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('npm');
      expect(instructions).toContain('@example/mcp-server');
      expect(instructions).toContain('API_KEY');
      expect(instructions).toContain('required');
      expect(instructions).toContain('environment variable');
    });

    it('should generate helpful instructions for pypi packages', () => {
      const server: RegistryServer = {
        id: 'pypi-instructions',
        name: 'PyPI Instructions Server',
        description: 'Server for testing PyPI installation instructions',
        packages: [
          {
            identifier: 'mcp-python-server',
            registry_type: 'pypi',
            environment_variables: [{ name: 'PYTHON_PATH', is_required: true }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('pip');
      expect(instructions).toContain('mcp-python-server');
      expect(instructions).toContain('PYTHON_PATH');
      expect(instructions).toContain('uvx');
    });

    it('should generate helpful instructions for OCI containers', () => {
      const server: RegistryServer = {
        id: 'oci-instructions',
        name: 'OCI Instructions Server',
        description: 'Server for testing OCI installation instructions',
        packages: [
          {
            identifier: 'ghcr.io/example/server:latest',
            registry_type: 'oci',
            environment_variables: [{ name: 'CONTAINER_PORT', value: '3000' }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('Docker');
      expect(instructions).toContain('container');
      expect(instructions).toContain('ghcr.io/example/server:latest');
      expect(instructions).toContain('docker pull');
    });

    it('should generate helpful instructions for remote servers', () => {
      const server: RegistryServer = {
        id: 'remote-instructions',
        name: 'Remote Instructions Server',
        description: 'Server for testing remote connection instructions',
        remotes: [
          {
            type: 'sse',
            url: 'https://api.example.com/mcp',
            headers: [{ name: 'Authorization', value: 'Bearer ${API_TOKEN}' }],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('remote');
      expect(instructions).toContain('connection');
      expect(instructions).toContain('https://api.example.com/mcp');
      expect(instructions).toContain('API_TOKEN');
      expect(instructions).toContain('authentication');
    });

    it('should handle servers with no installation requirements', () => {
      const server: RegistryServer = {
        id: 'no-install',
        name: 'No Install Server',
        description: 'Server that requires no installation',
        packages: [
          {
            identifier: 'simple-server',
            registry_type: 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toBeTruthy();
      expect(instructions.length).toBeGreaterThan(0);
      expect(instructions).toContain('simple-server');
    });

    it('should provide fallback instructions for unknown types', () => {
      const server: RegistryServer = {
        id: 'unknown-instructions',
        name: 'Unknown Type Server',
        description: 'Server with unknown configuration',
        packages: [
          {
            identifier: 'unknown-package',
            registry_type: 'unknown' as 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('manual');
      expect(instructions).toContain('configuration');
      expect(instructions).toContain('unknown-package');
    });

    it('should mention required environment variables prominently', () => {
      const server: RegistryServer = {
        id: 'required-env',
        name: 'Required Environment Server',
        description: 'Server with required environment variables',
        packages: [
          {
            identifier: 'env-server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'REQUIRED_VAR1', is_required: true },
              { name: 'REQUIRED_VAR2', is_required: true },
              { name: 'OPTIONAL_VAR', value: 'default' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      expect(instructions).toContain('REQUIRED_VAR1');
      expect(instructions).toContain('REQUIRED_VAR2');
      expect(instructions).toContain('required');
      expect(instructions).toContain('environment');
      // Should mention both required variables
      const requiredMatches = instructions.match(/REQUIRED_VAR\d/g);
      expect(requiredMatches).toHaveLength(2);
    });

    it('should provide step-by-step format', () => {
      const server: RegistryServer = {
        id: 'step-by-step',
        name: 'Step by Step Server',
        description: 'Server for testing step-by-step instructions',
        packages: [
          {
            identifier: '@step/server',
            registry_type: 'npm',
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      // Should contain numbered steps or bullet points
      expect(instructions).toMatch(/\d+\.|•|-/);
      expect(instructions).toContain('configuration');
    });
  });
});
