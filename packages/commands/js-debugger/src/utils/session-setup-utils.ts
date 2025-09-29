import { DebugSession } from '../types/index.js';

/**
 * Set initial breakpoints for a session
 */
export async function setInitialBreakpoints(
  session: DebugSession,
  breakpoints: Array<{ file: string; line: number; condition?: string }>,
): Promise<void> {
  for (const bp of breakpoints) {
    try {
      const id = await session.adapter.setBreakpoint(
        bp.file,
        bp.line,
        bp.condition,
      );
      session.breakpoints.set(id, {
        id,
        file: bp.file,
        line: bp.line,
        condition: bp.condition,
      });
    } catch (error) {
      // Continue with other breakpoints even if one fails
      console.warn(`Failed to set breakpoint at ${bp.file}:${bp.line}:`, error);
    }
  }
}
