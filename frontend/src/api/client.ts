/*
  api/client.ts - all the API calls to the backend

  I centralized all fetch calls here instead of writing them directly in components.
  This way if the API URL changes I only need to update one place.

  VITE_API_URL is set in .env.local - it points to the API Gateway URL.
  If it's not set (like during development with the vite proxy), it falls back to /api.
*/

import type { ShortenRequest, ShortenedUrl, UrlRecord, UrlAnalytics } from '../types';

const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

// generic request helper - handles fetch + JSON parsing + error handling
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  const data = await res.json();

  if (!res.ok) {
    // server returned an error - throw with the message from the API
    const message = (data as { error?: string }).error ?? `Request failed with status ${res.status}`;
    throw new Error(message);
  }

  return data as T;
}

// export the API functions grouped in an object
export const api = {
  // POST /shorten - create a new short URL
  shorten(body: ShortenRequest): Promise<ShortenedUrl> {
    return request<ShortenedUrl>('/shorten', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  // GET /urls - list all short URLs for the dashboard
  listUrls(limit = 50): Promise<{ urls: UrlRecord[]; count: number }> {
    return request<{ urls: UrlRecord[]; count: number }>(`/urls?limit=${limit}`);
  },

  // GET /analytics/{shortCode} - get click stats for a specific link
  getAnalytics(shortCode: string): Promise<UrlAnalytics> {
    return request<UrlAnalytics>(`/analytics/${shortCode}`);
  },
};
