# 🔌 Dhan API v2 Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to Dhan solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real Dhan Credentials)

### 1. Get Your Dhan Client ID & Access Token
1. Log in to [Dhan Web](https://web.dhan.co/).
2. Click on your profile icon in the top right.
3. Navigate to **DhanHQ Trading & Data APIs**.
4. Generate / Copy your **Access Token** (JWT token).
5. Note your **Dhan Client ID** (e.g., `1000012345`).

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# Dhan (DhanHQ v2 API)
DHAN_CLIENT_ID=your_dhan_client_id_here
DHAN_ACCESS_TOKEN=your_dhan_jwt_access_token_here
```

---

### 3. Connect Dhan from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **Dhan**.
4. RiskLoop validates your access token server-side, starts background historical trade synchronization into SQLite, and displays your Dhan positions and journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/dhan/token` - Connect to Dhan using Client ID & Access Token
- `GET /api/account/profile?brokerId=dhan` - User profile & active segments
- `GET /api/account/funds?brokerId=dhan` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=dhan` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=dhan` - Portfolio holdings & invested/current value
- `GET /api/orders?brokerId=dhan` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=dhan` - Broker-confirmed execution history (persisted in SQLite)
