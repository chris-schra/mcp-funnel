import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { UseMutationResult } from '@tanstack/react-query';
import { api } from '~/lib/api.js';
import { cn } from '~/lib/cn.js';

interface Tool {
  name: string;
  serverName: string;
  description?: string;
  enabled: boolean;
}

interface ToolsResponse {
  tools: Tool[];
}

interface ToolExecutionPanelProps {
  tool: Tool;
  executeMutation: UseMutationResult<
    unknown,
    Error,
    { name: string; args?: Record<string, unknown> }
  >;
}

/**
 * Panel for executing a tool with optional JSON arguments and displaying results.
 *
 * @param tool - The tool to execute
 * @param executeMutation - The mutation object for tool execution
 * @returns React component for tool execution
 */
function ToolExecutionPanel({ tool, executeMutation }: ToolExecutionPanelProps) {
  const handleExecute = () => {
    const textarea = document.getElementById(
      `args-${tool.name}`,
    ) as HTMLTextAreaElement;
    let args = {};
    if (textarea.value) {
      try {
        args = JSON.parse(textarea.value);
      } catch {
        alert('Invalid JSON');
        return;
      }
    }
    executeMutation.mutate({ name: tool.name, args });
  };

  return (
    <div className="mt-4 pt-4 border-t">
      <h4 className="text-sm font-medium mb-2">Execute Tool</h4>
      <div className="space-y-2">
        <textarea
          placeholder="Enter arguments as JSON (optional)"
          className="w-full px-3 py-2 rounded border bg-background text-sm font-mono"
          rows={3}
          id={`args-${tool.name}`}
        />
        <button
          onClick={handleExecute}
          disabled={executeMutation.isPending}
          className="px-3 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 text-sm"
        >
          {executeMutation.isPending ? 'Executing...' : 'Execute'}
        </button>
      </div>

      {executeMutation.data ? (
        <div className="mt-4 p-3 rounded bg-muted">
          <h5 className="text-xs font-medium mb-1">Result:</h5>
          <pre className="text-xs overflow-auto">
            {JSON.stringify(executeMutation.data, null, 2)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

interface ToolListItemProps {
  tool: Tool;
  isSelected: boolean;
  onSelect: () => void;
  onToggle: () => void;
  executeMutation: UseMutationResult<
    unknown,
    Error,
    { name: string; args?: Record<string, unknown> }
  >;
}

/**
 * Renders a single tool item with toggle and execution capabilities.
 *
 * @param tool - The tool to display
 * @param isSelected - Whether this tool is currently selected
 * @param onSelect - Callback when tool is selected
 * @param onToggle - Callback when tool is toggled
 * @param executeMutation - The mutation object for tool execution
 * @returns React component for tool list item
 */
function ToolListItem({
  tool,
  isSelected,
  onSelect,
  onToggle,
  executeMutation,
}: ToolListItemProps) {
  return (
    <div
      className={cn(
        'p-3 rounded-lg border cursor-pointer transition-colors',
        isSelected ? 'bg-accent border-primary' : 'hover:bg-secondary',
      )}
      onClick={onSelect}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-medium">{tool.name}</h3>
            <span className="text-xs px-2 py-1 rounded bg-muted">
              {tool.serverName}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {tool.description || 'No description'}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
          className={cn(
            'text-xs px-2 py-1 rounded transition-colors',
            tool.enabled
              ? 'bg-green-500/20 text-green-700 hover:bg-green-500/30'
              : 'bg-muted hover:bg-muted/80',
          )}
        >
          {tool.enabled ? 'Enabled' : 'Disabled'}
        </button>
      </div>

      {isSelected && (
        <ToolExecutionPanel tool={tool} executeMutation={executeMutation} />
      )}
    </div>
  );
}

/**
 * Interactive tool browser and execution interface for MCP tools.
 *
 * Provides a searchable list of all available MCP tools across connected servers.
 * Users can enable/disable tools, view tool details, and execute tools with custom
 * JSON arguments. Results are displayed inline after execution. Automatically
 * refreshes when tools change via WebSocket events.
 *
 * Features:
 * - Real-time search filtering by tool name/description
 * - Toggle tool enabled/disabled state
 * - Execute tools with optional JSON arguments
 * - Display execution results as formatted JSON
 * - Visual feedback for tool state and execution progress
 *
 * @returns React component rendering the tool explorer interface
 *
 * @example
 * ```tsx
 * import { ToolExplorer } from '~/components/ToolExplorer.js';
 *
 * function Dashboard() {
 *   return (
 *     <div>
 *       <ToolExplorer />
 *     </div>
 *   );
 * }
 * ```
 *
 * @public
 */
export function ToolExplorer() {
  const [search, setSearch] = useState('');
  const [selectedTool, setSelectedTool] = useState<Tool | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['tools', search],
    queryFn: () => (search ? api.tools.search(search) : api.tools.list()),
    placeholderData: (previousData) => previousData,
  });

  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    };
    window.addEventListener('tools-changed', handler);
    return () => window.removeEventListener('tools-changed', handler);
  }, [queryClient]);

  const toggleMutation = useMutation({
    mutationFn: api.tools.toggle,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tools'] });
    },
  });

  const executeMutation = useMutation({
    mutationFn: ({
      name,
      args,
    }: {
      name: string;
      args?: Record<string, unknown>;
    }) => api.tools.execute(name, args),
  });

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="mb-4">
        <h2 className="text-lg font-semibold mb-2">Tools</h2>
        <input
          type="text"
          placeholder="Search tools..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full px-3 py-2 rounded-lg border bg-background"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <div className="h-20 bg-muted animate-pulse rounded" />
          <div className="h-20 bg-muted animate-pulse rounded" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {(data as ToolsResponse | undefined)?.tools?.map((tool) => (
            <ToolListItem
              key={tool.name}
              tool={tool}
              isSelected={selectedTool?.name === tool.name}
              onSelect={() => setSelectedTool(tool)}
              onToggle={() => toggleMutation.mutate(tool.name)}
              executeMutation={executeMutation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
