import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '~/lib/api';
import { cn } from '~/lib/cn';
import { useEffect } from 'react';

interface Server {
  name: string;
  status: 'connected' | 'error' | 'disconnected';
  error?: string;
}

interface ServersResponse {
  servers: Server[];
}

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

  if (isLoading) {
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

  return (
    <div className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold mb-4">Servers</h2>
      <div className="space-y-2">
        {(data as ServersResponse)?.servers?.map((server) => (
          <div
            key={server.name}
            className="flex items-center justify-between p-3 rounded-lg bg-secondary"
          >
            <div className="flex items-center gap-3">
              <div
                className={cn(
                  'h-2 w-2 rounded-full',
                  server.status === 'connected'
                    ? 'bg-green-500'
                    : server.status === 'error'
                      ? 'bg-red-500'
                      : 'bg-yellow-500',
                )}
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
                  onClick={() => reconnectMutation.mutate(server.name)}
                  disabled={reconnectMutation.isPending}
                  className="text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  Reconnect
                </button>
              )}
              {server.status === 'connected' && (
                <button
                  onClick={() => disconnectMutation.mutate(server.name)}
                  disabled={disconnectMutation.isPending}
                  className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
                >
                  Disconnect
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
