/**
 * Determines if the client prefers JSON response format.
 *
 * Checks two indicators in priority order:
 * 1. Query parameter `format=json` (case-insensitive)
 * 2. `Accept` header containing `application/json`
 * @param c - Request context object
 * @param c.req - Request object with header and query accessors
 * @param c.req.header - Function to retrieve request headers by name
 * @param c.req.query - Function to retrieve query parameters by name
 * @returns True if client prefers JSON format, false otherwise
 * @public
 */
export function prefersJsonResponse(c: {
  req: {
    header: (name: string) => string | undefined;
    query: (name: string) => string | undefined;
  };
}): boolean {
  const format = c.req.query('format');
  if (format && format.toLowerCase() === 'json') {
    return true;
  }

  const accept = c.req.header('accept');
  return accept !== undefined && accept.includes('application/json');
}
