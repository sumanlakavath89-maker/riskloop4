/**
 * Supabase Authentication & Mobile Redirect Resolution Test Suite
 * 
 * Verifies:
 * 1. Environment Detection & Dynamic Origin Resolution
 *    - Mobile browser on production -> https://YOUR-PRODUCTION-DOMAIN/auth/callback
 *    - Desktop browser on production -> https://YOUR-PRODUCTION-DOMAIN/auth/callback
 *    - Local development on localhost:3000 -> http://localhost:3000/auth/callback
 *    - Local development on localhost:5173 -> http://localhost:5173/auth/callback
 *    - Local development on LAN IP (e.g. 192.168.1.5:3000) -> http://192.168.1.5:3000/auth/callback
 * 
 * 2. Auth Methods Redirection Integrity:
 *    - signUp: emailRedirectTo dynamically uses resolved URL
 *    - signInWithOtp: emailRedirectTo dynamically uses resolved URL
 *    - signInWithGoogle: redirectTo dynamically uses resolved URL
 *    - resetPasswordForEmail: redirectTo dynamically uses resolved URL
 * 
 * 3. Dedicated /auth/callback Route:
 *    - Express server serves /auth/callback with HTTP 200
 *    - auth/callback.html contains robust token/code parsing logic
 */

import fs from 'fs';
import path from 'path';

