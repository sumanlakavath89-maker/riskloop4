# 🔌 Kotak Neo (Trade API) Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to Kotak Neo solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real Kotak Neo Credentials)

### 1. Get Your Kotak Neo API Credentials
1. Log in to [Kotak Neo Developer Portal](https://napi.kotaksecurities.com/devportal).
2. Go to **Applications → DefaultApplication / Create Application**.
3. Subscribe to the **Trade API** and generate your **Consumer Key** and **Consumer Secret**.
4. Note your registered **Mobile Number**, **Password**, or **Session Token**.

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# Kotak Neo (Trade API)
KOTAKNEO_CONSUMER_KEY=your_kotak_consumer_key_here
KOTAKNEO_CONSUMER_SECRET=your_kotak_consumer_secret_here
KOTAKNEO_MOBILE_NUMBER=your_registered_mobile_number
KOTAKNEO_PASSWORD=your_trading_password
# Optional direct session token:
KOTAKNEO_SESSION_TOKEN=
```

---

### 3. Connect Kotak Neo from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **Kotak Neo**.
4. RiskLoop performs OAuth2 gateway token exchange server-side, starts background historical trade synchronization into SQLite, and loads your Kotak Neo positions and journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/kotakneo/login` - Authenticate using Consumer Key/Secret & credentials
- `GET /api/account/profile?brokerId=kotakneo` - User profile & active exchanges
- `GET /api/account/funds?brokerId=kotakneo` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=kotakneo` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=kotakneo` - Portfolio holdings
- `GET /api/orders?brokerId=kotakneo` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=kotakneo` - Broker-confirmed execution history (persisted in SQLite)
