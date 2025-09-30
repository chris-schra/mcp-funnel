/**
 * Determines if the client prefers JSON response format.
 *
 * Checks two indicators in priority order:
 * 1. Query parameter `format=json` (case-insensitive)
 * 2. `Accept` header containing `application/json`
 *
 * The context parameter contains nested `req.header(name)` and `req.query(name)` functions
 * for retrieving HTTP headers and query parameters respectively.
 * @param c - Request context object with req.header and req.query accessor functions
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
