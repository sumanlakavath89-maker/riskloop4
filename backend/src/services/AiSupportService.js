/**
 * RiskLoop AI Support Service
 * Knowledge-grounded AI assistant for terminal workflows, risk calculations,
 * broker integrations, and platform navigation.
 * 
 * SECURITY:
 * - Never accesses or returns passwords, broker API keys, TOTP secrets, or tokens.
 * - Does not access personal user trade data across users.
 * - Constrained strictly to official RiskLoop product features and rules.
 */

import axios from 'axios';

export const RISKLOOP_KNOWLEDGE_BASE = {
  calculator: {
    name: 'Position Calculator & Risk Sizer',
    description: 'Calculates exact lot quantities and share allocations based on maximum account risk percentage and stop loss distance.',
    features: [
      'Index F&O Sizer: Pre-calibrated lot sizes for NIFTY (25/75), BANKNIFTY (15/30), FINNIFTY (25/65), MIDCPNIFTY (50/120), SENSEX (10/20), and BANKEX (15/30).',
      'Option Buying & Selling Risk Math: Computes maximum cash at risk, lot quantity (always rounded down to prevent overexposure), and stop loss point values.',
      'Equity & Swing Sizer: Calculates exact share count based on total portfolio capital, risk percentage (e.g. 1%), entry price, and stop loss.',
      'Risk-Reward Validator: Enforces minimum target-to-risk ratio (e.g. 1:2 R:R) before order execution.'
    ]
  },
  journal: {
    name: 'Trade Journal & Analytics',
    description: 'Comprehensive execution logging, performance review, and trading psychology tracker.',
    features: [
      'Trade Logger: Records Symbol, Side (BUY/SELL), Entry/Exit price, Quantity, Realized P&L, Strategy tag, and Setup notes.',
      'Daily P&L Heatmap: Interactive calendar showing profitable and losing trading days with monthly aggregates.',
      'Psychology Tags: Log emotional state per trade (Disciplined, Followed Plan, FOMO, Revenge Trade, Premature Exit, Strict SL Hit).',
      'R-Multiple Tracking: Tracks realized returns as multiples of initial risk (e.g. +2.5R, -1.0R).',
      'Export Options: Full journal data export to CSV and JSON formats.'
    ]
  },
  portfolio: {
    name: 'Portfolio Analytics & Equity Curve',
    description: 'Institutional-grade portfolio metrics, drawdown tracking, and win-rate analysis.',
    features: [
      'Realized Equity Curve: Cumulative account growth timeline plotted against baseline trading capital.',
      'Win/Loss Metrics: Win Rate (%), Profit Factor, Average Win vs Average Loss, and Largest Winner/Loser.',
      'Long vs Short Ratio: Breakdown of performance across bullish vs bearish trade executions.',
      'Broker-Specific Performance: Comparative analytics across individual connected broker accounts.'
    ]
  },
  market: {
    name: 'Live Market Intelligence',
    description: 'Real-time countdowns, global trading sessions, and economic event tracking.',
    features: [
      'Indian Market Session: Live NSE/BSE clock (09:15 to 15:30 IST) with pre-market and post-market tracking.',
      'Forex 24-Hour Timeline: Interactive session overlaps across London, New York, Tokyo, and Sydney.',
      'Economic Radar: Live calendar of central bank decisions (RBI, US Fed, ECB), interest rate announcements, and CPI inflation prints.',
      'F&O Ban List: Real-time tracking of securities entering or exiting the NSE ban period.'
    ]
  },
  strategies: {
    name: 'Systematic Trading Strategies',
    description: 'Pre-defined institutional trading models with rule-based entry and exit criteria.',
    features: [
      'Strategy Library: Central Pivot Range (CPR) Breakout, Volume Weighted Average Price (VWAP) Reversal, Exponential Moving Average (EMA) Momentum Trend, Opening Range Breakout (ORB), and Gap Fill setups.',
      'Discipline Checklist: Required confirmation rules before taking a trade.'
    ]
  },
  brokers: {
    name: 'Multi-Broker Gateway',
    description: 'Secure, zero-credential-leak API connections to Indian and Forex brokers.',
    features: [
      'Supported Indian Brokers: Angel One (SmartAPI), Zerodha (Kite Connect), FYERS (v3 API), Dhan (DhanHQ v2), Upstox (v2 API), Shoonya / Finvasia (Noren API), Kotak Neo, SAMCO (StockNote), Alice Blue (ANT API).',
      'Forex & MT5 Gateway: MetaTrader 5 (MT5 Read-Only Connector) for account equity, margin, and order sync.',
      'Security Architecture: Broker credentials, API keys, and TOTP secrets are stored and authenticated server-side; never exposed to client browsers.'
    ]
  },
  riskShield: {
    name: 'Capital Shield & Risk Guardrails',
    description: 'Automated capital protection sentinel that prevents overtrading and account drawdowns.',
    features: [
      'Daily Drawdown Limit: Configurable maximum daily loss (default 3.0% / ₹15,000).',
      'Automatic Circuit Breaker: When daily loss exceeds the threshold, the terminal locks position sizing to prevent revenge trading.',
      'Max Risk per Trade: Strict cap enforcing that no single trade risks more than user-defined capital percentage (default 1.0%).',
      'Consecutive Loss Breaker: Restricts execution after consecutive losing trades (default 3).'
    ]
  },
  tradingSettings: {
    name: 'Trading Settings',
    description: 'Institutional risk management parameters, trading rules, and session controls.',
    features: [
      'Configurable Risk Parameters: Default risk per trade (%), max daily loss (%), max open risk (%), minimum R:R ratio.',
      'Execution Rules: Stop after daily loss toggle, stop after consecutive losses toggle, require mandatory stop loss.',
      'Market Preferences: Preferred instruments (Index Options, Equity Cash, Forex) and trading style configuration.'
    ]
  },
  generalSettings: {
    name: 'General Settings',
    description: 'Application appearance, notifications, and localization preferences.',
    features: [
      'Appearance: Theme mode (Dark, Light, System) and UI density (Comfortable, Compact).',
      'Notifications: Individual toggles for browser notifications, risk alerts, trade alerts, journal reminders, and broker connection updates.',
      'Localization: Timezone selector, Date format, Number format, and Currency display (INR ₹, USD $, EUR €, GBP £).',
      'Data Management: Export complete platform configuration and journal logs.'
    ]
  },
  profile: {
    name: 'My Profile',
    description: 'Personal trader identity, trading style classification, and baseline metrics.',
    features: [
      'Trader Profile: Full name, email, avatar, trading experience, and primary market focus.',
      'Performance Badges: Visual badges earned through disciplined execution and risk adherence.'
    ]
  },
  accountSecurity: {
    name: 'Account & Security',
    description: 'Authentication security, two-factor protection, and session monitoring.',
    features: [
      'Two-Factor Authentication (2FA): TOTP authenticator app integration for secure login.',
      'Session Management: View active browser sessions, IP locations, and device types.',
      'Login History: Detailed audit log of recent account access timestamps and statuses.'
    ]
  },
  supportTickets: {
    name: 'Support & Ticketing System',
    description: 'Direct support ticketing for platform questions, broker setup help, and technical assistance.',
    features: [
      'Ticket Generation: Unique ticket IDs (e.g. TICK-12345) with priority selection (Low, Medium, High, Urgent).',
      'Category Categorization: General, Broker Connection, Calculation / Math, Feature Request, Bug Report.',
      'Ticket Tracking: View ticket status (Open, In Progress, Resolved) and reply to support agents.'
    ]
  }
};

