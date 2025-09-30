import type { IResponseFormatter } from './IResponseFormatter.js';
import type { ISessionValidator } from './ISessionValidator.js';
import type { IMockSessionManager } from './IMockSessionManager.js';
import type { ISessionManager } from './ISessionManager.js';

/**
 * Shared context available to all tool handlers
 */
export interface ToolHandlerContext {
  sessionManager: ISessionManager;
  responseFormatter: IResponseFormatter;
  sessionValidator: ISessionValidator;
  mockSessionManager?: IMockSessionManager;
}
