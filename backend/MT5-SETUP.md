# 🔌 MetaTrader 5 (MT5) Universal Broker Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to MetaTrader 5 (and all MT5-compatible brokers) solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal (executed deals & fills)
- 💼 Balance, Equity & Margins Overview
- 📈 Realized & Unrealized P&L
- 🎯 Forex / CFD / Metals / Crypto Analytics & Risk Metrics

Only broker-confirmed executed deals become RiskLoop trades.

---

## 🌐 Supported MT5-Compatible Brokers (Unified MT5 Engine)

RiskLoop reuses a single, high-performance read-only MT5 connector for **all** MT5 brokers without duplicate code:

- 🟢 **MetaTrader 5 (Generic)**
- 🟢 **IC Markets**
- 🟢 **Pepperstone**
- 🟢 **Exness**
- 🟢 **XM**
- 🟢 **FP Markets**
- 🟢 **FXTM**
- 🟢 **Vantage**
- 🟢 **Fusion Markets**

---

## 🚀 Setup Steps (When You Have Real MT5 Broker Credentials)

### 1. Get Your MT5 Account Details
1. Open your MT5 terminal (or broker dashboard from IC Markets, Pepperstone, Exness, etc.).
2. Note your **Account Number (Login)** (e.g., `10992288`).
3. Note your broker's **Server Name** (e.g. `ICMarketsSC-Live02`, `Pepperstone-Live01`, `Exness-Real2`).
4. Use your **Investor (Read-Only) Password** or Master Password.

---

### 2. Configure Environment Variables
Add your credentials to `backend/.env` (refer to `backend/.env.example`):

```bash
# MetaTrader 5 (MT5 Read-Only Connector)
MT5_LOGIN=your_mt5_account_number
MT5_PASSWORD=your_mt5_password_or_investor_password
MT5_SERVER=your_mt5_broker_server_name

# Optional REST Bridge / Gateway / MetaApi:
MT5_GATEWAY_URL=http://localhost:8080/api/mt5
MT5_API_TOKEN=your_gateway_or_metaapi_token
```

---

### 3. Connect from RiskLoop
1. Open RiskLoop at `http://localhost:3000/#journal`.
2. Click **Connect Broker** in the Journal Calendar header.
3. Select your broker card (**IC Markets**, **Pepperstone**, **Exness**, **XM**, **FP Markets**, **FXTM**, **Vantage**, **Fusion Markets**, or **MetaTrader 5**).
4. RiskLoop initializes the read-only connector, starts background historical synchronization into SQLite, and loads your journal!

---

## 📡 Supported Read-Only API Endpoints

- `POST /api/auth/mt5/login` - Authenticate using Login, Password, Server, and optional Gateway URL
- `GET /api/account/profile?brokerId=mt5` - Account info, leverage, currency, server
- `GET /api/account/funds?brokerId=mt5` - Balance, equity, margin, free margin, margin level
- `GET /api/positions?brokerId=mt5` - Open positions & floating P&L
- `GET /api/orders?brokerId=mt5` - Pending orders (read-only for reconciliation)
- `GET /api/trades?brokerId=mt5` - Broker-confirmed executed deals (persisted in SQLite)

