import { describe, it, expect } from 'vitest';
import { generateInstallInstructions, type RegistryServer } from './test-utils.js';

describe('Config Generation', () => {
  describe('generateInstallInstructions - JSON Validity', () => {
    it('should generate valid JSON with properly quoted string environment variables', () => {
      const server: RegistryServer = {
        id: 'test-server',
        name: 'Test Server',
        description: 'Test server with environment variables',
        packages: [
          {
            identifier: '@test/server',
            registry_type: 'npm',
            environment_variables: [
              { name: 'NODE_ENV', value: 'production' },
              { name: 'API_KEY', value: 'sk-1234567890' },
              { name: 'PORT', value: '8080' },
              { name: 'DEBUG', value: 'true' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);

      // Extract JSON from markdown code block
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const jsonContent = jsonMatch[1];

        // The output is a JSON snippet meant to be part of a larger config
        // Wrap it in braces to make it valid standalone JSON
        const wrappedJson = `{${jsonContent}}`;

        // This should NOT throw if JSON is valid
        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        // Verify the parsed values
        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Test Server'];
        expect(serverConfig.env.NODE_ENV).toBe('production');
        expect(serverConfig.env.API_KEY).toBe('sk-1234567890');
        expect(serverConfig.env.PORT).toBe('8080');
        expect(serverConfig.env.DEBUG).toBe('true');
      }
    });

    it('should emit valid JSON when package arguments contain quotes', () => {
      const server: RegistryServer = {
        id: 'quoted-args-server',
        name: 'Quoted Args Server',
        description: 'Server with quoted package arguments',
        packages: [
          {
            identifier: '@quote/server',
            registry_type: 'npm',
            package_arguments: ['--flag="value"'],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const wrappedJson = `{${jsonMatch[1]}}`;

        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Quoted Args Server'];
        expect(serverConfig.command).toBe('npx');
        expect(serverConfig.args).toEqual(['-y', '@quote/server', '--flag="value"']);
      }
    });

    it('should emit valid JSON when remote headers contain quotes', () => {
      const server: RegistryServer = {
        id: 'quoted-headers-remote',
        name: 'Quoted Headers Remote',
        description: 'Remote server with quoted header values',
        remotes: [
          {
            type: 'sse',
            url: 'https://remote.example.com/mcp',
            headers: [
              { name: 'Authorization', value: 'Bearer "token"' },
              { name: 'X-Custom-Header', value: 'Value with "quotes"' },
            ],
          },
        ],
      };

      const instructions = generateInstallInstructions(server);
      const jsonMatch = instructions.match(/```json\n([\s\S]*?)\n```/);
      expect(jsonMatch).toBeTruthy();

      if (jsonMatch) {
        const wrappedJson = `{${jsonMatch[1]}}`;

        expect(() => JSON.parse(wrappedJson)).not.toThrow();

        const parsed = JSON.parse(wrappedJson);
        const serverConfig = parsed['Quoted Headers Remote'];
        expect(serverConfig.transport).toBe('sse');
        expect(serverConfig.url).toBe('https://remote.example.com/mcp');
        expect(serverConfig.headers.Authorization).toBe('Bearer "token"');
        expect(serverConfig.headers['X-Custom-Header']).toBe('Value with "quotes"');
      }
    });
  });
});
