/**
 * RiskLoop Leaderboard Routes
 * API endpoints for trader leaderboard, user rank percentile, and privacy management
 */

import express from 'express';

const router = express.Router();

// ── Scoring Algorithm Helper ──────────────────────────────────────────
export function calculateRiskLoopScore({
  returnPct = 0,
  profitFactor = 1.0,
  winRate = 50.0,
  avgR = 1.5,
  maxDrawdown = 4.0,
  discipline = 85.0,
  riskConsistency = 90.0,
}) {
  const returnScore = Math.min(Math.max(returnPct * 0.5, -15.0), 25.0);
  const pfScore = Math.min(Math.max((profitFactor - 1.0) * 10.0, -10.0), 20.0);
  
  let wrScore = 0;
  if (winRate >= 40.0 && winRate <= 75.0) {
    wrScore = 15.0 * (winRate / 75.0);
  } else if (winRate > 75.0) {
    wrScore = 15.0 - ((winRate - 75.0) * 0.2);
  } else {
    wrScore = Math.max(0, winRate * 0.2);
  }

  const avgRScore = Math.min(Math.max(avgR * 6.0, 0.0), 15.0);

  let ddPenalty = 0;
  if (maxDrawdown > 15.0) {
    ddPenalty = (maxDrawdown - 15.0) * 2.0 + 15.0;
  } else if (maxDrawdown > 5.0) {
    ddPenalty = (maxDrawdown - 5.0) * 1.5;
  }

  const rawScore = 40.0 + returnScore + pfScore + wrScore + avgRScore + (discipline * 0.12) + (riskConsistency * 0.08) - ddPenalty;
  return Number(Math.min(Math.max(rawScore, 10.0), 99.9).toFixed(1));
}

// ── Competition Dataset ───────────────────────────────────────────────
// Curated trader profiles with realistic metrics and verified broker confirmation
const SEED_TRADERS = [
  {
    id: 'tr-001',
    trader_name: 'Aarav Sharma',
    avatar: '👨‍💼',
    privacy_mode: 'public',
    is_verified: true,
    verified_broker: 'Zerodha Kite',
    return_pct: 42.8,
    win_rate: 68.4,
    profit_factor: 2.85,
    avg_r: 2.3,
    max_drawdown: 3.8,
    trades_count: 142,
    rank_movement: 3,
    discipline: 96,
    risk_consistency: 94
  },
  {
    id: 'tr-002',
    trader_name: 'Vikram Mehta',
    avatar: '📈',
    privacy_mode: 'public',
    is_verified: true,
    verified_broker: 'Angel One',
    return_pct: 38.6,
    win_rate: 65.0,
    profit_factor: 2.62,
    avg_r: 2.1,
    max_drawdown: 4.2,
    trades_count: 98,
    rank_movement: 1,
    discipline: 94,
    risk_consistency: 92
  },
  {
    id: 'tr-003',
    trader_name: 'Trader #4912',
    avatar: '🛡️',
    privacy_mode: 'anonymous',
    is_verified: true,
    verified_broker: 'Dhan HQ',
    return_pct: 35.2,
    win_rate: 62.8,
    profit_factor: 2.44,
    avg_r: 1.95,
    max_drawdown: 3.1,
    trades_count: 176,
    rank_movement: 5,
    discipline: 95,
    risk_consistency: 96
  },
  {
    id: 'tr-004',
    trader_name: 'Priya Nambiar',
    avatar: '👩‍💻',
    privacy_mode: 'public',
    is_verified: true,
    verified_broker: 'Fyers',
    return_pct: 31.4,
    win_rate: 61.2,
    profit_factor: 2.30,
    avg_r: 1.9,
    max_drawdown: 4.5,
    trades_count: 110,
    rank_movement: -1,
    discipline: 91,
    risk_consistency: 89
  },
  {
    id: 'tr-005',
    trader_name: 'Trader #8831',
    avatar: '⚡',
    privacy_mode: 'anonymous',
    is_verified: false,
    verified_broker: null,
    return_pct: 29.8,
    win_rate: 59.5,
    profit_factor: 2.15,
    avg_r: 1.85,
    max_drawdown: 5.2,
    trades_count: 84,
    rank_movement: 2,
    discipline: 88,
    risk_consistency: 86
  },
  {
    id: 'tr-006',
    trader_name: 'Rohan Deshmukh',
    avatar: '🎯',
    privacy_mode: 'public',
    is_verified: true,
    verified_broker: 'MetaTrader 5',
    return_pct: 27.5,
    win_rate: 58.0,
    profit_factor: 2.08,
    avg_r: 1.8,
    max_drawdown: 4.8,
    trades_count: 125,
    rank_movement: 0,
    discipline: 89,
    risk_consistency: 90
  },
  {
    id: 'tr-007',
    trader_name: 'Trader #2045',
    avatar: '📊',
    privacy_mode: 'anonymous',
    is_verified: true,
    verified_broker: 'Upstox',
    return_pct: 25.1,
    win_rate: 56.4,
    profit_factor: 1.95,
    avg_r: 1.75,
    max_drawdown: 5.0,
    trades_count: 92,
    rank_movement: 4,
    discipline: 87,
    risk_consistency: 88
  },
  {
    id: 'tr-008',
    trader_name: 'Ananya Roy',
    avatar: '💼',
    privacy_mode: 'public',
    is_verified: false,
    verified_broker: null,
    return_pct: 23.8,
    win_rate: 55.0,
    profit_factor: 1.88,
    avg_r: 1.7,
    max_drawdown: 5.8,
    trades_count: 64,
    rank_movement: -2,
    discipline: 85,
    risk_consistency: 84
  },
  {
    id: 'tr-009',
    trader_name: 'Trader #6129',
    avatar: '🛡️',
    privacy_mode: 'anonymous',
    is_verified: true,
    verified_broker: 'Kotak Neo',
    return_pct: 21.4,
    win_rate: 53.8,
    profit_factor: 1.82,
    avg_r: 1.65,
    max_drawdown: 4.6,
    trades_count: 104,
    rank_movement: 1,
    discipline: 88,
    risk_consistency: 91
  },
  {
    id: 'tr-010',
    trader_name: 'Devendra Patel',
    avatar: '🚀',
    privacy_mode: 'public',
    is_verified: true,
    verified_broker: 'AliceBlue',
    return_pct: 19.8,
    win_rate: 52.0,
    profit_factor: 1.75,
    avg_r: 1.6,
    max_drawdown: 5.4,
    trades_count: 78,
    rank_movement: -3,
    discipline: 86,
    risk_consistency: 87
  }
];

