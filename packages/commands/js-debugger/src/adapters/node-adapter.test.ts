import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import { SourceMapGenerator } from 'source-map';
import { NodeDebugAdapter } from './node-adapter.js';

// Pause semantics are well-covered in integration tests and session-manager tests
// Removed unit test for internal handleDebuggerPaused method after refactoring

// Runtime argument handling was moved to ProcessSpawner and is tested there
// See: packages/commands/js-debugger/src/adapters/node/process-spawner.test.ts

describe('NodeDebugAdapter source-map awareness', () => {
  it('maps TypeScript breakpoints and call frames to original sources', async () => {
    const projectRoot = path.join(process.cwd(), 'tmp', 'node-adapter-tests');
    const originalPath = path.join(projectRoot, 'src', 'index.ts');
    const generatedPath = path.join(projectRoot, 'dist', 'index.js');
    const generatedUrl = pathToFileURL(generatedPath).toString();

    const map = new SourceMapGenerator({ file: path.basename(generatedPath) });
    map.addMapping({
      source: originalPath,
      original: { line: 2, column: 0 },
      generated: { line: 10, column: 2 },
    });
    map.setSourceContent(
      originalPath,
      'export const value = 1;\nconsole.log(value);\n',
    );

    const sourceMapContent = map.toString();
    const encodedMap = Buffer.from(sourceMapContent, 'utf-8').toString(
      'base64',
    );

    const adapter = new NodeDebugAdapter();
    // Access the sourceMapHandler directly since the methods moved there
    // Access protected member for testing
    const sourceMapHandler = adapter.getSourceMapHandler();

    await sourceMapHandler.handleScriptParsed({
      scriptId: 'script-1',
      url: generatedUrl,
      sourceMapURL: `data:application/json;base64,${encodedMap}`,
    });

    const target = await sourceMapHandler.resolveBreakpointTarget(
      originalPath,
      2,
    );
    expect(target.url).toBe(generatedUrl);
    expect(target.lineNumber).toBe(9); // zero-based version of generated line 10
    expect(target.columnNumber).toBe(2);

    const mapped = sourceMapHandler.mapCallFrameToOriginal({
      callFrameId: '0',
      functionName: 'userFunction',
      location: {
        scriptId: 'script-1',
        lineNumber: target.lineNumber,
        columnNumber: target.columnNumber,
      },
      url: generatedUrl,
      scopeChain: [],
    });

    expect(mapped?.source).toBe(
      sourceMapHandler.normalizeFilePath(originalPath),
    );
    expect(mapped?.line).toBe(2);
    expect(mapped?.column).toBe(0);
  });
});
