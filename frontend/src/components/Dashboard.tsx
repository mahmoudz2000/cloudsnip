/*
  Dashboard.tsx

  Shows all the short links and their click counts.
  Clicking "Analytics" on any link opens the AnalyticsModal with more details.

  Fetches the link list from GET /urls on mount.
  Shows skeleton loaders while loading (looks better than just blank space).
*/

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { UrlRecord } from '../types';
import { AnalyticsModal } from './AnalyticsModal';

export function Dashboard() {
  const [urls, setUrls] = useState<UrlRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCode, setSelectedCode] = useState<string | null>(null); // for the analytics modal

  function fetchUrls() {
    setLoading(true);
    setError(null);
    api.listUrls()
      .then(res => setUrls(res.urls))
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load links');
      })
      .finally(() => setLoading(false));
  }

  // fetch on mount
  useEffect(() => {
    fetchUrls();
  }, []);

  // compute summary stats from the list
  const totalClicks = urls.reduce((sum, u) => sum + u.clickCount, 0);
  const customAliasCount = urls.filter(u => u.isCustomAlias).length;

  return (
    <div className="dashboard">
      {/* Stats overview */}
      <div className="stats-bar">
        <div className="stat-card">
          <div className="stat-card__value">{urls.length}</div>
          <div className="stat-card__label">Total links</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{totalClicks.toLocaleString()}</div>
          <div className="stat-card__label">Total clicks</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{customAliasCount}</div>
          <div className="stat-card__label">Custom aliases</div>
        </div>
      </div>

      {/* Link list */}
      <div className="card">
        <div className="dashboard__header">
          <h2>Your Links</h2>
          <button className="btn btn--ghost" onClick={fetchUrls}>
            Refresh
          </button>
        </div>

        {/* Loading state - show skeleton placeholders */}
        {loading && (
          <div className="url-list" style={{ marginTop: '1rem' }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="skeleton" style={{ height: '70px' }} />
            ))}
          </div>
        )}

        {/* Error state */}
        {error && <div className="error-box">{error}</div>}

        {/* Empty state */}
        {!loading && !error && urls.length === 0 && (
          <div className="empty-state">
            <div className="empty-state__icon">🔗</div>
            <p>No links yet - go shorten something!</p>
          </div>
        )}

        {/* URL list */}
        {!loading && urls.length > 0 && (
          <div className="url-list" style={{ marginTop: '1rem' }}>
            {urls.map(url => (
              <UrlItem
                key={url.shortCode}
                item={url}
                onAnalytics={() => setSelectedCode(url.shortCode)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Analytics modal - shown when a link's Analytics button is clicked */}
      {selectedCode && (
        <AnalyticsModal
          shortCode={selectedCode}
          onClose={() => setSelectedCode(null)}
        />
      )}
    </div>
  );
}

// ----- UrlItem component -----
// each row in the URL list

interface UrlItemProps {
  item: UrlRecord;
  onAnalytics: () => void;
}

function UrlItem({ item, onAnalytics }: UrlItemProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    // copy the full short URL to clipboard
    const shortUrl = `${window.location.origin}/${item.shortCode}`;
    navigator.clipboard.writeText(shortUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <div className="url-item">
      <div className="url-item__left">
        <div className="url-item__short">/{item.shortCode}</div>
        {/* truncate long URLs with CSS ellipsis */}
        <div className="url-item__original" title={item.originalUrl}>
          {item.originalUrl}
        </div>
      </div>

      <div className="url-item__right">
        <div className="click-badge">
          <strong>{item.clickCount.toLocaleString()}</strong> clicks
        </div>
        <button className="btn btn--ghost" onClick={handleCopy} type="button">
          {copied ? 'Copied!' : 'Copy'}
        </button>
        <button className="btn btn--ghost" onClick={onAnalytics} type="button">
          Analytics
        </button>
      </div>
    </div>
  );
}
