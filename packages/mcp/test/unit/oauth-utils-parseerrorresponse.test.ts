import { describe, it, expect, vi } from 'vitest';

import {
  OAuth2ErrorResponse,
  OAuthUtils,
} from '@mcp-funnel/auth';

const { parseErrorResponse } = OAuthUtils;

describe('OAuth Utils - parseErrorResponse', () => {
  it('should parse valid JSON error response', async () => {
    const errorResponse: OAuth2ErrorResponse = {
      error: 'invalid_request',
      error_description: 'Missing required parameter',
      error_uri: 'https://example.com/error',
    };

    const mockResponse = {
      json: vi.fn().mockResolvedValue(errorResponse),
      status: 400,
      statusText: 'Bad Request',
    } as unknown as Response;

    const result = await parseErrorResponse(mockResponse);

    expect(result).toEqual(errorResponse);
    expect(mockResponse.json).toHaveBeenCalled();
  });

  it('should handle JSON parsing failure with 4xx status', async () => {
    const mockResponse = {
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      status: 400,
      statusText: 'Bad Request',
    } as unknown as Response;

    const result = await parseErrorResponse(mockResponse);

    expect(result).toEqual({
      error: 'invalid_request',
      error_description: 'HTTP 400: Bad Request',
    });
  });

  it('should handle JSON parsing failure with 5xx status', async () => {
    const mockResponse = {
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      status: 500,
      statusText: 'Internal Server Error',
    } as unknown as Response;

    const result = await parseErrorResponse(mockResponse);

    expect(result).toEqual({
      error: 'server_error',
      error_description: 'HTTP 500: Internal Server Error',
    });
  });

  it('should handle response with no status text', async () => {
    const mockResponse = {
      json: vi.fn().mockRejectedValue(new Error('Invalid JSON')),
      status: 401,
      statusText: '',
    } as unknown as Response;

    const result = await parseErrorResponse(mockResponse);

    expect(result).toEqual({
      error: 'invalid_request',
      error_description: 'HTTP 401: ',
    });
  });
});
