# 🔌 Upstox API v2 Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to Upstox solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real Upstox Credentials)

### 1. Create an Upstox Developer App
1. Log in to [Upstox Developer Portal](https://upstox.com/developer/api-documentation).
2. Click **New App** / **Create App**.
3. Set **App Name**: `RiskLoop`
4. Set **Redirect URL**:
   `http://localhost:3000/api/auth/upstox/callback`
5. Note your **API Key** (Client ID) and **API Secret**.

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# Upstox Configuration
UPSTOX_API_KEY=your_upstox_api_key_here
UPSTOX_API_SECRET=your_upstox_api_secret_here
UPSTOX_REDIRECT_URI=http://localhost:3000/api/auth/upstox/callback
```

---

### 3. Connect Upstox from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **Upstox**.
4. You will be redirected to the Upstox OAuth2 login dialog.
5. After authentication, Upstox redirects back to `http://localhost:3000/api/auth/upstox/callback` which validates the auth code, initializes the read-only session, starts background historical trade synchronization into SQLite, and returns you to the Journal!

---

## 📡 Supported Read-Only API Endpoints

- `GET /api/auth/upstox/login-url` - Returns Upstox OAuth2 authorization URL
- `GET /api/auth/upstox/callback` - Handles OAuth2 redirect & token exchange
- `GET /api/account/profile?brokerId=upstox` - User profile & active segments
- `GET /api/account/funds?brokerId=upstox` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=upstox` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=upstox` - Portfolio holdings
- `GET /api/orders?brokerId=upstox` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=upstox` - Broker-confirmed execution history (persisted in SQLite)
