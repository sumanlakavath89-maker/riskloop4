# Supabase Auth URL Configuration Guide — RiskLoop

To ensure mobile users, desktop users, and developers are redirected to the correct domain after email verification, password reset, or OAuth login, configure your Supabase Dashboard settings as follows.

---

## 1. Supabase Dashboard Configuration

1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Select your RiskLoop project.
3. Navigate to **Authentication** $\to$ **URL Configuration**.

---

## 2. Site URL Configuration

Set the **Site URL** to your primary live production domain (where RiskLoop is hosted):

```text
https://YOUR-PRODUCTION-RISKLOOP-DOMAIN.com
```

*(For example: `https://riskloop.io` or `https://riskloop4.vercel.app`)*

> [!IMPORTANT]
> Never set the Site URL in Supabase to `http://localhost:3000` for a production application. Setting Site URL to production ensures fallback links default to your live domain.

---

## 3. Redirect URLs Whitelist

Under **Redirect URLs**, click **Add URL** and add the following wildcard and exact match entries:

### Production Domains
```text
https://YOUR-PRODUCTION-RISKLOOP-DOMAIN.com/**
https://YOUR-PRODUCTION-RISKLOOP-DOMAIN.com/auth/callback
https://YOUR-PRODUCTION-RISKLOOP-DOMAIN.com/index.html
https://YOUR-PRODUCTION-RISKLOOP-DOMAIN.com/reset-password
```

### Local Development & Preview Environments
```text
http://localhost:3000/**
http://localhost:3000/auth/callback
http://localhost:5173/**
http://localhost:5173/auth/callback
http://127.0.0.1:3000/**
http://127.0.0.1:5173/**
```

---

## 4. How the Dynamic Client Resolver Works

1. **When a user registers from a mobile phone on `https://riskloop.com`:**
   - The browser computes `window.location.origin` = `https://riskloop.com`.
   - The `signUp` call passes `emailRedirectTo: "https://riskloop.com/auth/callback"`.
   - When the user opens the confirmation email on their phone, Supabase redirects them to `https://riskloop.com/auth/callback#access_token=...`.
   - The callback handler verifies the token, activates their session, and opens the dashboard on `https://riskloop.com/#dashboard`.

2. **When a developer tests locally on `http://localhost:3000`:**
   - The browser computes `window.location.origin` = `http://localhost:3000`.
   - The `signUp` call passes `emailRedirectTo: "http://localhost:3000/auth/callback"`.
   - Supabase redirects the local developer back to `http://localhost:3000/auth/callback`.

---

## 5. Automated Verification Test

Run the verification test suite anytime to validate the redirect logic:

```bash
node scripts/test_auth_redirect_resolution.js
```
