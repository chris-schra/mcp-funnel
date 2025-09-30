/**
 * Utility for resolving tool names, including short name resolution
 */
import type { ProxyConfig } from '@mcp-funnel/schemas';

export interface ToolResolverResult {
  resolved: boolean;
  toolName?: string;
  error?: {
    message: string;
    isAmbiguous?: boolean;
    candidates?: string[];
    suggestions?: string[];
  };
}

/**
 * Resolve a tool name, including short name resolution if enabled
 * @param inputName - The tool name provided by the user
 * @param toolMapping - Map of full tool names to their clients
 * @param config - Proxy configuration
 * @returns Resolution result with either resolved name or error details
 */
export function resolveToolName(
  inputName: string,
  toolMapping: Map<string, unknown>,
  config: ProxyConfig,
): ToolResolverResult {
  // Direct lookup first
  if (toolMapping.has(inputName)) {
    return { resolved: true, toolName: inputName };
  }

  // Check if short name resolution is enabled
  const allowShort = config.allowShortToolNames === true;
  const looksShort = !inputName.includes('__');

  if (allowShort && looksShort) {
    // Try to find tools ending with __<shortname>
    const candidates = Array.from(toolMapping.keys()).filter((k) =>
      k.endsWith(`__${inputName}`),
    );

    if (candidates.length === 1) {
      // Unambiguous match found
      return { resolved: true, toolName: candidates[0] };
    } else if (candidates.length > 1) {
      // Ambiguous match
      const list = candidates.slice(0, 5);
      return {
        resolved: false,
        error: {
          message: `Ambiguous tool name: ${inputName}. Candidates: ${list.join(', ')}. Use the full prefixed name exactly as listed by discovery.`,
          isAmbiguous: true,
          candidates: list,
        },
      };
    }
  }

  // Tool not found - provide suggestions
  const lower = inputName.toLowerCase();
  const suggestions = Array.from(toolMapping.keys())
    .filter((k) => k.toLowerCase().includes(lower))
    .slice(0, 3);

  const hintParts = [
    `Tool not found: ${inputName}. Use discover_tools_by_words to find available tools.`,
  ];

  if (!looksShort || !allowShort) {
    hintParts.push(
      'To execute a tool, always use the fully prefixed name (e.g., "server__tool").',
    );
  }

  if (suggestions.length > 0) {
    hintParts.push(`Did you mean: ${suggestions.join(', ')}?`);
  }

  return {
    resolved: false,
    error: {
      message: hintParts.join(' '),
      suggestions,
    },
  };
}
