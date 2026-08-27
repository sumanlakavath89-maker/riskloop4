# 🔌 SAMCO (StockNote API) Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to SAMCO solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real SAMCO Credentials)

### 1. Get Your SAMCO Account Credentials
1. Ensure your SAMCO trading account is active.
2. Note your **User ID** (Client ID, e.g., `SM998877`).
3. Note your **Trading Password**.
4. Note your **Year of Birth (YOB)** used as the 2FA secret (e.g., `1995`).

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# SAMCO (StockNote API)
SAMCO_USER_ID=your_samco_user_id
SAMCO_PASSWORD=your_samco_password
SAMCO_YOB=your_year_of_birth
```

---

### 3. Connect SAMCO from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **SAMCO**.
4. RiskLoop logs in to the StockNote API server-side, obtains your session token, starts background historical trade synchronization into SQLite, and displays your SAMCO journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/samco/login` - Authenticate using User ID, Password, and YOB
- `GET /api/account/profile?brokerId=samco` - User profile & active exchanges
- `GET /api/account/funds?brokerId=samco` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=samco` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=samco` - Portfolio holdings
- `GET /api/orders?brokerId=samco` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=samco` - Broker-confirmed execution history (persisted in SQLite)
