import type { ResourceTracker } from '../types/index.js';

/**
 * Resource tracker implementation for monitoring session resources
 */
export class SessionResourceTracker implements ResourceTracker {
  private resources = new Map<
    string,
    Map<string, { type: string; createdAt: string }>
  >();

  trackResource(
    sessionId: string,
    resourceId: string,
    type: 'process' | 'connection' | 'timer',
  ): void {
    if (!this.resources.has(sessionId)) {
      this.resources.set(sessionId, new Map());
    }
    const sessionResources = this.resources.get(sessionId)!;
    sessionResources.set(resourceId, {
      type,
      createdAt: new Date().toISOString(),
    });
  }

  releaseResource(sessionId: string, resourceId: string): void {
    const sessionResources = this.resources.get(sessionId);
    if (sessionResources) {
      sessionResources.delete(resourceId);
      if (sessionResources.size === 0) {
        this.resources.delete(sessionId);
      }
    }
  }

  getResourceCount(sessionId: string): number {
    return this.resources.get(sessionId)?.size || 0;
  }

  getAllResources(sessionId: string): Array<{ id: string; type: string }> {
    const sessionResources = this.resources.get(sessionId);
    if (!sessionResources) return [];

    return Array.from(sessionResources.entries()).map(([id, resource]) => ({
      id,
      type: resource.type,
    }));
  }

  cleanup(): void {
    this.resources.clear();
  }
}
