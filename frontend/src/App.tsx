/*
  App.tsx - root component

  Just handles switching between the two "pages":
  - Shorten: the main form to create short links
  - Dashboard: see all your links and their stats

  I'm not using React Router for this because there are only 2 views and
  state-based routing is simpler for something this small.
*/

import { useState } from 'react';
import { ShortenForm } from './components/ShortenForm';
import { Dashboard } from './components/Dashboard';
import type { ViewMode } from './types';

export default function App() {
  const [view, setView] = useState<ViewMode>('shorten');

  // used to force the dashboard to re-fetch after a new link is created
  const [dashboardKey, setDashboardKey] = useState(0);

  function handleLinkCreated() {
    // bump the key so the Dashboard re-mounts and refreshes its list
    setDashboardKey(k => k + 1);
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="header__inner">
            {/* Logo */}
            <div className="logo">
              <div className="logo__icon">✂</div>
              Cloud<span className="logo__accent">Snip</span>
            </div>

            {/* Nav - just two buttons */}
            <nav className="nav">
              <button
                className={`nav__btn${view === 'shorten' ? ' active' : ''}`}
                onClick={() => setView('shorten')}
              >
                Shorten
              </button>
              <button
                className={`nav__btn${view === 'dashboard' ? ' active' : ''}`}
                onClick={() => setView('dashboard')}
              >
                Dashboard
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Main content */}
      <main className="main">
        <div className="container">
          {view === 'shorten' && (
            <>
              <div className="hero">
                <h1>
                  Shorten URLs with{' '}
                  <span className="hero__gradient">AWS Lambda</span>
                </h1>
                <p>Serverless · Instant · Analytics-ready</p>
                {/* showing which AWS services are under the hood */}
                <div className="aws-badges">
                  {['Lambda', 'DynamoDB', 'API Gateway', 'S3', 'CloudFront', 'CDK'].map(service => (
                    <span key={service} className="aws-badge">{service}</span>
                  ))}
                </div>
              </div>

              <ShortenForm onCreated={handleLinkCreated} />
            </>
          )}

          {view === 'dashboard' && (
            // key prop forces re-mount (and re-fetch) when a new link is created
            <Dashboard key={dashboardKey} />
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="footer">
        <div className="container">
          Built with AWS CDK · Lambda · DynamoDB · React ·{' '}
          <a href="https://github.com/YOUR_USERNAME/cloudsnip" target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </div>
      </footer>
    </div>
  );
}
