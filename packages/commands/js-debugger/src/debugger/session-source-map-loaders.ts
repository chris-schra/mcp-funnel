import { promises as fs } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RawSourceMap } from 'source-map';

// Simple cache to avoid re-fetching the same source map
export const sourceMapCache = new Map<string, RawSourceMap>();
export const MAX_SOURCE_MAP_SIZE = 10 * 1024 * 1024; // 10MB limit
export const NETWORK_TIMEOUT_MS = 5000;

/**
 * Loads a source map from a file:// URL.
 *
 * @param fileUrl - file:// URL pointing to source map
 * @returns Promise resolving to raw source map or undefined if loading fails
 */
export async function loadFileSourceMap(fileUrl: string): Promise<RawSourceMap | undefined> {
  try {
    const filePath = fileURLToPath(fileUrl);
    const content = await fs.readFile(filePath, 'utf8');

    if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_MAP_SIZE) {
      console.warn(`Source map too large (${fileUrl}), max size is ${MAX_SOURCE_MAP_SIZE} bytes`);
      return undefined;
    }

    return JSON.parse(content) as RawSourceMap;
  } catch (error) {
    console.warn(
      `Failed to load source map from file:// URL (${fileUrl}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Loads a source map from a file path (relative or absolute).
 *
 * @param filePath - Path to source map file
 * @param scriptDir - Directory to resolve relative paths against
 * @returns Promise resolving to raw source map or undefined if loading fails
 */
export async function loadFilePathSourceMap(
  filePath: string,
  scriptDir?: string,
): Promise<RawSourceMap | undefined> {
  try {
    const resolvedPath = path.isAbsolute(filePath)
      ? filePath
      : scriptDir
        ? path.resolve(scriptDir, filePath)
        : filePath;

    const content = await fs.readFile(resolvedPath, 'utf8');

    if (Buffer.byteLength(content, 'utf8') > MAX_SOURCE_MAP_SIZE) {
      console.warn(
        `Source map too large (${resolvedPath}), max size is ${MAX_SOURCE_MAP_SIZE} bytes`,
      );
      return undefined;
    }

    return JSON.parse(content) as RawSourceMap;
  } catch (error) {
    console.warn(
      `Failed to load source map from file path (${filePath}): ${error instanceof Error ? error.message : String(error)}`,
    );
    return undefined;
  }
}

/**
 * Loads a source map from an HTTP or HTTPS URL.
 *
 * @param url - HTTP(S) URL pointing to source map
 * @returns Promise resolving to raw source map or undefined if loading fails
 */
export async function loadHttpSourceMap(url: string): Promise<RawSourceMap | undefined> {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https://') ? https : http;

    const request = protocol.get(url, { timeout: NETWORK_TIMEOUT_MS }, (response) => {
      if (response.statusCode !== 200) {
        console.warn(`Failed to fetch source map (${url}): HTTP ${response.statusCode}`);
        request.destroy();
        resolve(undefined);
        return;
      }

      const chunks: Buffer[] = [];
      let totalSize = 0;

      response.on('data', (chunk: Buffer) => {
        totalSize += chunk.length;
        if (totalSize > MAX_SOURCE_MAP_SIZE) {
          console.warn(`Source map too large (${url}), max size is ${MAX_SOURCE_MAP_SIZE} bytes`);
          request.destroy();
          resolve(undefined);
          return;
        }
        chunks.push(chunk);
      });

      response.on('end', () => {
        try {
          const content = Buffer.concat(chunks).toString('utf8');
          const sourceMap = JSON.parse(content) as RawSourceMap;
          resolve(sourceMap);
        } catch (error) {
          console.warn(
            `Failed to parse source map JSON (${url}): ${error instanceof Error ? error.message : String(error)}`,
          );
          resolve(undefined);
        }
      });

      response.on('error', (error) => {
        console.warn(`Failed to fetch source map (${url}): ${error.message}`);
        resolve(undefined);
      });
    });

    request.on('timeout', () => {
      console.warn(`Source map fetch timed out (${url})`);
      request.destroy();
      resolve(undefined);
    });

    request.on('error', (error) => {
      console.warn(`Failed to fetch source map (${url}): ${error.message}`);
      resolve(undefined);
    });
  });
}