class AiSupportService {
  constructor() {
    this.openaiApiKey = process.env.OPENAI_API_KEY || null;
    this.geminiApiKey = process.env.GEMINI_API_KEY || null;
    this.anthropicApiKey = process.env.ANTHROPIC_API_KEY || null;
  }

  /**
   * Main entry point to ask RiskLoop AI
   * @param {Object} params
   * @param {string} params.query - User question
   * @param {Object} params.user - Authenticated user context
   * @returns {Promise<Object>} Response object
   */
  async ask({ query, user }) {
    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      throw new Error('Query is required');
    }

    const cleanQuery = query.trim().slice(0, 500);

    // 1. Check if external LLM API is configured
    if (this.openaiApiKey) {
      try {
        return await this._askOpenAI(cleanQuery, user);
      } catch (err) {
        console.warn('[AiSupportService] OpenAI API error, falling back to Knowledge Engine:', err.message);
      }
    } else if (this.geminiApiKey) {
      try {
        return await this._askGemini(cleanQuery, user);
      } catch (err) {
        console.warn('[AiSupportService] Gemini API error, falling back to Knowledge Engine:', err.message);
      }
    }

    // 2. Use Built-in Deterministic Knowledge Engine
    return this._askKnowledgeEngine(cleanQuery, user);
  }

  /**
   * Deterministic Knowledge Engine for instant, reliable answers without API dependencies
   */
  _askKnowledgeEngine(query, user) {
    const q = query.toLowerCase();

    // Check for Broker connection queries
    if (q.includes('broker') || q.includes('angel') || q.includes('zerodha') || q.includes('fyers') || q.includes('dhan') || q.includes('upstox') || q.includes('connect') || q.includes('api key') || q.includes('mt5')) {
      return {
        success: true,
        topic: 'Brokers & Gateway',
        answer: `RiskLoop supports direct API connectivity with **Angel One (SmartAPI)**, **Zerodha (Kite Connect)**, **FYERS (v3)**, **Dhan (DhanHQ)**, **Upstox (v2)**, **Shoonya / Finvasia**, **Kotak Neo**, and **MetaTrader 5 (MT5)**.\n\nTo connect your broker:\n1. Open the **Brokers** tab in the sidebar or click *Manage Brokers* on the Dashboard.\n2. Select your broker and enter your Client ID, API Key, and TOTP secret.\n3. Click **Connect Broker Gateway**. Once linked, your available margin and order status will synchronize live.\n\n*Note: All credentials are secure and processed server-side.*`,
        sources: ['Brokers Module', 'Security Protocol'],
        handoff: false
      };
    }

    // Check for Capital Shield & Risk queries
    if (q.includes('capital shield') || q.includes('shield') || q.includes('drawdown') || q.includes('daily loss') || q.includes('circuit breaker') || q.includes('overtrade')) {
      return {
        success: true,
        topic: 'Capital Shield & Risk Guardrails',
        answer: `**Capital Shield** is RiskLoop's automated capital protection sentinel and automatic circuit breaker.\n\nKey guardrail parameters:\n• **Max Daily Drawdown:** Default 3.0% (e.g. ₹15,000 on a ₹5,00,000 baseline). If your daily losses reach this threshold, the terminal activates an automated circuit breaker and restricts order sizing to prevent revenge trading.\n• **Max Risk per Trade:** Strictly enforces that no single position risks more than your configured percentage (default 1.0%).\n• **Consecutive Loss Breaker:** Automatically restricts trading after 3 consecutive stop loss executions.\n\nYou can customize these guardrails anytime in **Trading Settings** (\`#trading-settings\`).`,
        sources: ['Risk Shield', 'Trading Settings'],
        handoff: false
      };
    }

    // Check for Portfolio queries
    if (q.includes('portfolio') || q.includes('profit factor') || q.includes('win rate') || q.includes('equity curve') || q.includes('payout ratio') || q.includes('long vs short')) {
      return {
        success: true,
        topic: 'Portfolio Analytics',
        answer: `The **Portfolio** page (\`#portfolio\`) provides institutional analytics on your account:\n\n• **Realized P&L Curve:** Tracks equity growth over 1W, 1M, 3M, 1Y, and ALL timeframes.\n• **Win Rate & Profit Factor:** Analyzes total wins, losses, and gross profit vs gross loss ratio.\n• **Long / Short Ratio:** Evaluates if your edge is stronger in bullish or bearish market conditions.`,
        sources: ['Portfolio Analytics Module'],
        handoff: false
      };
    }

    // Check for Journal queries
    if (q.includes('journal') || q.includes('log') || q.includes('heatmap') || q.includes('psychology') || q.includes('calendar') || q.includes('export')) {
      return {
        success: true,
        topic: 'Trade Journal & Heatmap',
        answer: `The **Trade Journal** (\`#journal\`) tracks your complete performance and psychological discipline:\n\n• **Execution Logging:** Record symbols, entry/exit prices, realized P&L, and setups.\n• **Psychology Tags:** Tag trades as *Followed Plan*, *Disciplined*, *FOMO*, or *Revenge Trade* to identify costly emotional habits.\n• **P&L Calendar Heatmap:** Visual green/red matrix of daily trading outcomes.\n• **Export Data:** Export your journal anytime to CSV or JSON in **General Settings**.`,
        sources: ['Trade Journal', 'Analytics Engine'],
        handoff: false
      };
    }

    // Check for Position Sizing & Calculator queries
    if (q.includes('lot') || q.includes('size') || q.includes('sizing') || q.includes('calculate') || q.includes('calculator') || q.includes('nifty') || q.includes('banknifty') || q.includes('option') || q.includes('equity cash') || q.includes('share count')) {
      return {
        success: true,
        topic: 'Position Calculator & Lot Sizing',
        answer: `The **Position Calculator** (\`#calculator-stock\` / \`#calculator-fo\`) calculates mathematical sizing with zero emotion:\n\n• **Index F&O Sizer:** Automatically rounds down to exact exchange lot multiples for **NIFTY** (25/75), **BANKNIFTY** (15/30), and **FINNIFTY** (25/65).\n• **Formula:** \`Quantity = (Total Capital × Risk %) / (Entry Price - Stop Loss Price)\`\n• **Equity Sizer:** Computes the exact number of shares with strict stop loss protection to never exceed your 1% risk threshold.\n\nNavigate to **Calculator** from the sidebar or Quick Actions to size your next trade.`,
        sources: ['Position Calculator', 'Index F&O Sizer'],
        handoff: false
      };
    }

    // Check for Market queries
    if (q.includes('market') || q.includes('session') || q.includes('timing') || q.includes('rbi') || q.includes('fed') || q.includes('economic') || q.includes('ban list')) {
      return {
        success: true,
        topic: 'Market Intelligence & Radar',
        answer: `The **Market Terminal** (\`#market\`) displays real-time macroeconomic radar and session timers:\n\n• **Indian Session:** NSE/BSE countdown (09:15 to 15:30 IST).\n• **Forex Timeline:** 24-hour visual overlap of London, New York, Tokyo, and Sydney markets.\n• **Economic Radar:** Live schedule of RBI policy meetings, US Fed FOMC rate decisions, and inflation data.\n• **F&O Ban List:** Real-time securities entering or exiting the NSE ban period.`,
        sources: ['Market Terminal', 'Economic Calendar'],
        handoff: false
      };
    }

    // Check for Settings or Security queries
    if (q.includes('setting') || q.includes('theme') || q.includes('dark mode') || q.includes('density') || q.includes('2fa') || q.includes('password') || q.includes('security')) {
      return {
        success: true,
        topic: 'Settings & Security',
        answer: `RiskLoop offers separate dedicated configuration pages:\n\n• **General Settings** (\`#settings\`): Configure Dark/Light/System theme, UI density, notification toggles, timezone, and currency format (₹, $, €, £).\n• **Trading Settings** (\`#trading-settings\`): Configure Capital Shield drawdown, max risk per trade, and mandatory stop loss rules.\n• **Account & Security** (\`#profile\`): Manage Two-Factor Authentication (2FA), active login sessions, and password security.`,
        sources: ['General Settings', 'Account Security'],
        handoff: false
      };
    }

    // Check for Support Ticket queries
    if (q.includes('ticket') || q.includes('contact') || q.includes('support') || q.includes('agent') || q.includes('help')) {
      return {
        success: true,
        topic: 'Support & Ticketing',
        answer: `You can reach our dedicated technical support team directly:\n\n1. Click **Create Support Ticket** below or navigate to \`#contact-support\`.\n2. Choose a category (*Broker Connection*, *Math / Calculation*, *Bug Report*, etc.) and enter your issue description.\n3. Track updates and agent replies in **My Support Tickets** (\`#tickets\`).\n\nSupport tickets are monitored 24/7 by the RiskLoop team.`,
        sources: ['Support Ticketing System'],
        handoff: true
      };
    }

    // Default Fallback: Grounded response stating limitations + direct handoff
    return {
      success: true,
      topic: 'General Assistance',
      answer: `I am the **RiskLoop AI Assistant**, trained strictly on RiskLoop terminal calculations, risk guardrails, position sizers, and multi-broker integrations.\n\nI couldn't find a direct match for your specific query in our verified documentation. If you need help with a custom account issue, broker configuration, or feature question, our support desk is standing by to help.`,
      sources: ['RiskLoop Documentation Base'],
      handoff: true
    };
  }

  /**
   * OpenAI API Handler (when OPENAI_API_KEY is provided in .env)
   * Uses RiskLoop verified knowledge base as strict grounding context.
   */
  async _askOpenAI(query, user) {
    // Generate context string from verified knowledge base
    const knowledgeSummary = Object.entries(RISKLOOP_KNOWLEDGE_BASE)
      .map(([k, v]) => `### [MODULE: ${v.name}]\nDescription: ${v.description}\nKey Verified Features:\n${v.features.map(f => `- ${f}`).join('\n')}`)
      .join('\n\n');

    const systemPrompt = `You are RiskLoop AI, the official intelligent assistant for RiskLoop — an institutional trading terminal focused on risk management, position sizing, trade journaling, and multi-broker integration.

VERIFIED RISKLOOP KNOWLEDGE BASE:
${knowledgeSummary}

CRITICAL OPERATIONAL RULES:
1. Ground your answer strictly in the verified RiskLoop Knowledge Base above.
2. Only mention verified capabilities:
   - Position Sizers (Index F&O: NIFTY 25/75, BANKNIFTY 15/30, FINNIFTY 25/65, SENSEX 10/20; Equity Cash & Swing Sizers).
   - Capital Shield (Max daily loss default 3.0%, auto circuit-breaker, max risk/trade default 1.0%, consecutive loss breaker).
   - Supported Brokers (Angel One SmartAPI, Zerodha Kite, FYERS v3, Dhan DhanHQ, Upstox v2, Shoonya, Kotak Neo, SAMCO, MetaTrader 5).
   - Trade Journal & Daily P&L Calendar Heatmap.
   - Portfolio Analytics (Realized Equity Curve, Win Rate, Profit Factor, Long/Short ratio).
   - Market Terminal (Live Indian session 09:15-15:30 IST, Forex 24h timeline, Economic Radar, F&O Ban list).
   - General Settings (Theme, Density, Notifications, Currency ₹/$/€/£), Trading Settings, My Profile, Account Security (2FA, Sessions).
   - Support Tickets (TICK-XXXXX, My Tickets).
3. Never invent non-existent features, algorithms, or broker integrations.
4. Never ask for, suggest sharing, or output passwords, API keys, TOTP codes, or access tokens.
5. If the verified knowledge base does not cover the question or if the user asks for account-specific debugging/human support, politely state your scope limitations and suggest opening a support ticket at #contact-support.
6. Keep responses concise, professional, and formatted in clean markdown with bold highlights and bullet points.`;

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ],
        temperature: 0.2,
        max_tokens: 450
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`
        },
        timeout: 10000
      }
    );

    const answer = response.data?.choices?.[0]?.message?.content || '';
    const answerLower = answer.toLowerCase();
    
    // Check if the answer indicates handoff to human support is required
    const handoff = answerLower.includes('create support ticket') || 
                    answerLower.includes('contact support') || 
                    answerLower.includes('support ticket at #contact-support') ||
                    answerLower.includes('couldn\'t find') ||
                    answerLower.includes('could not find') ||
                    answerLower.includes('does not cover');

    return {
      success: true,
      topic: 'RiskLoop AI Intelligence',
      answer,
      sources: ['RiskLoop Verified Knowledge Base', 'OpenAI Engine'],
      handoff
    };
  }

  /**
   * Gemini API Handler (when GEMINI_API_KEY is provided in .env)
   */
  async _askGemini(query, user) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.geminiApiKey}`;
    
    const response = await axios.post(
      url,
      {
        contents: [
          {
            parts: [
              {
                text: `You are RiskLoop AI, the official assistant for the RiskLoop trading platform. Answer concisely and accurately based ONLY on RiskLoop features (Position Sizers, Capital Shield 1% risk / 3% drawdown, Multi-Broker Gateway with Angel One, Zerodha, Fyers, Dhan, Trade Journal, Portfolio Analytics, Market Radar, General & Trading Settings, Support Tickets). If unknown, say so and suggest creating a support ticket. Never ask for passwords or API secrets.\n\nUser Question: ${query}`
              }
            ]
          }
        ]
      },
      { timeout: 10000 }
    );

    const answer = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const handoff = answer.toLowerCase().includes('support ticket') || answer.toLowerCase().includes('contact support');

    return {
      success: true,
      topic: 'RiskLoop AI Intelligence',
      answer,
      sources: ['RiskLoop Gemini Engine', 'Verified Knowledge Base'],
      handoff
    };
  }
}

export const aiSupportService = new AiSupportService();
