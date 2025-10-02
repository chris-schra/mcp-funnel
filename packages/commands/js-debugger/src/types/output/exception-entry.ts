import type { ExceptionDetails } from '../cdp/exception-details';

/**
 * Buffered runtime exception including the original CDP details.
 */
export interface ExceptionEntry {
  text: string;
  details: ExceptionDetails;
  timestamp: number;
}
