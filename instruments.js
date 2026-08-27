/* ============================================================
   INSTRUMENTS MASTER DATA
   Centralized configuration for all asset types.
   All CLC calculators read from these arrays — never from
   individual component logic.

   Schema
   ------
   assetType   : 'stock' | 'fo' | 'forex' | 'crypto'
   symbol      : string  — ticker / pair symbol
   name        : string  — human-readable full name
   exchange    : string  — 'NSE' | 'BSE' | 'OTC' | 'CEX'
   type        : string  — sub-category tag shown in dropdown
   lotSize     : number  — shares per lot (stock/fo) or contract size
   tickSize    : number  — minimum price increment
   pipValue    : number  — USD value of 1 pip/point per 1.0 lot (forex/crypto)
   stopUnit    : string  — 'points' | 'pips' | 'price difference'
   minLot      : number  — broker minimum tradable lot size
   tvTip       : string  — TradingView conversion note (optional)
   approxPrice : number  — approximate price for crypto $100 filter (USD)
   updated     : string  — YYYY-MM-DD of last data verification
   ============================================================ */

/* ============================================================
   NSE EQUITY STOCKS  (F&O-eligible + additional large/mid caps)
   Lot sizes per NSE circular effective Apr 2025.
   Price-sizing field not required — stock CLC uses ₹/share stop.
   ============================================================ */
