import type { MetaFunction } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { ServerList } from '~/components/ServerList.js';
import { ToolExplorer } from '~/components/ToolExplorer.js';
import { LogViewer } from '~/components/LogViewer.js';
import { useWebSocket } from '~/hooks/useWebSocket.js';

export const meta: MetaFunction = () => {
  return [
    { title: 'MCP Funnel Dashboard' },
    { name: 'description', content: 'Manage and monitor your MCP servers' },
  ];
};

export default function Index() {
  const { isConnected } = useWebSocket();

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error('Failed to fetch health');
      return res.json();
    },
    refetchInterval: 30000, // Check health every 30 seconds
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">MCP Funnel</h1>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div
                  className={`h-2 w-2 rounded-full ${
                    isConnected ? 'bg-green-500' : 'bg-red-500'
                  }`}
                />
                <span className="text-sm text-muted-foreground">
                  {isConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                v{health?.version || '0.0.1'}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1">
            <ServerList />
          </div>
          <div className="lg:col-span-2">
            <ToolExplorer />
          </div>
        </div>

        <div className="mt-8">
          <LogViewer />
        </div>
      </main>
    </div>
  );
}
