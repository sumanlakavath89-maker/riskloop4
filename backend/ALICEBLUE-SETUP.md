# 🔌 Alice Blue (ANT API v2) Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to Alice Blue solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real Alice Blue Credentials)

### 1. Get Your Alice Blue API Key
1. Log in to [Alice Blue ANT Web](https://ant.aliceblueonline.com/).
2. Navigate to **Profile → Developer API / API Key**.
3. Generate and copy your **API Key**.
4. Note your **User ID** (Client Code, e.g., `AB102030`).

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# Alice Blue (ANT API v2)
ALICEBLUE_USER_ID=your_aliceblue_client_code
ALICEBLUE_API_KEY=your_aliceblue_api_key_here
```

---

### 3. Connect Alice Blue from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **Alice Blue**.
4. RiskLoop securely exchanges the encryption key and session ID server-side, starts background historical trade synchronization into SQLite, and loads your Alice Blue journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/aliceblue/login` - Authenticate using User ID & API Key
- `GET /api/account/profile?brokerId=aliceblue` - User profile & active segments
- `GET /api/account/funds?brokerId=aliceblue` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=aliceblue` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=aliceblue` - Portfolio holdings
- `GET /api/orders?brokerId=aliceblue` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=aliceblue` - Broker-confirmed execution history (persisted in SQLite)
