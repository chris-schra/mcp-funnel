import { ICDPClient, DebugState, ResumeHandler } from '../../types/index.js';

/**
 * Execute a step operation (stepOver, stepInto, stepOut)
 */
export async function executeStepOperation(
  cdpClient: ICDPClient,
  operation: 'Debugger.stepOver' | 'Debugger.stepInto' | 'Debugger.stepOut',
  resumeHandler: ResumeHandler | null,
  isConnected: boolean,
  setPaused: (paused: boolean) => void,
): Promise<DebugState> {
  if (!isConnected) {
    throw new Error('Not connected to debugger');
  }

  try {
    await cdpClient.send(operation);
    setPaused(false);

    if (resumeHandler) {
      resumeHandler();
    }

    return {
      status: 'running',
    };
  } catch (error) {
    const operationName = operation.split('.')[1];
    throw new Error(
      `Failed to ${operationName}: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