const NSE_STOCKS = [
  // Nifty 50
  { symbol:"RELIANCE",    name:"Reliance Industries",          exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TCS",         name:"Tata Consultancy Services",    exchange:"NSE", type:"Stock", lotSize:175,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HDFCBANK",    name:"HDFC Bank",                    exchange:"NSE", type:"Stock", lotSize:550,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ICICIBANK",   name:"ICICI Bank",                   exchange:"NSE", type:"Stock", lotSize:700,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"INFY",        name:"Infosys",                      exchange:"NSE", type:"Stock", lotSize:400,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SBIN",        name:"State Bank of India",          exchange:"NSE", type:"Stock", lotSize:1500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BHARTIARTL",  name:"Bharti Airtel",                exchange:"NSE", type:"Stock", lotSize:950,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"LT",          name:"Larsen & Toubro",              exchange:"NSE", type:"Stock", lotSize:150,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"AXISBANK",    name:"Axis Bank",                    exchange:"NSE", type:"Stock", lotSize:625,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"KOTAKBANK",   name:"Kotak Mahindra Bank",          exchange:"NSE", type:"Stock", lotSize:400,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HCLTECH",     name:"HCL Technologies",             exchange:"NSE", type:"Stock", lotSize:700,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"WIPRO",       name:"Wipro",                        exchange:"NSE", type:"Stock", lotSize:1500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ITC",         name:"ITC Limited",                  exchange:"NSE", type:"Stock", lotSize:1600, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HINDUNILVR",  name:"Hindustan Unilever",           exchange:"NSE", type:"Stock", lotSize:300,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ASIANPAINT",  name:"Asian Paints",                 exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BAJFINANCE",  name:"Bajaj Finance",                exchange:"NSE", type:"Stock", lotSize:125,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BAJAJFINSV",  name:"Bajaj Finserv",                exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"MARUTI",      name:"Maruti Suzuki India",          exchange:"NSE", type:"Stock", lotSize:50,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TITAN",       name:"Titan Company",                exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TATAMOTORS",  name:"Tata Motors",                  exchange:"NSE", type:"Stock", lotSize:1425, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TATASTEEL",   name:"Tata Steel",                   exchange:"NSE", type:"Stock", lotSize:5500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SUNPHARMA",   name:"Sun Pharmaceutical Industries",exchange:"NSE", type:"Stock", lotSize:350,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"NTPC",        name:"NTPC Limited",                 exchange:"NSE", type:"Stock", lotSize:2700, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"POWERGRID",   name:"Power Grid Corp of India",     exchange:"NSE", type:"Stock", lotSize:2700, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ONGC",        name:"Oil & Natural Gas Corp",       exchange:"NSE", type:"Stock", lotSize:3850, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"COALINDIA",   name:"Coal India",                   exchange:"NSE", type:"Stock", lotSize:2100, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"JSWSTEEL",    name:"JSW Steel",                    exchange:"NSE", type:"Stock", lotSize:1000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HINDALCO",    name:"Hindalco Industries",          exchange:"NSE", type:"Stock", lotSize:1400, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"GRASIM",      name:"Grasim Industries",            exchange:"NSE", type:"Stock", lotSize:275,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ADANIENT",    name:"Adani Enterprises",            exchange:"NSE", type:"Stock", lotSize:300,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ADANIPORTS",  name:"Adani Ports & SEZ",            exchange:"NSE", type:"Stock", lotSize:800,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ULTRACEMCO",  name:"UltraTech Cement",             exchange:"NSE", type:"Stock", lotSize:50,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"DRREDDY",     name:"Dr Reddy's Laboratories",      exchange:"NSE", type:"Stock", lotSize:625,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"CIPLA",       name:"Cipla",                        exchange:"NSE", type:"Stock", lotSize:650,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"DIVISLAB",    name:"Divi's Laboratories",          exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"EICHERMOT",   name:"Eicher Motors",                exchange:"NSE", type:"Stock", lotSize:175,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"M&M",         name:"Mahindra & Mahindra",          exchange:"NSE", type:"Stock", lotSize:350,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BAJAJ-AUTO",  name:"Bajaj Auto",                   exchange:"NSE", type:"Stock", lotSize:75,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HEROMOTOCO",  name:"Hero MotoCorp",                exchange:"NSE", type:"Stock", lotSize:150,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"NESTLEIND",   name:"Nestle India",                 exchange:"NSE", type:"Stock", lotSize:250,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BRITANNIA",   name:"Britannia Industries",         exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TECHM",       name:"Tech Mahindra",                exchange:"NSE", type:"Stock", lotSize:600,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"INDUSINDBK",  name:"IndusInd Bank",                exchange:"NSE", type:"Stock", lotSize:900,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SBILIFE",     name:"SBI Life Insurance",           exchange:"NSE", type:"Stock", lotSize:750,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HDFCLIFE",    name:"HDFC Life Insurance",          exchange:"NSE", type:"Stock", lotSize:1100, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"APOLLOHOSP",  name:"Apollo Hospitals Enterprise",  exchange:"NSE", type:"Stock", lotSize:125,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"DLF",         name:"DLF Limited",                  exchange:"NSE", type:"Stock", lotSize:1650, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"VEDL",        name:"Vedanta Limited",              exchange:"NSE", type:"Stock", lotSize:2300, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ZOMATO",      name:"Eternal (Zomato)",             exchange:"NSE", type:"Stock", lotSize:3425, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PIDILITIND",  name:"Pidilite Industries",          exchange:"NSE", type:"Stock", lotSize:250,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SHREECEM",    name:"Shree Cement",                 exchange:"NSE", type:"Stock", lotSize:25,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TRENT",       name:"Trent Limited",                exchange:"NSE", type:"Stock", lotSize:275,  tickSize:0.05, updated:"2025-04-01" },
  // Nifty Next 50 / additional F&O stocks
  { symbol:"ABB",         name:"ABB India",                    exchange:"NSE", type:"Stock", lotSize:250,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"AMBUJACEM",   name:"Ambuja Cements",               exchange:"NSE", type:"Stock", lotSize:2000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"AUROPHARMA",  name:"Aurobindo Pharma",             exchange:"NSE", type:"Stock", lotSize:1000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BANDHANBNK",  name:"Bandhan Bank",                 exchange:"NSE", type:"Stock", lotSize:5000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BANKBARODA",  name:"Bank of Baroda",               exchange:"NSE", type:"Stock", lotSize:4350, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BERGEPAINT",  name:"Berger Paints India",          exchange:"NSE", type:"Stock", lotSize:1100, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"BPCL",        name:"Bharat Petroleum Corp",        exchange:"NSE", type:"Stock", lotSize:1800, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"CANBK",       name:"Canara Bank",                  exchange:"NSE", type:"Stock", lotSize:5000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"CHOLAFIN",    name:"Cholamandalam Investment",     exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"COLPAL",      name:"Colgate-Palmolive India",      exchange:"NSE", type:"Stock", lotSize:350,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"CONCOR",      name:"Container Corp of India",      exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"CUB",         name:"City Union Bank",              exchange:"NSE", type:"Stock", lotSize:4500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"DABUR",       name:"Dabur India",                  exchange:"NSE", type:"Stock", lotSize:1250, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"DMART",       name:"Avenue Supermarts",            exchange:"NSE", type:"Stock", lotSize:150,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"FEDERALBNK",  name:"Federal Bank",                 exchange:"NSE", type:"Stock", lotSize:5000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"GAIL",        name:"GAIL India",                   exchange:"NSE", type:"Stock", lotSize:3250, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"GMRINFRA",    name:"GMR Airports Infrastructure",  exchange:"NSE", type:"Stock", lotSize:8000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"GODREJCP",    name:"Godrej Consumer Products",     exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"GODREJPROP",  name:"Godrej Properties",            exchange:"NSE", type:"Stock", lotSize:325,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"HAVELLS",     name:"Havells India",                exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"ICICIPRULI",  name:"ICICI Prudential Life Insurance",exchange:"NSE",type:"Stock",lotSize:1500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"IDFCFIRSTB",  name:"IDFC First Bank",              exchange:"NSE", type:"Stock", lotSize:9000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"IEX",         name:"Indian Energy Exchange",       exchange:"NSE", type:"Stock", lotSize:3750, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"INDUSTOWER",  name:"Indus Towers",                 exchange:"NSE", type:"Stock", lotSize:2700, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"IRCTC",       name:"Indian Railway Catering Corp", exchange:"NSE", type:"Stock", lotSize:875,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"IRFC",        name:"Indian Railway Finance Corp",  exchange:"NSE", type:"Stock", lotSize:4500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"LICI",        name:"Life Insurance Corp of India", exchange:"NSE", type:"Stock", lotSize:700,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"LUPIN",       name:"Lupin",                        exchange:"NSE", type:"Stock", lotSize:425,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"MARICO",      name:"Marico",                       exchange:"NSE", type:"Stock", lotSize:1200, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"MCDOWELL-N",  name:"United Spirits",               exchange:"NSE", type:"Stock", lotSize:625,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"MUTHOOTFIN",  name:"Muthoot Finance",              exchange:"NSE", type:"Stock", lotSize:375,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"NAUKRI",      name:"Info Edge India",              exchange:"NSE", type:"Stock", lotSize:150,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"NMDC",        name:"NMDC",                         exchange:"NSE", type:"Stock", lotSize:5500, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"OBEROIRLTY",  name:"Oberoi Realty",                exchange:"NSE", type:"Stock", lotSize:400,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"OFSS",        name:"Oracle Financial Services",    exchange:"NSE", type:"Stock", lotSize:100,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PAGEIND",     name:"Page Industries",              exchange:"NSE", type:"Stock", lotSize:15,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PEL",         name:"Piramal Enterprises",          exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PERSISTENT",  name:"Persistent Systems",           exchange:"NSE", type:"Stock", lotSize:125,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PETRONET",    name:"Petronet LNG",                 exchange:"NSE", type:"Stock", lotSize:3000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PIIND",       name:"PI Industries",                exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"PNB",         name:"Punjab National Bank",         exchange:"NSE", type:"Stock", lotSize:8000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"POLICYBZR",   name:"PB Fintech",                   exchange:"NSE", type:"Stock", lotSize:1375, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"RECLTD",      name:"REC Limited",                  exchange:"NSE", type:"Stock", lotSize:1700, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SAIL",        name:"Steel Authority of India",     exchange:"NSE", type:"Stock", lotSize:7000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SIEMENS",     name:"Siemens India",                exchange:"NSE", type:"Stock", lotSize:125,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SOLARINDS",   name:"Solar Industries India",       exchange:"NSE", type:"Stock", lotSize:100,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SRF",         name:"SRF Limited",                  exchange:"NSE", type:"Stock", lotSize:375,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"STARHEALTH",  name:"Star Health & Allied Insurance",exchange:"NSE",type:"Stock", lotSize:1000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SUPREMEIND",  name:"Supreme Industries",           exchange:"NSE", type:"Stock", lotSize:200,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TATACOMM",    name:"Tata Communications",          exchange:"NSE", type:"Stock", lotSize:475,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TATACONSUM",  name:"Tata Consumer Products",       exchange:"NSE", type:"Stock", lotSize:800,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TATAPOWER",   name:"Tata Power Company",           exchange:"NSE", type:"Stock", lotSize:2875, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TORNTPHARM",  name:"Torrent Pharmaceuticals",      exchange:"NSE", type:"Stock", lotSize:250,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TORNTPOWER",  name:"Torrent Power",                exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"TVSMOTOR",    name:"TVS Motor Company",            exchange:"NSE", type:"Stock", lotSize:350,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"UBL",         name:"United Breweries",             exchange:"NSE", type:"Stock", lotSize:350,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"UNIONBANK",   name:"Union Bank of India",          exchange:"NSE", type:"Stock", lotSize:6000, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"UPL",         name:"UPL",                          exchange:"NSE", type:"Stock", lotSize:1600, tickSize:0.05, updated:"2025-04-01" },
  { symbol:"VOLTAS",      name:"Voltas",                       exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"WHIRLPOOL",   name:"Whirlpool of India",           exchange:"NSE", type:"Stock", lotSize:500,  tickSize:0.05, updated:"2025-04-01" },
  { symbol:"YESBANK",     name:"Yes Bank",                     exchange:"NSE", type:"Stock", lotSize:40000,tickSize:0.05, updated:"2025-04-01" },
];

