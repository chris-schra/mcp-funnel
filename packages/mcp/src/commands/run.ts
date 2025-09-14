import { discoverCommands, CommandRegistry } from '@mcp-funnel/commands-core';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

export async function runCommand(name: string, args: string[]): Promise<void> {
  try {
    const registry = new CommandRegistry();

    // 1) Local development folder: <cwd>/packages/commands (monorepo style)
    const localCommandsPath = resolve(process.cwd(), 'packages/commands');
    try {
      const { existsSync } = await import('fs');
      if (existsSync(localCommandsPath)) {
        const localRegistry = await discoverCommands(localCommandsPath);
        for (const cmd of localRegistry.getAllCommandNames()) {
          const c = localRegistry.getCommandForCLI(cmd);
          if (c) registry.register(c);
        }
      }
    } catch {
      // ignore if not present
    }

    // 2) Bundled commands path (when running from source)
    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = dirname(__filename);
      const bundledPath = resolve(__dirname, '../../../commands');
      const { existsSync } = await import('fs');
      if (existsSync(bundledPath)) {
        const bundled = await discoverCommands(bundledPath);
        for (const cmd of bundled.getAllCommandNames()) {
          const c = bundled.getCommandForCLI(cmd);
          if (c) registry.register(c);
        }
      }
    } catch {
      // ignore
    }

    // 3) Zero-config auto-scan for installed command packages under node_modules/@mcp-funnel
    try {
      const scopeDir = resolve(process.cwd(), 'node_modules', '@mcp-funnel');
      const { readdirSync, existsSync } = await import('fs');
      if (existsSync(scopeDir)) {
        const entries = readdirSync(scopeDir, { withFileTypes: true });
        const packageDirs = entries
          .filter((e: any) => e.isDirectory?.() && e.name.startsWith('command-'))
          .map((e: any) => join(scopeDir, e.name));

        const isValidCommand = (obj: unknown): obj is import('@mcp-funnel/commands-core').ICommand => {
          if (!obj || typeof obj !== 'object') return false;
          const c = obj as any;
          return (
            typeof c.name === 'string' &&
            typeof c.description === 'string' &&
            typeof c.executeToolViaMCP === 'function' &&
            typeof c.executeViaCLI === 'function' &&
            typeof c.getMCPDefinitions === 'function'
          );
        };

        for (const pkgDir of packageDirs) {
          try {
            const pkgJsonPath = join(pkgDir, 'package.json');
            if (!existsSync(pkgJsonPath)) continue;
            const { readFile } = await import('fs/promises');
            const pkg = JSON.parse(await readFile(pkgJsonPath, 'utf-8')) as any;
            const entry = pkg.module || pkg.main;
            if (!entry) continue;
            const mod = await import(join(pkgDir, entry));
            const candidate = (mod as any).default || (mod as any).command || Object.values(mod as any)[0];
            if (isValidCommand(candidate)) {
              registry.register(candidate);
            }
          } catch {
            // skip invalid package
            continue;
          }
        }
      }
    } catch {
      // ignore
    }

    const command = registry.getCommandForCLI(name);
    if (!command) {
      console.error(`Command not found: ${name}`);
      console.error(
        `Available commands: ${registry.getAllCommandNames().join(', ')}`,
      );
      process.exit(1);
    }

    // Execute command via CLI interface
    await command.executeViaCLI(args);
  } catch (error) {
    console.error('Failed to run command:', error);
    process.exit(1);
  }
}
