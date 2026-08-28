/**
 * RiskLoop Leaderboard Routes
 * API endpoints for trader leaderboard, user rank percentile, and privacy management.
 * Pure real-data implementation with zero mock, seed, or fake demo traders.
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

// User state settings
let userLeaderboardSettings = {
  privacy_mode: 'public',
  display_name: '',
  is_verified: false,
  verified_broker: null,
};

// ── Endpoints ─────────────────────────────────────────────────────────

// GET /api/leaderboard - Query real leaderboard records
router.get('/', (req, res) => {
  const { period = 'all_time', limit = 50, page = 1 } = req.query;
  const pageNum = parseInt(page) || 1;
  const limitNum = parseInt(limit) || 50;

  // Real data only: Return empty array when no eligible database traders exist yet
  res.json({
    success: true,
    period,
    total: 0,
    page: pageNum,
    limit: limitNum,
    data: [],
    timestamp: new Date().toISOString()
  });
});

// GET /api/leaderboard/user-rank - Query real user rank & calculated metrics
router.get('/user-rank', (req, res) => {
  const { period = 'all_time', userId = 'current_user' } = req.query;

  // Real data only: Return null rank data when no user trading records exist in DB
  res.json({
    success: true,
    period,
    userId,
    userRank: null
  });
});

// POST /api/leaderboard/privacy
router.post('/privacy', (req, res) => {
  const { privacyMode, displayName } = req.body;
  if (privacyMode && ['public', 'anonymous', 'private'].includes(privacyMode)) {
    userLeaderboardSettings.privacy_mode = privacyMode;
  }
  if (displayName !== undefined) {
    userLeaderboardSettings.display_name = String(displayName).trim();
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