/* ============================================================
   NSE INDEX F&O CONTRACTS
   These appear ONLY in the F&O calculator, not in Stocks.
   ============================================================ */
const NSE_FO_INDICES = [
  { symbol:"NIFTY",       name:"Nifty 50",                     exchange:"NSE", type:"Index",   lotSize:75,   tickSize:0.05, updated:"2026-06-27" },
  { symbol:"BANKNIFTY",   name:"Nifty Bank",                   exchange:"NSE", type:"Index",   lotSize:30,   tickSize:0.05, updated:"2026-01-27" },
  { symbol:"FINNIFTY",    name:"Nifty Financial Services",     exchange:"NSE", type:"Index",   lotSize:65,   tickSize:0.05, updated:"2026-01-27" },
  { symbol:"MIDCPNIFTY",  name:"Nifty Midcap Select",          exchange:"NSE", type:"Index",   lotSize:120,  tickSize:0.05, updated:"2025-10-28" },
  { symbol:"NIFTYNXT50",  name:"Nifty Next 50",                exchange:"NSE", type:"Index",   lotSize:25,   tickSize:0.05, updated:"2025-04-01" },
  { symbol:"SENSEX",      name:"S&P BSE Sensex",               exchange:"BSE", type:"Index",   lotSize:20,   tickSize:0.05, updated:"2025-06-01" },
  { symbol:"BANKEX",      name:"S&P BSE Bankex",               exchange:"BSE", type:"Index",   lotSize:15,   tickSize:0.05, updated:"2025-06-01" },
];

