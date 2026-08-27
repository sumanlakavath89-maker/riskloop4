# 🔌 Shoonya (Finvasia) Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to Shoonya solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (fills & execution timestamps)
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

---

## 🚀 Setup Steps (When You Have Real Shoonya Credentials)

### 1. Get Your Shoonya API Credentials
1. Log in to [Finvasia Prism Portal](https://prism.finvasia.com/).
2. Navigate to **API Key Generation**.
3. Generate and note your **API Key** and **Vendor Code**.
4. Retrieve your **TOTP Secret** from your authenticator app setup or Finvasia profile.

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# Shoonya (Finvasia Noren API)
SHOONYA_USER_ID=your_shoonya_client_id_here
SHOONYA_PASSWORD=your_trading_password_here
SHOONYA_API_KEY=your_shoonya_api_key_here
SHOONYA_VENDOR_CODE=your_vendor_code_here
SHOONYA_IMEI=your_device_imei_or_custom_id
SHOONYA_TOTP_SECRET=your_totp_secret_key_here
```

---

### 3. Connect Shoonya from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select **Shoonya**.
4. RiskLoop performs SHA-256 password hashing and TOTP 2FA authentication server-side, starts background historical trade synchronization into SQLite, and loads your Shoonya journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/shoonya/login` - Authenticate using credentials/TOTP
- `GET /api/account/profile?brokerId=shoonya` - User profile & active exchanges
- `GET /api/account/funds?brokerId=shoonya` - Real-time funds, margin limits, & balance
- `GET /api/positions?brokerId=shoonya` - Open positions & Realized/Unrealized P&L
- `GET /api/holdings?brokerId=shoonya` - Portfolio holdings
- `GET /api/orders?brokerId=shoonya` - Order book (read-only for trade reconciliation)
- `GET /api/trades?brokerId=shoonya` - Broker-confirmed execution history (persisted in SQLite)
