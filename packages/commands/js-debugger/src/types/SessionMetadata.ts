/**
 * Session metadata for tracking activity and resource usage
 */
export interface SessionMetadata {
  createdAt: string;
  lastActivityAt: string;
  lastHeartbeatAt?: string;
  activityCount: number;
  resourceUsage: {
    consoleOutputSize: number;
    memoryEstimate: number;
  };
}
