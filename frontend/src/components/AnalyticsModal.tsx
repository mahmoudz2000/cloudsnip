/*
  AnalyticsModal.tsx

  A modal popup that shows detailed stats for a specific short link.
  Opens when you click "Analytics" on any link in the Dashboard.

  Closes when:
  - you click the X button
  - you click outside the modal (on the overlay)

  Fetches analytics data fresh every time it opens.
*/

import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { UrlAnalytics } from '../types';

interface Props {
  shortCode: string;
  onClose: () => void;
}

export function AnalyticsModal({ shortCode, onClose }: Props) {
  const [data, setData] = useState<UrlAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getAnalytics(shortCode)
      .then(setData)
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : 'Failed to load analytics');
      })
      .finally(() => setLoading(false));
  }, [shortCode]);

  // close when clicking the overlay (outside the modal box)
  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) {
      onClose();
    }
  }

  // format the expiry date from Unix timestamp
  const expiryDate = data
    ? new Date(data.expiresAt * 1000).toLocaleDateString()
    : null;

  const lastClicked = data?.lastClickedAt
    ? new Date(data.lastClickedAt).toLocaleString()
    : 'Never';

  return (
    <div className="modal-overlay" onClick={handleOverlayClick}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={`Analytics for /${shortCode}`}>
        {/* Header */}
        <div className="modal__header">
          <h3>Analytics — /{shortCode}</h3>
          <button className="modal__close" onClick={onClose} aria-label="Close modal">
            ×
          </button>
        </div>

        {loading && (
          <p style={{ color: 'var(--text-muted)', padding: '1rem 0' }}>Loading...</p>
        )}

        {error && <div className="error-box">{error}</div>}

        {/* Analytics content */}
        {data && (
          <>
            {/* Original URL */}
            <div className="analytics-url">
              <strong>Original URL</strong>
              {data.originalUrl}
            </div>

            {/* Stats grid */}
            <div className="analytics-grid">
              <div className="analytics-item">
                <div className="analytics-item__label">Total clicks</div>
                <div className="analytics-item__value primary">
                  {data.clickCount.toLocaleString()}
                </div>
              </div>

              <div className="analytics-item">
                <div className="analytics-item__label">Alias type</div>
                <div className="analytics-item__value accent">
                  {data.isCustomAlias ? 'Custom' : 'Auto'}
                </div>
              </div>

              <div className="analytics-item">
                <div className="analytics-item__label">Created on</div>
                <div className="analytics-item__value" style={{ fontSize: '.95rem' }}>
                  {new Date(data.createdAt).toLocaleDateString()}
                </div>
              </div>

              <div className="analytics-item">
                <div className="analytics-item__label">Expires on</div>
                <div className="analytics-item__value" style={{ fontSize: '.95rem' }}>
                  {expiryDate}
                </div>
              </div>
            </div>

            {/* Last clicked */}
            <div className="analytics-item">
              <div className="analytics-item__label">Last clicked</div>
              <div className="analytics-item__value" style={{ fontSize: '.9rem' }}>
                {lastClicked}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