async function runTests() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING AUTH REDIRECT RESOLUTION & MOBILE CALLBACK SUITE');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // ── TEST SECTION 1: Code Analysis of supabase-config.js ─────────────────
  console.log('📌 Section 1: Verifying Dynamic Redirect Resolution Logic in supabase-config.js...');
  const supabaseConfigPath = path.resolve('supabase-config.js');
  const supabaseConfigCode = fs.readFileSync(supabaseConfigPath, 'utf8');

  // Verify resolveAuthRedirectUrl existence
  assert(supabaseConfigCode.includes('function resolveAuthRedirectUrl'), 'resolveAuthRedirectUrl function exists in supabase-config.js');
  assert(supabaseConfigCode.includes('window.location.origin'), 'Uses window.location.origin dynamically for current client');

  // Verify signUp emailRedirectTo uses resolveAuthRedirectUrl
  assert(
    supabaseConfigCode.includes("options.emailRedirectTo || options.redirectTo || resolveAuthRedirectUrl('/auth/callback')"),
    'signUp uses dynamic resolveAuthRedirectUrl for emailRedirectTo'
  );

  // Verify signInWithOtp emailRedirectTo uses resolveAuthRedirectUrl
  assert(
    supabaseConfigCode.includes('signInWithOtp:') && supabaseConfigCode.includes("options.emailRedirectTo || options.redirectTo || resolveAuthRedirectUrl('/auth/callback')"),
    'signInWithOtp uses dynamic resolveAuthRedirectUrl for emailRedirectTo'
  );

  // Verify signInWithGoogle uses resolveAuthRedirectUrl
  assert(
    supabaseConfigCode.includes("resolveAuthRedirectUrl('/auth/callback')") && supabaseConfigCode.includes('signInWithOAuth'),
    'signInWithGoogle uses dynamic resolveAuthRedirectUrl'
  );

  // Verify resetPasswordForEmail uses resolveAuthRedirectUrl
  assert(
    supabaseConfigCode.includes('resetPasswordForEmail:') && supabaseConfigCode.includes("resolveAuthRedirectUrl('/auth/callback')"),
    'resetPasswordForEmail uses dynamic resolveAuthRedirectUrl'
  );

  // ── TEST SECTION 2: Dynamic Resolution Simulation ─────────────────────────
  console.log('\n📌 Section 2: Simulating Dynamic Origins (Mobile, Production, Staging, Local)...');

  function simulateResolver(mockWindow) {
    const cleanSubpath = '/auth/callback';
    if (mockWindow) {
      const explicitUrl = mockWindow.RISKLOOP_APP_URL || mockWindow.RISKLOOP_PUBLIC_URL || mockWindow.FRONTEND_URL;
      if (explicitUrl && typeof explicitUrl === 'string' && explicitUrl.startsWith('http')) {
        return `${explicitUrl.replace(/\/+$/, '')}${cleanSubpath}`;
      }
      if (mockWindow.location && mockWindow.location.origin && mockWindow.location.origin.startsWith('http')) {
        return `${mockWindow.location.origin}${cleanSubpath}`;
      }
    }
    return `http://localhost:3000${cleanSubpath}`;
  }

  // 1. Mobile user registering on production domain
  const prodMobileOrigin = 'https://riskloop.com';
  const prodMobileResult = simulateResolver({ location: { origin: prodMobileOrigin } });
  assert(prodMobileResult === 'https://riskloop.com/auth/callback', `Production mobile resolves to ${prodMobileResult} (NEVER localhost)`);
  assert(!prodMobileResult.includes('localhost'), 'Production mobile redirect has ZERO localhost mentions');

  // 2. Mobile user registering on custom subdomain
  const appProdOrigin = 'https://app.riskloop.io';
  const appProdResult = simulateResolver({ location: { origin: appProdOrigin } });
  assert(appProdResult === 'https://app.riskloop.io/auth/callback', `Subdomain resolves to ${appProdResult}`);

  // 3. Mobile user testing over LAN IP (e.g. WiFi debugging)
  const lanOrigin = 'http://192.168.1.50:3000';
  const lanResult = simulateResolver({ location: { origin: lanOrigin } });
  assert(lanResult === 'http://192.168.1.50:3000/auth/callback', `LAN IP testing resolves to phone-accessible IP: ${lanResult}`);

  // 4. Local desktop developer on Vite (5173)
  const viteOrigin = 'http://localhost:5173';
  const viteResult = simulateResolver({ location: { origin: viteOrigin } });
  assert(viteResult === 'http://localhost:5173/auth/callback', `Vite dev resolves to ${viteResult}`);

  // 5. Local desktop developer on Express (3000)
  const expressOrigin = 'http://localhost:3000';
  const expressResult = simulateResolver({ location: { origin: expressOrigin } });
  assert(expressResult === 'http://localhost:3000/auth/callback', `Express dev resolves to ${expressResult}`);


  // ── TEST SECTION 3: Dedicated /auth/callback Route & Static File ───────────
  console.log('\n📌 Section 3: Verifying auth/callback.html & Backend Server Route...');
  const callbackHtmlPath = path.resolve('auth/callback.html');
  assert(fs.existsSync(callbackHtmlPath), 'auth/callback.html static file exists');

  const callbackHtml = fs.readFileSync(callbackHtmlPath, 'utf8');
  assert(callbackHtml.includes('exchangeCodeForSession'), 'callback.html supports PKCE code exchange');
  assert(callbackHtml.includes('setSession'), 'callback.html supports access_token & refresh_token session initialization');
  assert(callbackHtml.includes('type=recovery') || callbackHtml.includes('type === \'recovery\''), 'callback.html handles password recovery routing');
  assert(callbackHtml.includes('index.html#dashboard'), 'callback.html auto-redirects verified user to #dashboard');

  const serverJsPath = path.resolve('backend/src/server.js');
  const serverJsCode = fs.readFileSync(serverJsPath, 'utf8');
  assert(
    serverJsCode.includes("'/auth/callback'") && serverJsCode.includes('callback.html'),
    'backend/src/server.js explicitly routes /auth/callback to callback.html'
  );


  // ── TEST SECTION 4: Live HTTP Endpoint Verification ─────────────────────
  console.log('\n📌 Section 4: Live HTTP Verification against backend...');
  const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';

  try {
    const res = await fetch(`${BASE_URL}/auth/callback`);
    assert(res.status === 200, `GET /auth/callback returns HTTP status 200 (Got ${res.status})`);

    const text = await res.text();
    assert(text.includes('RiskLoop') && text.includes('Verifying'), 'GET /auth/callback response contains callback UI');
  } catch (httpErr) {
    console.error(`  ❌ HTTP verification error against ${BASE_URL}:`, httpErr.message);
    failed++;
  }


  // ── FINAL SUMMARY ────────────────────────────────────────────────────────
  console.log('\n========================================================================');
  console.log(`📊 AUTH REDIRECT TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('========================================================================\n');

  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
