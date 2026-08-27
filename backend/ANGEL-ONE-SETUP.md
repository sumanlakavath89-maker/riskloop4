# 🔌 Angel One SmartAPI Integration Guide

## 📋 Read-Only Architecture Overview

**RiskLoop is strictly a READ-ONLY broker analytics and journal platform.**

RiskLoop will **NEVER**:
- ❌ Place orders
- ❌ Modify orders
- ❌ Cancel orders
- ❌ Execute trades
- ❌ Trade on behalf of users

RiskLoop connects to broker accounts solely to ingest **broker-confirmed trading data** for:
- 📊 Trading Journal
- 💼 Portfolio & Holdings Overview
- 📈 Realized & Unrealized P&L
- 🎯 Performance Analytics & Risk Metrics

Only broker-confirmed executions/fills become RiskLoop trades.

## ⚠️ Important Security Notes

- **Never commit your .env file** to Git
- **Never share your API credentials**
- **Never log tokens or MPIN**
- Test in Angel One's sandbox environment first (if available)
- Use a separate test account for development

## 🚀 Step-by-Step Setup

### 1. Get Angel One API Credentials

1. Visit [Angel One SmartAPI Portal](https://smartapi.angelone.in/)
2. Login with your Angel One account
3. Navigate to "Create App" or "API Key"
4. Generate new API credentials:
   - **API Key** (also called Private Key)
   - **Client ID** (your Angel One user ID)
   - **MPIN** (your 4-digit trading PIN)
   - **TOTP Secret** (for 2FA)

### 2. Enable TOTP (Two-Factor Authentication)

1. In SmartAPI portal, go to Security Settings
2. Enable TOTP / 2FA
3. Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.)
4. **Important:** Save the TOTP secret key (base32 string shown below QR code)
   - This is NOT the 6-digit code
   - It's a long string like: `JBSWY3DPEHPK3PXP`

### 3. Configure Environment Variables

Edit `backend/.env` file (create it from `.env.example` if needed):

```bash
# Angel One Configuration
ANGELONE_API_KEY=your_api_key_here
ANGELONE_CLIENT_ID=your_client_id_here
ANGELONE_MPIN=your_4_digit_mpin
ANGELONE_TOTP_SECRET=your_totp_secret_here
```

Example:
```bash
ANGELONE_API_KEY=AbCd1234EfGh5678
ANGELONE_CLIENT_ID=A12345
ANGELONE_MPIN=1234
ANGELONE_TOTP_SECRET=JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP
```

### 4. Install Dependencies

```powershell
cd backend
npm install
```

This will install the new `otpauth` package needed for TOTP generation.

### 5. Start the Server

```powershell
npm run dev
```

Server should start on `http://localhost:3000`

## 🧪 Testing the Integration

### Test 1: Check Configuration

```powershell
curl http://localhost:3000/api/dev/angelone/check-config
```

Expected response:
```json
{
  "success": true,
  "configured": true,
  "details": {
    "apiKey": true,
    "clientId": true,
    "mpin": true,
    "totpSecret": true
  },
  "message": "All Angel One environment variables are configured"
}
```

If any show `false`, that environment variable is missing.

### Test 2: Test Connection & Profile

```powershell
curl -X POST http://localhost:3000/api/dev/angelone/test-connection `
  -H "Content-Type: application/json" `
  -d '{}'
```

This will:
1. ✅ Authenticate with Angel One
2. ✅ Fetch your profile
3. ✅ Fetch your funds
4. ✅ Disconnect

Expected response:
```json
{
  "success": true,
  "message": "Angel One connection test successful",
  "data": {
    "connected": true,
    "profile": {
      "userId": "A12345",
      "name": "Your Name",
      "email": "your@email.com",
      "exchanges": ["NSE", "BSE", "MCX"],
      "products": ["CNC", "MIS", "NRML"]
    },
    "funds": {
      "availableMargin": 50000.00,
      "usedMargin": 10000.00,
      "totalMargin": 60000.00
    }
  }
}
```

### Test 3: Full Workflow Test

```powershell
# 1. Connect to Angel One
curl -X POST http://localhost:3000/api/auth/connect `
  -H "Content-Type: application/json" `
  -d '{\"brokerId\":\"angelone\"}'

# 2. Get Profile
curl "http://localhost:3000/api/account/profile?brokerId=angelone"

# 3. Get Funds
curl "http://localhost:3000/api/account/funds?brokerId=angelone"

# 4. Get Positions
curl "http://localhost:3000/api/positions?brokerId=angelone"

# 5. Get Orders
curl "http://localhost:3000/api/orders?brokerId=angelone"

# 6. Get Holdings
curl "http://localhost:3000/api/holdings?brokerId=angelone"

# 7. Get Trade History
curl "http://localhost:3000/api/trades?brokerId=angelone"

# 8. Disconnect
curl -X POST http://localhost:3000/api/auth/disconnect `
  -H "Content-Type: application/json" `
  -d '{\"brokerId\":\"angelone\"}'
```

## 🔍 Troubleshooting