// In-memory user state cache for demo
let userLeaderboardSettings = {
  privacy_mode: 'public',
  display_name: 'You (Terminal User)',
  is_verified: true,
  verified_broker: 'Connected Broker',
};

// Calculate scores for seed traders
function getRankedTraders(period = 'all_time', verifiedOnly = false, searchQuery = '') {
  let periodMultiplier = 1.0;
  if (period === 'today') periodMultiplier = 0.08;
  else if (period === 'week') periodMultiplier = 0.28;
  else if (period === 'month') periodMultiplier = 0.65;

  let list = SEED_TRADERS.map((tr, idx) => {
    const returnVal = Number((tr.return_pct * periodMultiplier).toFixed(2));
    const tradesVal = Math.max(2, Math.round(tr.trades_count * periodMultiplier));
    const score = calculateRiskLoopScore({
      returnPct: returnVal,
      profitFactor: tr.profit_factor,
      winRate: tr.win_rate,
      avgR: tr.avg_r,
      maxDrawdown: tr.max_drawdown,
      discipline: tr.discipline,
      riskConsistency: tr.risk_consistency,
    });

    return {
      ...tr,
      return_pct: returnVal,
      trades_count: tradesVal,
      riskloop_score: score,
    };
  });

  if (verifiedOnly) {
    list = list.filter(t => t.is_verified);
  }

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    list = list.filter(t => t.trader_name.toLowerCase().includes(q) || (t.verified_broker && t.verified_broker.toLowerCase().includes(q)));
  }

  // Sort by Score desc, Return % desc
  list.sort((a, b) => b.riskloop_score - a.riskloop_score || b.return_pct - a.return_pct);

  // Assign ranks
  return list.map((t, idx) => ({ ...t, rank: idx + 1 }));
}

// ── Endpoints ─────────────────────────────────────────────────────────

// GET /api/leaderboard
router.get('/', (req, res) => {
  const { period = 'all_time', verifiedOnly = 'false', search = '', limit = 50, page = 1 } = req.query;
  const isVerifiedOnly = verifiedOnly === 'true' || verifiedOnly === true;
  
  const allRanked = getRankedTraders(period, isVerifiedOnly, search);
  const total = allRanked.length;
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 50;
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = allRanked.slice(startIndex, startIndex + limitNum);

  res.json({
    success: true,
    period,
    total,
    page: pageNum,
    limit: limitNum,
    data: paginated,
    timestamp: new Date().toISOString()
  });
});

// GET /api/leaderboard/user-rank
router.get('/user-rank', (req, res) => {
  const { period = 'all_time', userId = 'current_user' } = req.query;
  
  const totalParticipants = 2184;
  const userRank = 47;
  const percentile = Number(((userRank / totalParticipants) * 100).toFixed(1)); // 2.2%
  const rankMovement = 13; // climbed 13 places

  const userScore = calculateRiskLoopScore({
    returnPct: period === 'today' ? 1.4 : period === 'week' ? 4.8 : period === 'month' ? 14.2 : 24.6,
    profitFactor: 2.18,
    winRate: 64.0,
    avgR: 1.85,
    maxDrawdown: 3.4,
    discipline: 94,
    riskConsistency: 92,
  });

  res.json({
    success: true,
    period,
    userId,
    userRank: {
      rank: userRank,
      totalParticipants,
      percentile,
      rankMovement,
      riskloopScore: userScore,
      privacyMode: userLeaderboardSettings.privacy_mode,
      displayName: userLeaderboardSettings.display_name,
      isVerified: userLeaderboardSettings.is_verified,
      verifiedBroker: userLeaderboardSettings.verified_broker,
      returnPct: period === 'today' ? 1.4 : period === 'week' ? 4.8 : period === 'month' ? 14.2 : 24.6,
      winRate: 64.0,
      profitFactor: 2.18,
      avgR: 1.85,
      maxDrawdown: 3.4,
      tradesCount: period === 'today' ? 4 : period === 'week' ? 16 : period === 'month' ? 48 : 96
    }
  });
});

// POST /api/leaderboard/privacy
router.post('/privacy', (req, res) => {
  const { privacyMode, displayName } = req.body;
  if (privacyMode && ['public', 'anonymous', 'private'].includes(privacyMode)) {
    userLeaderboardSettings.privacy_mode = privacyMode;
  }
  if (displayName) {
    userLeaderboardSettings.display_name = displayName.trim();
  }

  res.json({
    success: true,
    message: 'Privacy settings updated successfully',
    settings: userLeaderboardSettings
  });
});

// POST /api/leaderboard/calculate-score
router.post('/calculate-score', (req, res) => {
  const score = calculateRiskLoopScore(req.body || {});
  res.json({
    success: true,
    score
  });
});

export default router;
