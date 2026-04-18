/**
 * Unit tests for the API client helpers.
 * Uses fetch mocking so no real HTTP calls are made.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock global fetch before importing client
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { api } from '../api/client';

function mockOk(data: unknown, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status,
    json: () => Promise.resolve(data),
  });
}

function mockError(data: unknown, status = 400) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    json: () => Promise.resolve(data),
  });
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('api.shorten', () => {
  it('calls POST /shorten and returns data', async () => {
    const expected = {
      shortCode: 'abc123',
      shortUrl: '/abc123',
      originalUrl: 'https://example.com',
      createdAt: '2024-01-01T00:00:00Z',
    };
    mockOk(expected, 201);

    const result = await api.shorten({ url: 'https://example.com' });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/shorten'),
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual(expected);
  });

  it('throws on error response', async () => {
    mockError({ error: 'Invalid URL format' });

    await expect(
      api.shorten({ url: 'not-a-url' }),
    ).rejects.toThrow('Invalid URL format');
  });
});

describe('api.listUrls', () => {
  it('calls GET /urls and returns url list', async () => {
    const expected = { urls: [], count: 0 };
    mockOk(expected);

    const result = await api.listUrls();

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/urls'),
      expect.any(Object),
    );
    expect(result).toEqual(expected);
  });
});

describe('api.getAnalytics', () => {
  it('calls GET /analytics/:code', async () => {
    const expected = {
      shortCode: 'abc123',
      originalUrl: 'https://example.com',
      clickCount: 7,
      createdAt: '2024-01-01T00:00:00Z',
      lastClickedAt: null,
      isCustomAlias: false,
      expiresAt: 9999999999,
    };
    mockOk(expected);

    const result = await api.getAnalytics('abc123');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/analytics/abc123'),
      expect.any(Object),
    );
    expect(result).toEqual(expected);
  });

  it('throws with server error message', async () => {
    mockError({ error: 'Short code not found' }, 404);

    await expect(api.getAnalytics('nope')).rejects.toThrow(
      'Short code not found',
    );
  });
});
