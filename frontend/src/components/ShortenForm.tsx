/*
  ShortenForm.tsx

  The main form on the homepage. User pastes a URL, optionally sets a custom
  alias and expiry, then submits. Shows the result (short link) below the form.

  State:
  - url, alias, ttlDays: form field values
  - loading: shows "Shortening..." while the API call is in progress
  - error: shows error message if the API call fails
  - result: the created short URL, shown below the form on success
  - copied: tracks whether the copy button was clicked (for the "Copied!" feedback)
*/

import { useState } from 'react';
import { api } from '../api/client';
import type { ShortenedUrl } from '../types';

interface Props {
  onCreated?: (url: ShortenedUrl) => void; // called when a link is successfully created
}

export function ShortenForm({ onCreated }: Props) {
  const [url, setUrl] = useState('');
  const [alias, setAlias] = useState('');
  const [ttlDays, setTtlDays] = useState(365);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShortenedUrl | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);

    try {
      const data = await api.shorten({
        url,
        customAlias: alias || undefined, // don't send empty string
        ttlDays,
      });

      setResult(data);
      onCreated?.(data);

      // clear the form after success
      setUrl('');
      setAlias('');
    } catch (err) {
      // show the error message from the API (or a generic one)
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result) return;
    navigator.clipboard.writeText(result.shortUrl).then(() => {
      setCopied(true);
      // reset the "Copied!" text after 2 seconds
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="card">
      <form className="shorten-form" onSubmit={handleSubmit}>
        {/* Main URL input */}
        <div className="input-group">
          <label htmlFor="long-url">Paste your long URL</label>
          <input
            id="long-url"
            type="url"
            placeholder="https://example.com/very/long/url?with=params"
            value={url}
            onChange={e => setUrl(e.target.value)}
            required
            autoFocus
          />
        </div>

        {/* Optional settings row */}
        <div className="options-row">
          <div className="input-group">
            <label htmlFor="alias">Custom alias (optional)</label>
            <input
              id="alias"
              type="text"
              placeholder="my-cool-link"
              value={alias}
              onChange={e => setAlias(e.target.value)}
              pattern="[a-zA-Z0-9-]{3,30}"
              title="3-30 characters, letters/numbers/hyphens only"
            />
          </div>

          <div className="input-group">
            <label htmlFor="ttl">Expires in (days)</label>
            <input
              id="ttl"
              type="number"
              min={1}
              max={3650}
              value={ttlDays}
              onChange={e => setTtlDays(Number(e.target.value))}
            />
          </div>
        </div>

        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? 'Shortening...' : 'Shorten URL'}
        </button>
      </form>

      {/* Error message */}
      {error && <div className="error-box">{error}</div>}

      {/* Success - show the short link */}
      {result && (
        <div className="result">
          <div className="result__label">Your short link is ready 🎉</div>
          <div className="result__url">
            <a
              href={result.shortUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="result__link"
            >
              {result.shortUrl}
            </a>
            <button
              className={`copy-btn${copied ? ' copied' : ''}`}
              onClick={handleCopy}
              type="button"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <div className="result__meta">
            <span>Code: <strong>{result.shortCode}</strong></span>
            <span>Created: {new Date(result.createdAt).toLocaleDateString()}</span>
          </div>
        </div>
      )}
    </div>
  );
}
