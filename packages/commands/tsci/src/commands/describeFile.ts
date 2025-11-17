/**
 * Command handler for read_file/describe-file tool.
 *
 * For small files (&lt;300 lines): Returns full content with strategy='full'
 * For large files (≥300 lines): Returns YAML structure with receiptToken for deferred reading
 */

import { resolve, normalize, dirname } from 'node:path';
import { readFileSync } from 'node:fs';
import type { CallToolResult } from '@mcp-funnel/commands-core';
import { ReflectionKind, type DeclarationReflection } from 'typedoc';
import { validateFilePath, validateVerbosity } from '../util/validation.js';
import { createErrorResponse, createTextResponse } from '../util/responses.js';
import { generateReceiptToken } from '../util/receiptToken.js';
import type { DescribeFileArgs, CommandContext } from './types.js';

/**
 * Handles read_file tool execution.
 *
 * @param args - Validated and typed arguments
 * @param getContext - Function to get current command context
 * @param ensureEngine - Callback to ensure engine is initialized for a file
 * @returns CallToolResult with file content or YAML structure
 */
export async function describeFile(
  args: DescribeFileArgs,
  getContext: () => CommandContext,
  ensureEngine: (forFile?: string) => Promise<void>,
): Promise<CallToolResult> {
  // Validate file path
  const fileValidation = validateFilePath(args.file);
  if (!fileValidation.valid) {
    return createErrorResponse(fileValidation.error);
  }

  // Validate verbosity (optional, defaults to minimal)
  // Note: verbosity is validated for API consistency but not currently used in YAML output
  const verbosityValidation = validateVerbosity(args.verbosity);
  if (!verbosityValidation.valid) {
    return createErrorResponse(verbosityValidation.error);
  }

  // Normalize to absolute path
  const absolutePath = resolve(process.cwd(), fileValidation.value);

  // Read file content to determine strategy
  let content: string;
  try {
    content = readFileSync(absolutePath, 'utf-8');
  } catch (error) {
    return createErrorResponse(
      `Failed to read file: ${fileValidation.value}. ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const lines = content.split('\n').length;
  const tokenEstimate = lines * 5;

  // Small file: return full content as YAML
  if (lines < 300) {
    const { stringify: yamlStringify } = await import('yaml');
    const response = {
      strategy: 'full',
      file: absolutePath,
      lines,
      tokenEstimate,
      content,
    };

    return createTextResponse(yamlStringify(response, { lineWidth: 0 }));
  }

  // Large file: return YAML structure with receiptToken
  // Ensure engine is initialized with the correct tsconfig for this file
  await ensureEngine(absolutePath);

  // Refresh context after engine initialization
  const engineContext = getContext();
  if (!engineContext.engine) {
    return createErrorResponse('Engine initialization failed. Internal error.');
  }

  // Get DeclarationReflection objects from project for this file
  const project = engineContext.engine.getProject();
  if (!project) {
    return createErrorResponse('TypeDoc project not available. Engine initialization failed.');
  }

  // Query only top-level declarations (not their child signatures/members)
  // Children are still accessible via reflection.children for member extraction
  const topLevelKinds =
    ReflectionKind.Function |
    ReflectionKind.Class |
    ReflectionKind.Interface |
    ReflectionKind.TypeAlias |
    ReflectionKind.Enum |
    ReflectionKind.Variable |
    ReflectionKind.Namespace;

  const allReflections = project.getReflectionsByKind(topLevelKinds) as DeclarationReflection[];
  const fileReflections = allReflections.filter((reflection) => {
    const sourceFile = reflection.sources?.[0];
    const filePath = sourceFile?.fullFileName || sourceFile?.fileName;
    return filePath && normalize(filePath) === absolutePath;
  });

  if (fileReflections.length === 0) {
    return createErrorResponse(
      `No symbols found in file: ${fileValidation.value}. ` +
        `File may not exist or may not be part of the TypeScript project.`,
    );
  }

  // Get projectRoot from engine's tsconfig path
  const projectRoot = dirname(engineContext.engine.getTsconfigPath());

  // Format reflections as YAML with projectRoot for stable symbol IDs
  const yaml = engineContext.yamlFormatter.format(fileReflections, { projectRoot });

  // Generate receiptToken
  const token = generateReceiptToken(absolutePath);

  // Build complete YAML response with metadata
  // Parse the symbols YAML, add metadata fields, re-serialize as complete YAML
  const { parse: yamlParse, stringify: yamlStringify } = await import('yaml');
  const symbolsData = yamlParse(yaml);

  const completeResponse = {
    strategy: 'structure_only',
    file: absolutePath,
    receiptToken: token,
    lines,
    tokenEstimate,
    hint: `File has ${lines} lines. Use Read tool with receiptToken for full content, or read specific line ranges`,
    ...symbolsData, // Merge in symbols array
  };

  return createTextResponse(yamlStringify(completeResponse, { lineWidth: 0 }));
}