/* ============================================================
   DERIVED DATABASES (what each calculator actually uses)
   ============================================================ */

// Stock CLC — equity shares only
const STOCK_INSTRUMENTS = NSE_STOCKS;

// F&O CLC — indices + all F&O-eligible stocks, sorted: indices first
const FO_INSTRUMENTS = [
  ...NSE_FO_INDICES,
  ...NSE_STOCKS,
];

/* ============================================================
   FOREX INSTRUMENTS
   pipValue: USD value of 1 pip (0.0001 for most pairs) per
             1.0 standard lot (100,000 units).
   USDJPY:  1 pip = 0.01 JPY; per lot ≈ $9.09 at 110 USDJPY.
   Metals/Indices use 'points' stop unit.
   ============================================================ */
const FOREX_INSTRUMENTS = [
  // ── Major pairs ──────────────────────────────────────────
  { symbol:"EURUSD", name:"Euro / US Dollar",            exchange:"OTC", type:"Forex/Major",  pipValue:10,    lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"GBPUSD", name:"British Pound / US Dollar",   exchange:"OTC", type:"Forex/Major",  pipValue:10,    lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"USDJPY", name:"US Dollar / Japanese Yen",    exchange:"OTC", type:"Forex/Major",  pipValue:9.09,  lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"AUDUSD", name:"Australian Dollar / US Dollar",exchange:"OTC",type:"Forex/Major",  pipValue:10,    lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"USDCAD", name:"US Dollar / Canadian Dollar", exchange:"OTC", type:"Forex/Major",  pipValue:7.69,  lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"USDCHF", name:"US Dollar / Swiss Franc",     exchange:"OTC", type:"Forex/Major",  pipValue:10.86, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"NZDUSD", name:"New Zealand Dollar / US Dollar",exchange:"OTC",type:"Forex/Major", pipValue:10,    lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"USDSGD", name:"US Dollar / Singapore Dollar",exchange:"OTC", type:"Forex/Major",  pipValue:7.41,  lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"USDHKD", name:"US Dollar / Hong Kong Dollar",exchange:"OTC", type:"Forex/Major",  pipValue:1.28,  lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  // ── Minor / cross pairs ───────────────────────────────────
  { symbol:"EURGBP", name:"Euro / British Pound",        exchange:"OTC", type:"Forex/Minor",  pipValue:12.58, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"EURJPY", name:"Euro / Japanese Yen",         exchange:"OTC", type:"Forex/Minor",  pipValue:9.09,  lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"GBPJPY", name:"British Pound / Japanese Yen",exchange:"OTC", type:"Forex/Minor",  pipValue:9.09,  lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"AUDJPY", name:"Australian Dollar / Japanese Yen",exchange:"OTC",type:"Forex/Minor",pipValue:9.09, lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"EURCAD", name:"Euro / Canadian Dollar",      exchange:"OTC", type:"Forex/Minor",  pipValue:7.69,  lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"EURCHF", name:"Euro / Swiss Franc",          exchange:"OTC", type:"Forex/Minor",  pipValue:10.86, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"GBPCHF", name:"British Pound / Swiss Franc", exchange:"OTC", type:"Forex/Minor",  pipValue:10.86, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"GBPCAD", name:"British Pound / Canadian Dollar",exchange:"OTC",type:"Forex/Minor",pipValue:7.69,  lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"AUDCAD", name:"Australian Dollar / Canadian Dollar",exchange:"OTC",type:"Forex/Minor",pipValue:7.69,lotSize:100000,tickSize:0.00001,stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"AUDCHF", name:"Australian Dollar / Swiss Franc",exchange:"OTC",type:"Forex/Minor",pipValue:10.86, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"AUDNZD", name:"Australian Dollar / New Zealand Dollar",exchange:"OTC",type:"Forex/Minor",pipValue:10,lotSize:100000,tickSize:0.00001,stopUnit:"pips",  minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"NZDCAD", name:"New Zealand Dollar / Canadian Dollar",exchange:"OTC",type:"Forex/Minor",pipValue:7.69,lotSize:100000,tickSize:0.00001,stopUnit:"pips",  minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"NZDCHF", name:"New Zealand Dollar / Swiss Franc",exchange:"OTC",type:"Forex/Minor",pipValue:10.86,lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"NZDJPY", name:"New Zealand Dollar / Japanese Yen",exchange:"OTC",type:"Forex/Minor",pipValue:9.09,lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"CADJPY", name:"Canadian Dollar / Japanese Yen",exchange:"OTC", type:"Forex/Minor", pipValue:9.09,  lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"CADCHF", name:"Canadian Dollar / Swiss Franc",exchange:"OTC",  type:"Forex/Minor", pipValue:10.86, lotSize:100000, tickSize:0.00001, stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  { symbol:"CHFJPY", name:"Swiss Franc / Japanese Yen",  exchange:"OTC",   type:"Forex/Minor", pipValue:9.09,  lotSize:100000, tickSize:0.001,   stopUnit:"pips",   minLot:0.01, tvTip:"10 Points = 1 Pip on TradingView.", updated:"2025-01-01" },
  // ── Precious Metals ───────────────────────────────────────
  { symbol:"XAUUSD", name:"Gold / US Dollar",            exchange:"OTC", type:"Metal",        pipValue:1,     lotSize:100,    tickSize:0.01,    stopUnit:"points", minLot:0.01, tvTip:"1 Point = $1 on TradingView. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"XAGUSD", name:"Silver / US Dollar",          exchange:"OTC", type:"Metal",        pipValue:0.5,   lotSize:5000,   tickSize:0.001,   stopUnit:"points", minLot:0.01, tvTip:"1 Point = $0.001 per oz. Enter the Points value shown on your chart.", updated:"2025-01-01" },
  { symbol:"XPTUSD", name:"Platinum / US Dollar",        exchange:"OTC", type:"Metal",        pipValue:1,     lotSize:50,     tickSize:0.01,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points.", updated:"2025-01-01" },
  { symbol:"XPDUSD", name:"Palladium / US Dollar",       exchange:"OTC", type:"Metal",        pipValue:1,     lotSize:100,    tickSize:0.01,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points.", updated:"2025-01-01" },
  // ── Global Indices (CFD) ─────────────────────────────────
  { symbol:"NAS100",  name:"Nasdaq 100 Index",           exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:0.25,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"US30",    name:"Dow Jones 30 Index",         exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:1,       stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"SPX500",  name:"S&P 500 Index",              exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:0.25,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"GER40",   name:"DAX 40 Index",               exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:0.5,     stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"UK100",   name:"FTSE 100 Index",             exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:0.5,     stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"FRA40",   name:"CAC 40 Index",               exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:0.5,     stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"JPN225",  name:"Nikkei 225 Index",           exchange:"OTC", type:"Index/CFD",    pipValue:0.0909,lotSize:1,      tickSize:1,       stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"HK50",    name:"Hang Seng 50 Index",         exchange:"OTC", type:"Index/CFD",    pipValue:1,     lotSize:1,      tickSize:1,       stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points exactly as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"USOIL",   name:"WTI Crude Oil",              exchange:"OTC", type:"Commodity",    pipValue:10,    lotSize:1000,   tickSize:0.01,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points (cents) as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"UKOIL",   name:"Brent Crude Oil",            exchange:"OTC", type:"Commodity",    pipValue:10,    lotSize:1000,   tickSize:0.01,    stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points (cents) as shown on TradingView.", updated:"2025-01-01" },
  { symbol:"NATGAS",  name:"Natural Gas",                exchange:"OTC", type:"Commodity",    pipValue:10,    lotSize:10000,  tickSize:0.001,   stopUnit:"points", minLot:0.01, tvTip:"Enter the stop-loss distance in Points as shown on TradingView.", updated:"2025-01-01" },
];

/* ============================================================
   CRYPTO INSTRUMENTS
   Full candidate list. All have approxPrice in USD.
   At runtime, CRYPTO_INSTRUMENTS_FILTERED is computed by
   filterCryptoByPrice(), keeping only coins where
   approxPrice >= CRYPTO_MIN_PRICE.

   approxPrice values are reference estimates as of Jul 2026.
   Replace with a live-price API call for production use.
   ============================================================ */
const CRYPTO_MIN_PRICE = 100; // USD — only coins >= this are shown

const CRYPTO_CANDIDATES = [
  // Price well above $100
  { symbol:"BTCUSD",  name:"Bitcoin / US Dollar",         exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.0001, approxPrice:97000,  updated:"2026-07-01" },
  { symbol:"ETHUSD",  name:"Ethereum / US Dollar",        exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.001,  approxPrice:3400,   updated:"2026-07-01" },
  { symbol:"BNBUSD",  name:"BNB / US Dollar",             exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.01,   approxPrice:680,    updated:"2026-07-01" },
  { symbol:"SOLUSD",  name:"Solana / US Dollar",          exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:0.01,   approxPrice:185,    updated:"2026-07-01" },
  { symbol:"AVAXUSD", name:"Avalanche / US Dollar",       exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:0.1,    approxPrice:140,    updated:"2026-07-01" },
  { symbol:"LTCUSD",  name:"Litecoin / US Dollar",        exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.1,    approxPrice:115,    updated:"2026-07-01" },
  { symbol:"ETCUSD",  name:"Ethereum Classic / US Dollar",exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:0.1,    approxPrice:30,     updated:"2026-07-01" },
  { symbol:"XMRUSD",  name:"Monero / US Dollar",          exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.01,   approxPrice:155,    updated:"2026-07-01" },
  { symbol:"DASHUSD", name:"Dash / US Dollar",            exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.01,   approxPrice:50,     updated:"2026-07-01" },
  { symbol:"MKRUSD",  name:"Maker / US Dollar",           exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.001,  approxPrice:1600,   updated:"2026-07-01" },
  { symbol:"AAVEUSD", name:"Aave / US Dollar",            exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.01,    stopUnit:"price difference", minLot:0.01,   approxPrice:195,    updated:"2026-07-01" },
  { symbol:"UNIUSD",  name:"Uniswap / US Dollar",         exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:0.1,    approxPrice:12,     updated:"2026-07-01" },
  { symbol:"LINKUSD", name:"Chainlink / US Dollar",       exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:0.1,    approxPrice:18,     updated:"2026-07-01" },
  { symbol:"DOTUSD",  name:"Polkadot / US Dollar",        exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.0001,  stopUnit:"price difference", minLot:1,      approxPrice:7,      updated:"2026-07-01" },
  { symbol:"XRPUSD",  name:"XRP / US Dollar",             exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.0001,  stopUnit:"price difference", minLot:10,     approxPrice:2.4,    updated:"2026-07-01" },
  { symbol:"ADAUSD",  name:"Cardano / US Dollar",         exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.00001, stopUnit:"price difference", minLot:10,     approxPrice:0.44,   updated:"2026-07-01" },
  { symbol:"MATICUSD",name:"Polygon / US Dollar",         exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.00001, stopUnit:"price difference", minLot:10,     approxPrice:0.35,   updated:"2026-07-01" },
  { symbol:"DOGEUSD", name:"Dogecoin / US Dollar",        exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.00001, stopUnit:"price difference", minLot:10,     approxPrice:0.14,   updated:"2026-07-01" },
  { symbol:"SHIBUSDT",name:"Shiba Inu / US Dollar",       exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.000000001, stopUnit:"price difference", minLot:1000000, approxPrice:0.00002,updated:"2026-07-01" },
  // Near / above $100 — borderline, included so filter works correctly
  { symbol:"NEARUSD", name:"NEAR Protocol / US Dollar",   exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:1,      approxPrice:5.5,    updated:"2026-07-01" },
  { symbol:"ATOMUSD",  name:"Cosmos / US Dollar",         exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.001,   stopUnit:"price difference", minLot:1,      approxPrice:7.8,    updated:"2026-07-01" },
  { symbol:"ALGOUSD",  name:"Algorand / US Dollar",       exchange:"CEX", type:"Crypto", pipValue:1, lotSize:1, tickSize:0.0001,  stopUnit:"price difference", minLot:10,     approxPrice:0.17,   updated:"2026-07-01" },
];

/**
 * filterCryptoByPrice
 * -------------------
 * Returns coins whose approxPrice >= CRYPTO_MIN_PRICE ($100).
 * In a production app, replace approxPrice with a live API
 * fetch (e.g. CoinGecko /simple/price) and call this function
 * after the prices are resolved.
 *
 * @param {number} [minPrice=CRYPTO_MIN_PRICE] - minimum USD price threshold
 * @returns {Array} filtered crypto instrument array
 */
function filterCryptoByPrice(minPrice = CRYPTO_MIN_PRICE) {
  return CRYPTO_CANDIDATES.filter(c => c.approxPrice >= minPrice);
}

// Active list used by the Crypto CLC — filtered at page load
const CRYPTO_INSTRUMENTS = filterCryptoByPrice();

/* ============================================================
   LEGACY COMPATIBILITY ALIASES
   The existing script.js references these names.
   Pointing them at the new master data maintains full
   backward-compatibility without touching script.js internals.
   ============================================================ */

// F&O CLC uses INSTRUMENT_DB
var INSTRUMENT_DB = typeof FO_INSTRUMENTS !== 'undefined' ? FO_INSTRUMENTS : [];

// Forex CLC uses FOREX_DB
var FOREX_DB = typeof FOREX_INSTRUMENTS !== 'undefined' ? FOREX_INSTRUMENTS : [];

// Crypto CLC uses CRYPTO_DB
var CRYPTO_DB = typeof CRYPTO_INSTRUMENTS !== 'undefined' ? CRYPTO_INSTRUMENTS : [];

/**
 * fetchMasterInstruments
 * Helper to fetch instruments from GET /api/instruments with query filters
 */
async function fetchMasterInstruments(filters = {}) {
  try {
    const params = new URLSearchParams();
    if (filters.search) params.append('search', filters.search);
    if (filters.symbol) params.append('symbol', filters.symbol);
    if (filters.name) params.append('name', filters.name);
    if (filters.asset_type || filters.assetType) params.append('asset_type', filters.asset_type || filters.assetType);
    if (filters.exchange) params.append('exchange', filters.exchange);
    if (filters.currency) params.append('currency', filters.currency);
    if (filters.limit) params.append('limit', filters.limit);

    const queryString = params.toString() ? `?${params.toString()}` : '';
    const res = await fetch(`/api/instruments${queryString}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    return json.data || [];
  } catch (err) {
    console.warn('[RiskLoop] fetchMasterInstruments error:', err);
    return [];
  }
}

if (typeof window !== 'undefined') {
  window.NSE_STOCKS = typeof NSE_STOCKS !== 'undefined' ? NSE_STOCKS : [];
  window.NSE_FO_INDICES = typeof NSE_FO_INDICES !== 'undefined' ? NSE_FO_INDICES : [];
  window.STOCK_INSTRUMENTS = typeof STOCK_INSTRUMENTS !== 'undefined' ? STOCK_INSTRUMENTS : [];
  window.FO_INSTRUMENTS = typeof FO_INSTRUMENTS !== 'undefined' ? FO_INSTRUMENTS : [];
  window.FOREX_INSTRUMENTS = typeof FOREX_INSTRUMENTS !== 'undefined' ? FOREX_INSTRUMENTS : [];
  window.CRYPTO_CANDIDATES = typeof CRYPTO_CANDIDATES !== 'undefined' ? CRYPTO_CANDIDATES : [];
  window.CRYPTO_INSTRUMENTS = typeof CRYPTO_INSTRUMENTS !== 'undefined' ? CRYPTO_INSTRUMENTS : [];
  window.INSTRUMENT_DB = INSTRUMENT_DB;
  window.FOREX_DB = FOREX_DB;
  window.CRYPTO_DB = CRYPTO_DB;
  window.fetchMasterInstruments = fetchMasterInstruments;

  // Asynchronously synchronize instruments from the backend master CSV on page load
  if (typeof fetch !== 'undefined') {
    fetchMasterInstruments().then(apiData => {
      if (apiData && apiData.length > 0) {
        const enrichedStocks = [];
        const enrichedIndices = [];
        const enrichedForex = [];
        const enrichedCrypto = [];

        apiData.forEach(item => {
          const type = (item.asset_type || '').toLowerCase();
          
          if (type === 'stock') {
            const match = NSE_STOCKS.find(s => s.symbol === item.symbol);
            enrichedStocks.push({
              symbol: item.symbol,
              name: item.name,
              exchange: item.exchange || 'NSE',
              currency: item.currency || 'INR',
              type: 'Stock',
              lotSize: match ? match.lotSize : 1,
              tickSize: match ? match.tickSize : 0.05,
              updated: match ? match.updated : '2026-08-20',
            });
          } else if (type === 'index') {
            const match = NSE_FO_INDICES.find(i => i.symbol === item.symbol);
            enrichedIndices.push({
              symbol: item.symbol,
              name: item.name,
              exchange: item.exchange || (item.symbol === 'SENSEX' || item.symbol === 'BANKEX' ? 'BSE' : 'NSE'),
              currency: item.currency || 'INR',
              type: 'Index',
              lotSize: match ? match.lotSize : (item.symbol === 'NIFTY' ? 65 : 30),
              tickSize: 0.05,
              updated: '2026-08-20',
            });
          } else if (type === 'forex' || type === 'metal' || type === 'commodity') {
            const match = FOREX_INSTRUMENTS.find(f => f.symbol === item.symbol);
            enrichedForex.push({
              symbol: item.symbol,
              name: item.name,
              exchange: item.exchange || 'OTC',
              currency: item.currency || 'USD',
              type: match ? match.type : (type === 'metal' ? 'Metal' : (type === 'commodity' ? 'Commodity' : 'Forex')),
              pipValue: match ? match.pipValue : (item.symbol.includes('JPY') ? 9.09 : 10),
              lotSize: match ? match.lotSize : 100000,
              tickSize: match ? match.tickSize : (item.symbol.includes('JPY') ? 0.001 : 0.00001),
              stopUnit: match ? match.stopUnit : (type === 'metal' || type === 'commodity' ? 'points' : 'pips'),
              minLot: match ? match.minLot : 0.01,
              tvTip: match ? match.tvTip : 'Enter stop-loss distance as shown on chart.',
              updated: '2026-08-20',
            });
          } else if (type === 'crypto') {
            const match = CRYPTO_CANDIDATES.find(c => c.symbol === item.symbol);
            enrichedCrypto.push({
              symbol: item.symbol,
              name: item.name,
              exchange: item.exchange || 'CEX',
              currency: item.currency || 'USD',
              type: 'Crypto',
              pipValue: match ? match.pipValue : 1,
              lotSize: match ? match.lotSize : 1,
              tickSize: match ? match.tickSize : 0.01,
              stopUnit: 'price difference',
              minLot: match ? match.minLot : 0.001,
              approxPrice: match ? match.approxPrice : 250,
              updated: '2026-08-20',
            });
          }
        });

        if (enrichedStocks.length > 0) {
          window.NSE_STOCKS = enrichedStocks;
          window.STOCK_INSTRUMENTS = enrichedStocks;
        }

        if (enrichedIndices.length > 0) {
          window.NSE_FO_INDICES = enrichedIndices;
        }

        if (enrichedIndices.length > 0 || enrichedStocks.length > 0) {
          const foList = [...enrichedIndices, ...enrichedStocks];
          window.FO_INSTRUMENTS = foList;
          window.INSTRUMENT_DB = foList;
        }

        if (enrichedForex.length > 0) {
          window.FOREX_INSTRUMENTS = enrichedForex;
          window.FOREX_DB = enrichedForex;
        }

        if (enrichedCrypto.length > 0) {
          window.CRYPTO_INSTRUMENTS = enrichedCrypto;
          window.CRYPTO_DB = enrichedCrypto;
        }

        window.dispatchEvent(new CustomEvent('riskloop_instruments_synced', {
          detail: {
            total: apiData.length,
            stocks: enrichedStocks.length,
            indices: enrichedIndices.length,
            forex: enrichedForex.length,
            crypto: enrichedCrypto.length,
          }
        }));
      }
    }).catch(err => {
      console.warn('[RiskLoop] Background instruments sync error:', err);
    });
  }
}

/* ============================================================
   EXPORTS (for Node/ESM environments — no-op in browsers)
   ============================================================ */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    NSE_STOCKS,
    NSE_FO_INDICES,
    STOCK_INSTRUMENTS,
    FO_INSTRUMENTS,
    FOREX_INSTRUMENTS,
    CRYPTO_CANDIDATES,
    CRYPTO_INSTRUMENTS,
    filterCryptoByPrice,
    CRYPTO_MIN_PRICE,
    fetchMasterInstruments,
    // Legacy aliases
    INSTRUMENT_DB,
    FOREX_DB,
    CRYPTO_DB,
  };
}