### Error: "YOUR USER ID OR PASSWORD IS INVALID"

**Causes:**
- Wrong Client ID
- Wrong MPIN
- MPIN length > 4 characters (switch to MPIN mode)

**Solution:**
- Verify Client ID in Angel One web portal
- Verify MPIN (4-digit trading PIN)
- Ensure MPIN is exactly 4 digits

### Error: "TOTP validation failed" or "Invalid TOTP"

**Causes:**
- Wrong TOTP secret
- Time sync issue between server and Angel One

**Solution:**
- Verify TOTP secret is the base32 string, not the 6-digit code
- Check server time: `Get-Date` (should match IST)
- Regenerate TOTP secret in Angel One portal

### Error: "Configuration error: ANGELONE_TOTP_SECRET is required"

**Cause:**
- Environment variable not loaded

**Solution:**
- Ensure `.env` file exists in `backend/` folder
- Restart server after editing `.env`
- Check for typos in variable names

### Error: "Network error" or timeout

**Causes:**
- Internet connectivity issue
- Angel One API down
- Firewall blocking outbound requests

**Solution:**
- Check internet connection
- Try accessing https://apiconnect.angelbroking.com/health
- Check firewall settings

### Error: "Not connected to broker"

**Cause:**
- Session expired or not authenticated

**Solution:**
- Call `/api/auth/connect` first
- Check connection status: `/api/auth/status/angelone`

## 📊 What's Implemented

### ✅ Completed Features

- [x] **Authentication** with TOTP
- [x] **Get Profile** - User account details
- [x] **Get Funds** - Available margin, used margin
- [x] **Get Positions** - Open positions
- [x] **Get Orders** - Order book
- [x] **Get Holdings** - Long-term holdings
- [x] **Get Trade History** - Executed trades
- [x] **Get Quotes** - Market quotes (basic)
- [x] **Disconnect/Logout** - Clean session termination
- [x] **Data Normalization** - All responses converted to RiskLoop models
- [x] **Security** - No tokens logged, safe error handling
- [x] **Development test endpoint** - Easy testing

### ❌ Not Implemented (Phase 1)

- [ ] Order placement
- [ ] Order modification
- [ ] Order cancellation
- [ ] GTT orders
- [ ] Bracket orders
- [ ] Cover orders

These are intentionally disabled in Phase 1 (read-only).

## 🔐 Security Best Practices

### DO:
✅ Use environment variables for credentials  
✅ Keep .env file in .gitignore  
✅ Use separate test account for development  
✅ Test in sandbox if available  
✅ Rotate API keys periodically  
✅ Monitor API usage limits  
✅ Implement rate limiting  
✅ Log only non-sensitive data  

### DON'T:
❌ Commit credentials to Git  
❌ Share API keys publicly  
❌ Log tokens, MPIN, or TOTP  
❌ Use production account for testing  
❌ Expose credentials in frontend  
❌ Store credentials in database unencrypted  
❌ Share TOTP secret  

## 📝 API Endpoints Reference

### Authentication
- `POST /api/auth/connect` - Connect to Angel One
- `POST /api/auth/disconnect` - Disconnect
- `GET /api/auth/status/angelone` - Check connection status

### Account Data
- `GET /api/account/profile?brokerId=angelone` - User profile
- `GET /api/account/funds?brokerId=angelone` - Funds/margin

### Trading Data
- `GET /api/positions?brokerId=angelone` - Positions
- `GET /api/orders?brokerId=angelone` - Order book
- `GET /api/holdings?brokerId=angelone` - Holdings
- `GET /api/trades?brokerId=angelone` - Trade history
- `POST /api/quotes?brokerId=angelone` - Market quotes

### Development (Remove in Production)
- `GET /api/dev/angelone/check-config` - Check env variables
- `POST /api/dev/angelone/test-connection` - Quick test

## 🎯 Read-Only Data Flow

1. ✅ Connect to Angel One via SmartAPI login + TOTP 2FA
2. ✅ Ingest broker profile, margin limits & available cash
3. ✅ Synchronize broker-confirmed trades (`getTradeBook`) into Trading Journal
4. ✅ Stream live fills via WebSocket into SQLite trade persistence
5. ✅ Reconcile open positions, realized/unrealized P&L and holdings
6. 🔒 Strict enforcement: Zero order placement, modification, or execution endpoints

## 📞 Support

### Angel One Support
- SmartAPI Forum: https://smartapi.angelone.in/smartapi/forum
- Documentation: https://smartapi.angelbroking.com/docs
- Support Email: smartapi@angelbroking.com

### Common Issues
- Check Angel One API status page
- Review SmartAPI forum for known issues
- Ensure account is activated for API trading
- Verify NSE/BSE segment permissions

## ⚠️ Disclaimer

This integration is for educational and development purposes. Always:
- Test thoroughly before using with real money
- Understand API rate limits
- Monitor your positions and orders
- Use proper risk management
- Comply with Angel One's terms of service

---

**🛡️ RiskLoop + Angel One SmartAPI**  
**Status:** ✅ Read-Only Integration Complete  
**Version:** 1.0.0
