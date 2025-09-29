import type { NodeCDPConsoleAPICalledEventParams } from './types.js';
import { convertScriptUrlToFilePath, mapConsoleLevel } from './cdp-utils.js';
import { ConsoleMessage } from '../../types/index.js';

export function parseConsoleMessage(
  params: NodeCDPConsoleAPICalledEventParams,
): ConsoleMessage {
  const level = mapConsoleLevel(params.type);
  const args = params.args.map(
    (arg) => arg.value ?? arg.description ?? '[Object]',
  );
  const message = args.join(' ');

  const stackTrace = params.stackTrace?.callFrames.map((frame) => ({
    id: 0,
    functionName: frame.functionName,
    file: convertScriptUrlToFilePath(frame.url),
    line: frame.lineNumber + 1,
    column: frame.columnNumber,
  }));

  return {
    level,
    timestamp: new Date(params.timestamp).toISOString(),
    message,
    args,
    stackTrace,
  };
}
