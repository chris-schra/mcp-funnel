const API_BASE = '/api';

export const api = {
  servers: {
    list: async () => {
      const res = await fetch(`${API_BASE}/servers`);
      if (!res.ok) throw new Error('Failed to fetch servers');
      return res.json();
    },

    reconnect: async (name: string) => {
      const res = await fetch(`${API_BASE}/servers/${name}/reconnect`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to reconnect server');
      return res.json();
    },

    disconnect: async (name: string) => {
      const res = await fetch(`${API_BASE}/servers/${name}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to disconnect server');
      return res.json();
    },
  },

  tools: {
    list: async () => {
      const res = await fetch(`${API_BASE}/tools`);
      if (!res.ok) throw new Error('Failed to fetch tools');
      return res.json();
    },

    search: async (query: string) => {
      const res = await fetch(
        `${API_BASE}/tools/search?q=${encodeURIComponent(query)}`,
      );
      if (!res.ok) throw new Error('Failed to search tools');
      return res.json();
    },

    execute: async (name: string, args?: Record<string, unknown>) => {
      const res = await fetch(`${API_BASE}/tools/${name}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toolName: name, arguments: args }),
      });
      if (!res.ok) throw new Error('Failed to execute tool');
      return res.json();
    },

    toggle: async (name: string) => {
      const res = await fetch(`${API_BASE}/tools/${name}/toggle`, {
        method: 'PATCH',
      });
      if (!res.ok) throw new Error('Failed to toggle tool');
      return res.json();
    },
  },

  config: {
    get: async () => {
      const res = await fetch(`${API_BASE}/config`);
      if (!res.ok) throw new Error('Failed to fetch config');
      return res.json();
    },

    update: async (updates: Record<string, unknown>) => {
      const res = await fetch(`${API_BASE}/config`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error('Failed to update config');
      return res.json();
    },
  },
};
