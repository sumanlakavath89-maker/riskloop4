/**
 * RiskLoop Runtime Configuration
 *
 * This file is loaded first (before all other scripts) to expose
 * window.API_BASE_URL to every frontend module.
 *
 * Priority order:
 *  1. RENDER_API_BASE_URL injected at build/serve time by Render Static Site env
 *  2. meta tag <meta name="api-base-url" content="..."> in index.html
 *  3. Auto-detect: if served from a non-dev origin, use that origin
 *  4. Fallback to localhost:3000 for local development
 */
(function () {
  'use strict';

  // 1. Check for a meta tag override (set this in index.html for zero-config deploys)
  var metaTag = document.querySelector('meta[name="api-base-url"]');
  if (metaTag && metaTag.content && metaTag.content.trim() && metaTag.content !== '__API_BASE_URL__') {
    window.API_BASE_URL = metaTag.content.trim().replace(/\/$/, '');
    console.log('[RiskLoop Config] API_BASE_URL from meta tag:', window.API_BASE_URL);
    return;
  }

  // 2. Auto-detect: if the page is served from a real domain (not a dev port),
  //    assume the backend is at the same origin (monorepo dev) or use the
  //    configured Render backend URL if window.RENDER_API_BASE_URL was injected.
  var origin = window.location ? window.location.origin : '';
  var isDevOrigin = !origin ||
    origin.includes('localhost') ||
    origin.includes('127.0.0.1') ||
    origin.includes(':5500') ||
    origin.includes(':8080') ||
    origin.includes(':5173');

  if (!isDevOrigin && origin.startsWith('https')) {
    // In production (Render Static Site), the backend URL must be configured.
    // Check if a Render env-injected global was set (see render.yaml _headers trick).
    if (window.__RENDER_API_BASE_URL__ && window.__RENDER_API_BASE_URL__ !== '__RENDER_API_BASE_URL__') {
      window.API_BASE_URL = window.__RENDER_API_BASE_URL__.replace(/\/$/, '');
    } else {
      // Best-effort: derive backend URL from frontend URL convention.
      // e.g. frontend: https://riskloop-frientend.onrender.com
      //      backend:  https://riskloop-backend.onrender.com
      // Users should set the meta tag or RENDER_API_BASE_URL to override this.
      window.API_BASE_URL = null; // will be caught by individual module fallbacks
    }
    if (window.API_BASE_URL) {
      console.log('[RiskLoop Config] API_BASE_URL (production):', window.API_BASE_URL);
    } else {
      console.warn('[RiskLoop Config] API_BASE_URL not configured. Set <meta name="api-base-url"> or window.__RENDER_API_BASE_URL__ in _headers.');
    }
    return;
  }

  // 3. Local development fallback
  window.API_BASE_URL = 'http://localhost:3000';
  console.log('[RiskLoop Config] API_BASE_URL (local dev):', window.API_BASE_URL);
})();
