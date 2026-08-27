/**
 * RiskLoop Supabase Configuration & Authentication Service
 * 
 * Provides unified Supabase client initialization, Google OAuth,
 * Email/Password authentication, real-time auth state synchronization,
 * and database helper methods.
 * Includes a resilient Local/Demo fallback engine if keys are not yet configured.
 */

(function (window) {
  'use strict';

  // ============================================================
  // CONFIGURATION
  // Replace these with your live Supabase project credentials,
  // or put them in backend/.env (SUPABASE_URL, SUPABASE_ANON_KEY).
  // ============================================================
  const DEFAULT_CONFIG = {
    url: 'https://pxkjutzaeawzjbgjtavf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB4a2p1dHphZWF3empiZ2p0YXZmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwNDM1ODQsImV4cCI6MjEwMjYxOTU4NH0.tnAU3wQXo50VBJaFz3EbFMGlymdmDUkmFq9tyxXAsNo',
  };

  let config = window.SUPABASE_CONFIG || DEFAULT_CONFIG;
  let supabaseClient = null;
  let supabaseAuthSubscription = null;
  let currentUserCache = null;

  // ============================================================
  // LOCAL STORAGE CACHE HELPERS
  // ============================================================
  const STORAGE_KEY_USER = 'riskloop_current_user';
  const STORAGE_KEY_USERS_DB = 'riskloop_mock_users_db';
  const STORAGE_KEY_JOURNAL = 'riskloop_journal_trades';

  function getLocalMockUser() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_USER);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  }

  function setLocalMockUser(user) {
    try {
      if (user) {
        localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(user));
      } else {
        localStorage.removeItem(STORAGE_KEY_USER);
      }
    } catch (e) {
      console.error(e);
    }
  }

  function getLocalUsersDB() {
    try {
      const data = localStorage.getItem(STORAGE_KEY_USERS_DB);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  function saveLocalUsersDB(users) {
    try {
      localStorage.setItem(STORAGE_KEY_USERS_DB, JSON.stringify(users));
    } catch (e) {
      console.error(e);
    }
  }

  // Auth state change listeners
  const authListeners = [];

  function notifyAuthListeners(event, sessionData) {
    authListeners.forEach(cb => {
      try {
        cb(event, sessionData);
      } catch (e) {
        console.error('[RiskLoopAuth] Listener callback error:', e);
      }
    });
  }

  function normalizeSupabaseUser(sbUser) {
    if (!sbUser) return null;
    const email = sbUser.email || '';
    const fullName = sbUser.user_metadata?.full_name
      || sbUser.user_metadata?.name
      || sbUser.user_metadata?.user_name
      || (email ? email.split('@')[0] : '');

    const providers = sbUser.app_metadata?.providers
      || (sbUser.app_metadata?.provider ? [sbUser.app_metadata.provider] : ['email']);

    const isGoogle = sbUser.app_metadata?.provider === 'google'
      || (Array.isArray(providers) && providers.includes('google'))
      || (Array.isArray(sbUser.identities) && sbUser.identities.some(id => id.provider === 'google'));

    let existingAvatar = null;
    try {
      const cached = getLocalMockUser();
      if (cached && (cached.id === sbUser.id || cached.email === email)) {
        existingAvatar = cached.avatarUrl || cached.avatar_url || null;
      }
    } catch (_) { }

    const avatarUrl = sbUser.user_metadata?.avatar_url
      || sbUser.user_metadata?.picture
      || sbUser.user_metadata?.avatar
      || existingAvatar
      || null;

    return {
      id: sbUser.id,
      email: email,
      fullName: fullName,
      avatarUrl: avatarUrl,
      avatar_url: avatarUrl,
      provider: isGoogle ? 'google' : (sbUser.app_metadata?.provider || 'email'),
      providers: providers,
      identities: sbUser.identities || [],
      userMetadata: sbUser.user_metadata || {}
    };
  }

  function cleanAuthUrl() {
    try {
      const hash = window.location.hash || '';
      const search = window.location.search || '';
      const pathname = window.location.pathname || '';

      // Never strip recovery flow parameters before password reset is completed
      if (hash.includes('type=recovery') || search.includes('type=recovery') || pathname.includes('/reset-password') || hash.includes('reset-password')) {
        return;
      }

      if (window.history && window.history.replaceState) {
        window.history.replaceState(null, '', window.location.pathname + '#dashboard');
      } else {
        window.location.hash = 'dashboard';
      }
    } catch (_) { }
  }

  function setupSupabaseAuthListener(client) {
    if (!client || !client.auth) return;

    // Avoid duplicate subscriptions
    if (supabaseAuthSubscription && typeof supabaseAuthSubscription.unsubscribe === 'function') {
      try {
        supabaseAuthSubscription.unsubscribe();
      } catch (_) { }
      supabaseAuthSubscription = null;
    }

    const hash = window.location.hash || '';
    const search = window.location.search || '';
    const pathname = window.location.pathname || '';

    const isRecoveryCallback = hash.includes('type=recovery')
      || search.includes('type=recovery')
      || pathname.includes('/reset-password')
      || hash.includes('reset-password');

    const hasRecoveryError = (hash.includes('error=') || search.includes('error='))
      && (hash.includes('recovery') || search.includes('recovery') || pathname.includes('/reset-password') || hash.includes('otp_expired'));

    const isUrlAuthCallback = hash.includes('access_token=')
      || hash.includes('type=signup')
      || hash.includes('type=email_confirmation')
      || isRecoveryCallback
      || hash.includes('type=invite')
      || search.includes('code=');

    if (isRecoveryCallback) {
      window.__riskloop_is_password_recovery = true;
    }

    if (hasRecoveryError) {
      const params = new URLSearchParams(search || hash.replace(/^#/, ''));
      const errorMsg = params.get('error_description') || 'This password reset link is invalid or has expired.';
      setTimeout(() => {
        if (typeof window.openResetPasswordModal === 'function') {
          window.openResetPasswordModal(true, errorMsg);
        }
        window.dispatchEvent(new CustomEvent('riskloop_password_recovery_error', { detail: { message: errorMsg } }));
      }, 50);
    }

    try {
      const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
        console.log(`[RiskLoopAuth] Real-time Supabase auth event: ${event}`, session?.user?.email);

        if (event === 'PASSWORD_RECOVERY' || isRecoveryCallback) {
          window.__riskloop_is_password_recovery = true;
          const user = session?.user ? normalizeSupabaseUser(session.user) : null;
          if (user) {
            currentUserCache = user;
            setLocalMockUser(user);
          }
          notifyAuthListeners('PASSWORD_RECOVERY', { user, session });
          window.dispatchEvent(new CustomEvent('riskloop_password_recovery', { detail: { user, session } }));
          setTimeout(() => {
            if (typeof window.openResetPasswordModal === 'function') {
              window.openResetPasswordModal(false);
            }
          }, 30);
          return;
        }

        if (session && session.user) {
          const user = normalizeSupabaseUser(session.user);
          currentUserCache = user;
          setLocalMockUser(user);

          const isVerification = isUrlAuthCallback || event === 'SIGNED_IN' || event === 'USER_UPDATED';
          if (isUrlAuthCallback && !isRecoveryCallback) {
            cleanAuthUrl();
          }

          notifyAuthListeners(event, { user, session, isEmailVerification: isVerification });
        } else if (event === 'SIGNED_OUT') {
          currentUserCache = null;
          setLocalMockUser(null);
          notifyAuthListeners('SIGNED_OUT', null);
        } else {
          const user = session?.user ? normalizeSupabaseUser(session.user) : null;
          currentUserCache = user;
          setLocalMockUser(user);
          notifyAuthListeners(event, user ? { user, session } : null);
        }
      });

      supabaseAuthSubscription = subscription;
    } catch (e) {
      console.warn('[RiskLoopAuth] Failed to bind onAuthStateChange:', e);
    }

    // Handle PKCE code exchange if ?code= is in query parameters
    if (search.includes('code=') && typeof client.auth.exchangeCodeForSession === 'function') {
      const urlParams = new URLSearchParams(search);
      const code = urlParams.get('code');
      if (code) {
        client.auth.exchangeCodeForSession(code).then(({ data, error }) => {
          if (!error && data?.session?.user) {
            const user = normalizeSupabaseUser(data.session.user);
            currentUserCache = user;
            setLocalMockUser(user);
            if (isRecoveryCallback) {
              window.__riskloop_is_password_recovery = true;
              if (typeof window.openResetPasswordModal === 'function') {
                window.openResetPasswordModal(false);
              }
            } else {
              cleanAuthUrl();
              if (typeof window.recordSuccessfulLogin === 'function') {
                window.recordSuccessfulLogin(user, data.session, 'Google OAuth');
              }
              notifyAuthListeners('SIGNED_IN', { user, session: data.session, isEmailVerification: true });
            }
          } else if (error && isRecoveryCallback) {
            if (typeof window.openResetPasswordModal === 'function') {
              window.openResetPasswordModal(true, error.message || 'Password reset link is invalid or expired.');
            }
          }
        }).catch(err => {
          console.warn('[RiskLoopAuth] exchangeCodeForSession error:', err);
        });
      }
    }

    // Check initial session immediately
    client.auth.getSession().then(({ data: { session } }) => {
      if (session && session.user) {
        const user = normalizeSupabaseUser(session.user);
        currentUserCache = user;
        setLocalMockUser(user);
        if (isRecoveryCallback) {
          window.__riskloop_is_password_recovery = true;
          setTimeout(() => {
            if (typeof window.openResetPasswordModal === 'function') {
              window.openResetPasswordModal(false);
            }
          }, 30);
        } else if (isUrlAuthCallback) {
          cleanAuthUrl();
        }
        notifyAuthListeners('INITIAL_SESSION', { user, session, isEmailVerification: isUrlAuthCallback });
      } else if (isRecoveryCallback) {
        // Recovery URL visited without valid session
        setTimeout(() => {
          if (typeof window.openResetPasswordModal === 'function') {
            window.openResetPasswordModal(true, 'This reset link has expired or is invalid. Please request a new link.');
          }
        }, 50);
      }
    }).catch(err => {
      console.warn('[RiskLoopAuth] getSession check error:', err);
    });
  }

  function initClient(url, key) {
    if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
      return false;
    }
    if (typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
      try {
        supabaseClient = window.supabase.createClient(url, key);
        window.supabaseClient = supabaseClient;
        console.log('✅ RiskLoop: Supabase client initialized with live credentials.');
        setupSupabaseAuthListener(supabaseClient);
        return true;
      } catch (e) {
        console.warn('⚠️ RiskLoop: Failed to create Supabase client:', e);
      }
    }
    return false;
  }

  // Attempt initial creation
  if (config.url && config.anonKey) {
    initClient(config.url, config.anonKey);
  }

  // Dynamically fetch and sync with live backend environment configuration
  if (typeof fetch !== 'undefined') {
    fetch('/api/config/supabase')
      .then(res => res.json())
      .then(data => {
        if (data && data.isConfigured && data.supabaseUrl && data.supabaseAnonKey) {
          if (!supabaseClient || data.supabaseUrl !== config.url || data.supabaseAnonKey !== config.anonKey) {
            config = { url: data.supabaseUrl, anonKey: data.supabaseAnonKey };
            initClient(config.url, config.anonKey);
          }
        }
      })
      .catch(() => { });
  }

  // Initialize cached user from localStorage on script parse
  currentUserCache = getLocalMockUser();

  // ============================================================
  // AUTH SERVICE API
  // ============================================================
  const authService = {
    /**
     * Check if live Supabase client is active
     */
    isLiveSupabase: function () {
      return !!supabaseClient;
    },

    /**
     * Get synchronous current user from memory or cache
     */
    getUser: function () {
      if (supabaseClient) {
        return currentUserCache;
      }
      return currentUserCache || getLocalMockUser();
    },

    /**
     * Check if user is authenticated
     */
    isAuthenticated: function () {
      if (supabaseClient) {
        return !!(currentUserCache && currentUserCache.id);
      }
      const user = currentUserCache || getLocalMockUser();
      return !!(user && user.id);
    },

    /**
     * Get current authenticated user (async with live Supabase check)
     */
    getCurrentUser: async function () {
      if (supabaseClient) {
        try {
          const { data: { user }, error } = await supabaseClient.auth.getUser();
          if (!error && user) {
            const normalized = normalizeSupabaseUser(user);
            currentUserCache = normalized;
            setLocalMockUser(normalized);
            return normalized;
          } else {
            currentUserCache = null;
            setLocalMockUser(null);
            return null;
          }
        } catch (e) {
          console.warn('Supabase getUser error:', e);
          return null;
        }
      }
      return currentUserCache || getLocalMockUser();
    },

    /**
     * Get current authenticated session access token
     */
    getAccessToken: async function () {
      if (supabaseClient) {
        try {
          const { data: { session }, error } = await supabaseClient.auth.getSession();
          if (!error && session && session.access_token) {
            return session.access_token;
          }
          return null;
        } catch (e) {
          console.warn('Supabase getSession error:', e);
          return null;
        }
      }
      const local = authService.getUser();
      if (local && local.id) {
        return 'mock_user_' + local.id;
      }
      return null;
    },

    /**
     * Get current session
     */
    getSession: async function () {
      if (supabaseClient) {
        try {
          const { data: { session }, error } = await supabaseClient.auth.getSession();
          if (!error && session) return session;
        } catch (_) { }
      }
      return null;
    },

    /**
     * Register a new user with Email & Password
     */
    signUp: async function (email, password, metadata = {}) {
      if (!email || !password) {
        return { error: { message: 'Email and password are required.' } };
      }

      if (supabaseClient) {
        try {
          const redirectUrl = window.location.origin + window.location.pathname + '#dashboard';
          const { data, error } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
              emailRedirectTo: redirectUrl,
              data: {
                full_name: metadata.fullName || email.split('@')[0],
                ...metadata
              }
            }
          });
          if (error) return { data: null, error };

          const user = normalizeSupabaseUser(data?.user);
          const hasSession = !!(data?.session && data?.session?.user);

          if (hasSession) {
            // Immediate active session (email confirmation not required or pre-confirmed)
            currentUserCache = user;
            setLocalMockUser(user);
            notifyAuthListeners('SIGNED_IN', { user, session: data.session });
          } else {
            // Email confirmation is required by Supabase! Do NOT mark user as logged in.
            currentUserCache = null;
            setLocalMockUser(null);
          }

          return {
            data: {
              user,
              session: data?.session || null,
              requiresEmailConfirmation: !hasSession
            },
            error: null
          };
        } catch (err) {
          return { data: null, error: err };
        }
      }

      // Local fallback only when no live Supabase client exists
      const db = getLocalUsersDB();
      const existing = db.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (existing) {
        return { error: { message: 'An account with this email already exists.' } };
      }

      const newUser = {
        id: 'usr_' + Date.now(),
        email: email,
        passwordHash: btoa(password),
        fullName: metadata.fullName || email.split('@')[0],
        avatarUrl: null,
        provider: 'email',
        createdAt: new Date().toISOString()
      };

      db.push(newUser);
      saveLocalUsersDB(db);

      const sessionUser = {
        id: newUser.id,
        email: newUser.email,
        fullName: newUser.fullName,
        avatarUrl: null,
        provider: 'email'
      };

      currentUserCache = sessionUser;
      setLocalMockUser(sessionUser);
      notifyAuthListeners('SIGNED_IN', { user: sessionUser, session: null });
      return { data: { user: sessionUser, session: null, requiresEmailConfirmation: false }, error: null };
    },

    /**
     * Sign In with Email & Password
     */
    signIn: async function (email, password) {
      if (!email || !password) {
        return { error: { message: 'Email and password are required.' } };
      }

      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
          });
          if (error) return { data: null, error };

          const user = normalizeSupabaseUser(data.user);
          currentUserCache = user;
          setLocalMockUser(user);
          if (typeof window.recordSuccessfulLogin === 'function') {
            window.recordSuccessfulLogin(user, data.session, 'Email Login');
          }
          notifyAuthListeners('SIGNED_IN', { user, session: data.session });
          return { data: { user, session: data.session }, error: null };
        } catch (err) {
          return { data: null, error: err };
        }
      }

      // Local fallback only when no live Supabase client exists
      const db = getLocalUsersDB();
      const matched = db.find(u => u.email.toLowerCase() === email.toLowerCase() && u.passwordHash === btoa(password));
      if (!matched) {
        return { data: null, error: { message: 'Invalid login credentials.' } };
      }

      const sessionUser = {
        id: matched.id,
        email: matched.email,
        fullName: matched.fullName,
        avatarUrl: matched.avatarUrl,
        provider: matched.provider || 'email'
      };

      currentUserCache = sessionUser;
      setLocalMockUser(sessionUser);
      if (typeof window.recordSuccessfulLogin === 'function') {
        window.recordSuccessfulLogin(sessionUser, null, 'Email Login');
      }
      notifyAuthListeners('SIGNED_IN', { user: sessionUser, session: null });
      return { data: { user: sessionUser, session: null }, error: null };
    },

    /**
     * Sign in with Google OAuth
     */
    signInWithGoogle: async function (redirectTo) {
      let redirectUrl = redirectTo;
      if (!redirectUrl) {
        const currentPath = window.location.pathname || '/';
        const basePath = currentPath.endsWith('login.html') || currentPath.endsWith('register.html')
          ? currentPath.replace(/(login|register)\.html$/, 'index.html')
          : currentPath;
        // Standard OAuth 2.0 redirect URLs MUST NOT contain hash fragments (#)
        const cleanPath = basePath.startsWith('/') ? basePath : '/' + basePath;
        redirectUrl = window.location.origin + cleanPath;
      }

      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
              queryParams: {
                access_type: 'offline',
                prompt: 'select_account'
              }
            }
          });

          if (error) {
            console.warn('[RiskLoopAuth] Supabase Google OAuth error:', error);
            return { data: null, error };
          }

          if (data && data.url) {
            // Explicitly navigate the browser to the Google OAuth authorization URL
            window.location.assign(data.url);
            return { data, error: null };
          }

          return { data, error: null };
        } catch (err) {
          console.warn('[RiskLoopAuth] Supabase Google OAuth exception:', err);
          return { data: null, error: err };
        }
      }

      // Simulation fallback for Google OAuth only if no live Supabase client exists
      console.log('⚡ RiskLoop: Simulating Google OAuth Sign-In');
      const googleUser = {
        id: 'google_usr_' + Date.now(),
        email: 'trader.google@riskloop.io',
        fullName: 'Google Trader',
        avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=RiskLoopGoogle&backgroundColor=b6e3f4,c0aede,d1d4f9',
        provider: 'google'
      };

      currentUserCache = googleUser;
      setLocalMockUser(googleUser);
      notifyAuthListeners('SIGNED_IN', { user: googleUser, session: null });

      return { data: { user: googleUser }, error: null };
    },

    /**
     * Set or update password for currently authenticated user / recovery session
     */
    updatePassword: async function (newPassword) {
      if (!newPassword || newPassword.length < 6) {
        return { error: { message: 'Password must be at least 6 characters long.' } };
      }

      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient.auth.updateUser({
            password: newPassword
          });
          if (error) {
            let msg = error.message || 'Failed to update password.';
            if (msg.toLowerCase().includes('session') || msg.toLowerCase().includes('jwt') || msg.toLowerCase().includes('token') || msg.toLowerCase().includes('auth')) {
              msg = 'Password reset session has expired or is invalid. Please request a new password reset link.';
            }
            return { error: { message: msg, originalError: error } };
          }

          if (data?.user) {
            const normalized = normalizeSupabaseUser(data.user);
            currentUserCache = normalized;
            setLocalMockUser(normalized);
            window.__riskloop_is_password_recovery = false;
            notifyAuthListeners('PASSWORD_UPDATED', { user: normalized, session: data.session });
          }
          return { data, error: null };
        } catch (err) {
          return { error: err };
        }
      }

      // Local fallback only if live Supabase client is not available
      const current = currentUserCache || getLocalMockUser();
      if (!current || !current.email) {
        return { error: { message: 'No active user session found. Please request a new password reset link.' } };
      }

      const db = getLocalUsersDB();
      const idx = db.findIndex(u => u.email.toLowerCase() === current.email.toLowerCase());
      if (idx >= 0) {
        db[idx].passwordHash = btoa(newPassword);
      } else {
        db.push({
          id: current.id || 'usr_' + Date.now(),
          email: current.email,
          passwordHash: btoa(newPassword),
          fullName: current.fullName || current.email.split('@')[0],
          provider: 'email',
          createdAt: new Date().toISOString()
        });
      }
      saveLocalUsersDB(db);
      return { data: { user: current }, error: null };
    },

    /**
     * Send password reset / recovery email via Supabase
     */
    resetPasswordForEmail: async function (email, redirectTo) {
      if (!email) {
        return { error: { message: 'Email address is required.' } };
      }

      if (supabaseClient) {
        try {
          const redirectUrl = redirectTo || (window.location.origin + '/reset-password');
          const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
          });
          return { data, error };
        } catch (err) {
          return { error: err };
        }
      }

      return { data: {}, error: null };
    },

    /**
     * Sign Out
     */
    signOut: async function () {
      if (typeof window.clearJournalState === 'function') {
        try { window.clearJournalState(); } catch (_) { }
      }

      if (supabaseClient) {
        try {
          await supabaseClient.auth.signOut();
        } catch (e) {
          console.warn('Supabase signOut error:', e);
        }
      }

      currentUserCache = null;
      setLocalMockUser(null);
      notifyAuthListeners('SIGNED_OUT', null);
      return { error: null };
    },

    /**
     * Listen to authentication state changes
     */
    onAuthStateChange: function (callback) {
      if (typeof callback !== 'function') return () => { };

      // Avoid duplicate listener registration
      if (!authListeners.includes(callback)) {
        authListeners.push(callback);
      }

      // Immediate delivery of current cached state
      const current = currentUserCache || getLocalMockUser();
      if (current) {
        setTimeout(() => {
          try {
            callback('INITIAL_SESSION', { user: current });
          } catch (e) {
            console.error(e);
          }
        }, 0);
      } else {
        setTimeout(() => {
          try {
            callback('INITIAL_SESSION', null);
          } catch (e) {
            console.error(e);
          }
        }, 0);
      }

      // Return unsubscribe function
      return function unsubscribe() {
        const idx = authListeners.indexOf(callback);
        if (idx > -1) {
          authListeners.splice(idx, 1);
        }
      };
    }
  };

  // Attach to window
  window.RiskLoopAuth = authService;
  window.supabaseClient = supabaseClient;

})(window);
