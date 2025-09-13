import { useWebSocketStore } from '~/hooks/useWebSocket';
import { cn } from '~/lib/cn';

export function LogViewer() {
  const { logs, clearLogs } = useWebSocketStore();

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Logs</h2>
        <button
          onClick={clearLogs}
          className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80"
        >
          Clear
        </button>
      </div>

      <div className="bg-background rounded-lg border p-4 h-64 overflow-y-auto font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-muted-foreground">No logs yet...</div>
        ) : (
          <div className="space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className={cn(
                  'flex gap-2',
                  log.level === 'error' && 'text-destructive',
                  log.level === 'warn' && 'text-yellow-600',
                  log.level === 'debug' && 'text-muted-foreground',
                )}
              >
                <span className="text-muted-foreground">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>
                <span
                  className={cn(
                    'px-1 rounded',
                    log.level === 'error' && 'bg-destructive/20',
                    log.level === 'warn' && 'bg-yellow-600/20',
                    log.level === 'info' && 'bg-primary/10',
                    log.level === 'debug' && 'bg-muted',
                  )}
                >
                  {log.level.toUpperCase()}
                </span>
                <span className="text-primary">[{log.source}]</span>
                <span className="flex-1">{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
