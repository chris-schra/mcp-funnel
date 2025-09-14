import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { ToolOverride } from '../config.js';

export class OverrideManager {
  constructor(overrides: Record<string, ToolOverride> = {}) {
    // Stub implementation
  }

  applyOverrides(tool: Tool, fullToolName: string): Tool {
    // Stub implementation - just return the original tool for now
    return tool;
  }
}
