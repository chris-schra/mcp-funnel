export interface StackFrame {
  id: number;
  functionName: string;
  file: string;
  line: number;
  column?: number;
}
