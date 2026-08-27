# 🔌 FYERS API v3 Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to FYERS solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real FYERS Credentials)

### 1. Create a FYERS API App
1. Go to the [FYERS API Dashboard](https://myapi.fyers.in/) and sign in.
2. Click **Create App**.
3. Set **App Name**: `RiskLoop`
4. Set **Redirect URL / Callback URL**:
   `http://localhost:3000/api/auth/fyers/callback`
5. Permissions: Select **Read-Only / Portfolio & Orders Data** (no trade placement required).
6. Copy your **App ID** (Format: `ClientID-100`, e.g., `XC12345-100`) and **Secret ID**.

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (use `backend/.env.example` as a reference):

```bash
# FYERS Configuration
FYERS_APP_ID=your_fyers_app_id_here-100
FYERS_SECRET_ID=your_fyers_secret_key_here
FYERS_REDIRECT_URI=http://localhost:3000/api/auth/fyers/callback
```

---

### 3. Connect FYERS from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **FYERS**.
4. You will be redirected to FYERS OAuth2 login.
5. Upon login approval, FYERS redirects back to `http://localhost:3000/api/auth/fyers/callback` which validates the authorization code, initializes the read-only session, starts background historical trade synchronization into SQLite, and returns you to the Journal!

---

## 📡 Supported Read-Only API Endpoints

- `GET /api/auth/fyers/login-url` - Returns FYERS OAuth2 authorization URL
- `GET /api/auth/fyers/callback` - Handles OAuth2 redirect & token exchange
- `GET /api/account/profile?brokerId=fyers` - User profile & account details
- `GET /api/account/funds?brokerId=fyers` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=fyers` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=fyers` - Portfolio holdings
- `GET /api/orders?brokerId=fyers` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=fyers` - Broker-confirmed execution history (persisted in SQLite)
