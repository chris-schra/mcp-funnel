import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~/lib/api.js';
import { cn } from '~/lib/cn.js';
import { useEffect } from 'react';

interface Server {
  name: string;
  status: 'connected' | 'error' | 'disconnected';
  error?: string;
}

interface ServersResponse {
  servers: Server[];
}

/**
 * Maps server status to corresponding Tailwind CSS color class.
 *
 * @param status - The current server status
 * @returns Tailwind CSS background color class
 */
function getStatusColor(status: Server['status']): string {
  if (status === 'connected') return 'bg-green-500';
  if (status === 'error') return 'bg-red-500';
  return 'bg-yellow-500';
}

/**
 * Loading skeleton displayed while server data is being fetched.
 *
 * @returns React component with animated placeholder elements
 */
function LoadingSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Servers</h2>
      <div className="space-y-2">
        <div className="h-12 bg-muted animate-pulse rounded" />
        <div className="h-12 bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}

interface ServerItemProps {
  server: Server;
  onReconnect: (name: string) => void;
  onDisconnect: (name: string) => void;
  isReconnecting: boolean;
  isDisconnecting: boolean;
}

/**
 * Individual server item with status indicator and action buttons.
 *
 * @param props - Component props
 * @returns React component rendering a server card
 */
function ServerItem({
  server,
  onReconnect,
  onDisconnect,
  isReconnecting,
  isDisconnecting,
}: ServerItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg bg-secondary">
      <div className="flex items-center gap-3">
        <div
          className={cn('h-2 w-2 rounded-full', getStatusColor(server.status))}
        />
        <div>
          <div className="font-medium">{server.name}</div>
          {server.error && (
            <div className="text-xs text-destructive">{server.error}</div>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {server.status !== 'connected' && (
          <button
            onClick={() => onReconnect(server.name)}
            disabled={isReconnecting}
            className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            Reconnect
          </button>
        )}
        {server.status === 'connected' && (
          <button
            onClick={() => onDisconnect(server.name)}
            disabled={isDisconnecting}
            className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Server status list component with connection management controls.
 *
 * Displays all configured MCP servers with real-time status indicators
 * (connected, disconnected, error). Provides reconnect/disconnect buttons
 * based on server state. Auto-refreshes every 5 seconds and responds to
 * WebSocket events for immediate updates.
 *
 * Status indicators:
 * - Green: Server is connected and operational
 * - Red: Server encountered an error
 * - Yellow: Server is disconnected
 *
 * @returns React component rendering the server list interface
 *
 * @example
 * ```tsx
 * import { ServerList } from '~/components/ServerList.js';
 *
 * function Dashboard() {
 *   return (
 *     <div>
 *       <ServerList />
 *     </div>
 *   );
 * }
 * ```
 *
 * @public
 */
export function ServerList() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: api.servers.list,
    refetchInterval: 5000,
  });

  // Refetch on WebSocket events
  useEffect(() => {
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    };
    window.addEventListener('servers-changed', handler);
    return () => window.removeEventListener('servers-changed', handler);
  }, [queryClient]);

  const reconnectMutation = useMutation({
    mutationFn: api.servers.reconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: api.servers.disconnect,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  if (isLoading) return <LoadingSkeleton />;

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Servers</h2>
      <div className="space-y-2">
        {(data as ServersResponse)?.servers?.map((server) => (
          <ServerItem
            key={server.name}
            server={server}
            onReconnect={reconnectMutation.mutate}
            onDisconnect={disconnectMutation.mutate}
            isReconnecting={reconnectMutation.isPending}
            isDisconnecting={disconnectMutation.isPending}
          />
        ))}
      </div>
    </div>
  );
}
