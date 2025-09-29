/**
 * Check if the client prefers JSON response format
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
