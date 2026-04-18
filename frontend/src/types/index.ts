export interface ShortenedUrl {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  createdAt: string;
}

export interface UrlRecord {
  shortCode: string;
  originalUrl: string;
  clickCount: number;
  createdAt: string;
  isCustomAlias: boolean;
}

export interface UrlAnalytics {
  shortCode: string;
  originalUrl: string;
  clickCount: number;
  createdAt: string;
  lastClickedAt: string | null;
  isCustomAlias: boolean;
  expiresAt: number;
}

export interface ShortenRequest {
  url: string;
  customAlias?: string;
  ttlDays?: number;
}

export type ViewMode = 'shorten' | 'dashboard';
