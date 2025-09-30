import type { SessionActivity } from '../types/index.js';

/**
 * Session activity tracker implementation
 */
export class SessionActivityTracker implements SessionActivity {
  private activities = new Map<
    string,
    {
      lastActivity: string;
      activityCount: number;
      activities: Array<{ type: string; timestamp: string }>;
    }
  >();

  public recordActivity(
    sessionId: string,
    type: 'user_action' | 'console_output' | 'state_change' | 'heartbeat',
  ): void {
    const now = new Date().toISOString();
    const activity = this.activities.get(sessionId) || {
      lastActivity: now,
      activityCount: 0,
      activities: [],
    };

    activity.lastActivity = now;
    activity.activityCount++;
    activity.activities.push({ type, timestamp: now });

    // Keep only recent activities to prevent memory leaks
    if (activity.activities.length > 100) {
      activity.activities = activity.activities.slice(-50);
    }

    this.activities.set(sessionId, activity);
  }

  public getLastActivity(sessionId: string): string | undefined {
    return this.activities.get(sessionId)?.lastActivity;
  }

  public getActivityCount(sessionId: string): number {
    return this.activities.get(sessionId)?.activityCount || 0;
  }

  public isSessionActive(sessionId: string, thresholdMs: number): boolean {
    const activity = this.activities.get(sessionId);
    if (!activity) return false;

    const lastActivity = new Date(activity.lastActivity);
    const now = new Date();
    return now.getTime() - lastActivity.getTime() < thresholdMs;
  }

  public cleanup(): void {
    this.activities.clear();
  }

  public removeSession(sessionId: string): void {
    this.activities.delete(sessionId);
  }
}
