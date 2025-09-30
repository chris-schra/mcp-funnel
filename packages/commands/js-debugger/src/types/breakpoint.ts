export interface BreakpointLocation {
  file: string;
  line: number;
  column: number | undefined;
}

export interface BreakpointRegistration {
  id: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
}

export interface BreakpointInfo {
  id: string;
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
}

export interface BreakpointStatusEntry {
  file: string;
  line: number;
  condition?: string;
  verified: boolean;
  resolvedLocations?: BreakpointLocation[];
  status?: 'not-registered' | 'pending';
  message?: string;
}

export interface BreakpointStatusSummary {
  requested: number;
  set: number;
  pending: BreakpointStatusEntry[];
}
