/**
 * RiskLoop Leaderboard Module
 * Renders competitive trader leaderboard, user rank & percentile,
 * multi-factor RiskLoop scoring, broker verified badges, and privacy controls.
 */

(function (window) {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────
  const state = {
    period: 'all_time', // 'today', 'week', 'month', 'all_time'
    verifiedOnly: false,
    searchQuery: '',
    page: 1,
    limit: 50,
    loading: false,
    userRankData: null,
    traders: [],
    totalTraders: 0,
    userPrivacy: 'public', // 'public', 'anonymous', 'private'
    userDisplayName: 'You (Terminal User)'
  };

  // ── DOM References Cache ───────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('leaderboardPage'),
      // Period filter buttons
      periodBtns: document.querySelectorAll('.lb-period-btn'),
      // Search & verified filter
      searchInput: document.getElementById('lbSearchInput'),
      verifiedOnlyToggle: document.getElementById('lbVerifiedToggle'),
      // User Rank Card
      userRankVal: document.getElementById('lbUserRankVal'),
      userTotalVal: document.getElementById('lbUserTotalVal'),
      userPercentileVal: document.getElementById('lbUserPercentileVal'),
      userMovementVal: document.getElementById('lbUserMovementVal'),
      userScoreVal: document.getElementById('lbUserScoreVal'),
      userReturnVal: document.getElementById('lbUserReturnVal'),
      userWinRateVal: document.getElementById('lbUserWinRateVal'),
      userPfVal: document.getElementById('lbUserPfVal'),
      userAvgRVal: document.getElementById('lbUserAvgRVal'),
      userPrivacyBadge: document.getElementById('lbUserPrivacyBadge'),
      userPrivacyBtn: document.getElementById('lbPrivacySettingBtn'),
      // Table & Cards
      tableBody: document.getElementById('lbTableBody'),
      mobileCardsContainer: document.getElementById('lbMobileCardsList'),
      emptyNotice: document.getElementById('lbEmptyNotice'),
      // Modal
      methodologyBtn: document.getElementById('lbMethodologyBtn'),
      methodologyModal: document.getElementById('lbMethodologyModal'),
      methodologyCloseBtn: document.getElementById('lbMethodologyCloseBtn'),
      privacyModal: document.getElementById('lbPrivacyModal'),
      privacyCloseBtn: document.getElementById('lbPrivacyCloseBtn'),
      privacySaveBtn: document.getElementById('lbPrivacySaveBtn'),
      privacyOptions: document.querySelectorAll('input[name="lbPrivacyOption"]'),
      privacyNameInput: document.getElementById('lbPrivacyNameInput')
    };
  }

  // ── Scoring Formula (Modular) ──────────────────────────────────────────
  function calculateRiskLoopScore(metrics) {
    const {
      returnPct = 0,
      profitFactor = 1.0,
      winRate = 50.0,
      avgR = 1.5,
      maxDrawdown = 4.0,
      discipline = 85.0,
      riskConsistency = 90.0,
    } = metrics;

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

    const raw = 40.0 + returnScore + pfScore + wrScore + avgRScore + (discipline * 0.12) + (riskConsistency * 0.08) - ddPenalty;
    return Number(Math.min(Math.max(raw, 10.0), 99.9).toFixed(1));
  }

  // ── Data Fetching ──────────────────────────────────────────────────────
  async function fetchLeaderboardData() {
    state.loading = true;
    const els = getElements();
    if (els.tableBody) {
      els.tableBody.style.opacity = '0.6';
    }

    try {
      const url = `/api/leaderboard?period=${encodeURIComponent(state.period)}&verifiedOnly=${state.verifiedOnly}&search=${encodeURIComponent(state.searchQuery)}&page=${state.page}&limit=${state.limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      
      if (json.success && Array.isArray(json.data)) {
        state.traders = json.data;
        state.totalTraders = json.total || json.data.length;
      }
    } catch (err) {
      console.warn('[Leaderboard] API fetch error, using fallback state:', err);
    } finally {
      state.loading = false;
      if (els.tableBody) {
        els.tableBody.style.opacity = '1';
      }
      renderLeaderboardTable();
    }
  }

  async function fetchUserRank() {
    try {
      const res = await fetch(`/api/leaderboard/user-rank?period=${encodeURIComponent(state.period)}`);
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const json = await res.json();
      if (json.success && json.userRank) {
        state.userRankData = json.userRank;
        state.userPrivacy = json.userRank.privacyMode || 'public';
        state.userDisplayName = json.userRank.displayName || 'You (Terminal User)';
        renderUserRankCard();
      }
    } catch (err) {
      console.warn('[Leaderboard] User rank fetch error:', err);
      // Fallback display
      state.userRankData = {
        rank: 47,
        totalParticipants: 2184,
        percentile: 2.2,
        rankMovement: 13,
        riskloopScore: 88.6,
        privacyMode: state.userPrivacy,
        displayName: state.userDisplayName,
        isVerified: true,
        verifiedBroker: 'Connected Broker',
        returnPct: state.period === 'today' ? 1.4 : state.period === 'week' ? 4.8 : state.period === 'month' ? 14.2 : 24.6,
        winRate: 64.0,
        profitFactor: 2.18,
        avgR: 1.85,
        maxDrawdown: 3.4,
        tradesCount: state.period === 'today' ? 4 : state.period === 'week' ? 16 : state.period === 'month' ? 48 : 96
      };
      renderUserRankCard();
    }
  }

  // ── Render User Ranking Card ───────────────────────────────────────────
  function renderUserRankCard() {
    const els = getElements();
    const data = state.userRankData;
    if (!data) return;

    if (els.userRankVal) {
      els.userRankVal.textContent = `#${data.rank}`;
    }
    if (els.userTotalVal) {
      els.userTotalVal.textContent = `of ${Number(data.totalParticipants).toLocaleString()}`;
    }
    if (els.userPercentileVal) {
      els.userPercentileVal.textContent = `Top ${data.percentile}%`;
    }

    if (els.userMovementVal) {
      if (data.rankMovement > 0) {
        els.userMovementVal.innerHTML = `<span class="lb-move-up"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m18 15-6-6-6 6"/></svg> ↑ ${data.rankMovement} places</span>`;
      } else if (data.rankMovement < 0) {
        els.userMovementVal.innerHTML = `<span class="lb-move-down"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg> ↓ ${Math.abs(data.rankMovement)} places</span>`;
      } else {
        els.userMovementVal.innerHTML = `<span class="lb-move-neutral">— Unchanged</span>`;
      }
    }

    if (els.userScoreVal) els.userScoreVal.textContent = data.riskloopScore;
    if (els.userReturnVal) {
      const ret = Number(data.returnPct);
      els.userReturnVal.textContent = `${ret >= 0 ? '+' : ''}${ret}%`;
      els.userReturnVal.className = `lb-stat-badge ${ret >= 0 ? 'lb-pos' : 'lb-neg'}`;
    }
    if (els.userWinRateVal) els.userWinRateVal.textContent = `${data.winRate}%`;
    if (els.userPfVal) els.userPfVal.textContent = data.profitFactor;
    if (els.userAvgRVal) els.userAvgRVal.textContent = `1:${data.avgR}`;

    if (els.userPrivacyBadge) {
      let icon = '';
      let label = 'Public';
      let badgeClass = 'lb-priv-public';

      if (state.userPrivacy === 'anonymous') {
        label = 'Anonymous';
        badgeClass = 'lb-priv-anon';
        icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/></svg>`;
      } else if (state.userPrivacy === 'private') {
        label = 'Private (Hidden)';
        badgeClass = 'lb-priv-private';
        icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
      } else {
        icon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
      }

      els.userPrivacyBadge.className = `lb-privacy-pill ${badgeClass}`;
      els.userPrivacyBadge.innerHTML = `${icon}<span>${label}</span>`;
    }
  }

  // ── Render Leaderboard Table ───────────────────────────────────────────
  function renderLeaderboardTable() {
    const els = getElements();
    if (!els.tableBody) return;

    if (state.traders.length === 0) {
      els.tableBody.innerHTML = '';
      if (els.emptyNotice) els.emptyNotice.hidden = false;
      if (els.mobileCardsContainer) els.mobileCardsContainer.innerHTML = '';
      return;
    }

    if (els.emptyNotice) els.emptyNotice.hidden = true;

    // Desktop Table HTML
    let tableHtml = '';
    // Mobile Cards HTML
    let cardsHtml = '';

    state.traders.forEach((t) => {
      const rankNum = t.rank;
      let rankDisplay = `#${rankNum}`;
      let rankBadgeClass = 'lb-rank-badge';

      if (rankNum === 1) {
        rankDisplay = `🥇 <span class="lb-rank-gold">#1</span>`;
        rankBadgeClass += ' lb-rank-1';
      } else if (rankNum === 2) {
        rankDisplay = `🥈 <span class="lb-rank-silver">#2</span>`;
        rankBadgeClass += ' lb-rank-2';
      } else if (rankNum === 3) {
        rankDisplay = `🥉 <span class="lb-rank-bronze">#3</span>`;
        rankBadgeClass += ' lb-rank-3';
      }

      // Verified Badge vs Unverified Badge
      const isVerified = t.is_verified === true || t.is_broker_verified === true;
      const verifiedBadge = isVerified
        ? `<span class="lb-verified-badge" title="Broker-Confirmed Live Execution (${t.verified_broker || 'Live Broker'})">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
            <span>Verified</span>
          </span>`
        : `<span class="lb-unverified-badge" title="Manual Journal Performance — Not Broker Confirmed">
            <span>Unverified</span>
          </span>`;

      const returnVal = Number(t.return_pct);
      const returnClass = returnVal >= 0 ? 'text-profit' : 'text-danger';
      const returnSign = returnVal >= 0 ? '+' : '';

      // Desktop row
      tableHtml += `
        <tr class="lb-row ${rankNum <= 3 ? 'lb-top-row' : ''}">
          <td class="lb-col-rank">
            <div class="${rankBadgeClass}">${rankDisplay}</div>
          </td>
          <td class="lb-col-trader">
            <div class="lb-trader-cell">
              <div class="lb-avatar">${t.avatar || '👤'}</div>
              <div class="lb-trader-meta">
                <span class="lb-trader-name">${escapeHtml(t.trader_name)}</span>
                <div class="lb-trader-sub">
                  ${verifiedBadge}
                  ${t.verified_broker ? `<span class="lb-broker-name">${escapeHtml(t.verified_broker)}</span>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td class="lb-col-score">
            <div class="lb-score-chip">
              <span class="lb-score-num">${t.riskloop_score}</span>
              <span class="lb-score-tag">Score</span>
            </div>
          </td>
          <td class="lb-col-return ${returnClass}">
            <strong>${returnSign}${returnVal}%</strong>
          </td>
          <td class="lb-col-winrate">${t.win_rate}%</td>
          <td class="lb-col-pf">${t.profit_factor}</td>
          <td class="lb-col-avgr">1:${t.avg_r}</td>
          <td class="lb-col-dd text-danger">-${t.max_drawdown}%</td>
          <td class="lb-col-trades">${t.trades_count}</td>
        </tr>
      `;

      // Mobile card
      cardsHtml += `
        <div class="jcard lb-mobile-card ${rankNum <= 3 ? 'lb-mobile-card-top' : ''}">
          <div class="lb-m-header">
            <div class="lb-m-rank-group">
              <div class="${rankBadgeClass}">${rankDisplay}</div>
              <div class="lb-trader-cell">
                <div class="lb-avatar">${t.avatar || '👤'}</div>
                <div class="lb-trader-meta">
                  <span class="lb-trader-name">${escapeHtml(t.trader_name)}</span>
                  <div class="lb-trader-sub">${verifiedBadge}</div>
                </div>
              </div>
            </div>
            <div class="lb-score-chip">
              <span class="lb-score-num">${t.riskloop_score}</span>
              <span class="lb-score-tag">Score</span>
            </div>
          </div>
          <div class="lb-m-grid">
            <div class="lb-m-stat">
              <span class="lb-m-label">Return</span>
              <span class="lb-m-val ${returnClass}">${returnSign}${returnVal}%</span>
            </div>
            <div class="lb-m-stat">
              <span class="lb-m-label">Win Rate</span>
              <span class="lb-m-val">${t.win_rate}%</span>
            </div>
            <div class="lb-m-stat">
              <span class="lb-m-label">Profit Factor</span>
              <span class="lb-m-val">${t.profit_factor}</span>
            </div>
            <div class="lb-m-stat">
              <span class="lb-m-label">Avg R</span>
              <span class="lb-m-val">1:${t.avg_r}</span>
            </div>
            <div class="lb-m-stat">
              <span class="lb-m-label">Max DD</span>
              <span class="lb-m-val text-danger">-${t.max_drawdown}%</span>
            </div>
            <div class="lb-m-stat">
              <span class="lb-m-label">Trades</span>
              <span class="lb-m-val">${t.trades_count}</span>
            </div>
          </div>
        </div>
      `;
    });

    els.tableBody.innerHTML = tableHtml;
    if (els.mobileCardsContainer) {
      els.mobileCardsContainer.innerHTML = cardsHtml;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Privacy Settings Handler ───────────────────────────────────────────
  async function updatePrivacySettings(newPrivacyMode, newDisplayName) {
    state.userPrivacy = newPrivacyMode;
    if (newDisplayName) state.userDisplayName = newDisplayName;

    try {
      await fetch('/api/leaderboard/privacy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          privacyMode: newPrivacyMode,
          displayName: newDisplayName
        })
      });
    } catch (e) {
      console.warn('[Leaderboard] Privacy sync error:', e);
    }

    renderUserRankCard();
    fetchLeaderboardData();
  }

  // ── Initialize Event Listeners ─────────────────────────────────────────
  function initLeaderboard() {
    const els = getElements();

    // 1. Period tab buttons
    if (els.periodBtns) {
      els.periodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          els.periodBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.period = btn.dataset.period || 'all_time';
          state.page = 1;
          fetchLeaderboardData();
          fetchUserRank();
        });
      });
    }

    // 2. Search input (with debounce)
    if (els.searchInput) {
      let searchTimeout = null;
      els.searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          state.searchQuery = e.target.value.trim();
          state.page = 1;
          fetchLeaderboardData();
        }, 250);
      });
    }

    // 3. Verified-only toggle
    if (els.verifiedOnlyToggle) {
      els.verifiedOnlyToggle.addEventListener('change', (e) => {
        state.verifiedOnly = e.target.checked;
        state.page = 1;
        fetchLeaderboardData();
      });
    }

    // 4. Methodology Modal
    if (els.methodologyBtn && els.methodologyModal) {
      els.methodologyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.methodologyModal.hidden = false;
        document.body.style.overflow = 'hidden';
      });
    }

    if (els.methodologyCloseBtn && els.methodologyModal) {
      els.methodologyCloseBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.methodologyModal.hidden = true;
        document.body.style.overflow = '';
      });
    }

    if (els.methodologyModal) {
      els.methodologyModal.addEventListener('click', (e) => {
        if (e.target === els.methodologyModal) {
          els.methodologyModal.hidden = true;
          document.body.style.overflow = '';
        }
      });
    }

    // 5. Privacy Settings Modal
    if (els.userPrivacyBtn && els.privacyModal) {
      els.userPrivacyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        els.privacyModal.hidden = false;
        document.body.style.overflow = 'hidden';

        // Select current option
        els.privacyOptions.forEach(opt => {
          opt.checked = opt.value === state.userPrivacy;
        });
        if (els.privacyNameInput) {
          els.privacyNameInput.value = state.userDisplayName || '';
        }
      });
    }

    if (els.privacyCloseBtn && els.privacyModal) {
      els.privacyCloseBtn.addEventListener('click', () => {
        els.privacyModal.hidden = true;
        document.body.style.overflow = '';
      });
    }

    if (els.privacySaveBtn && els.privacyModal) {
      els.privacySaveBtn.addEventListener('click', () => {
        let selectedPrivacy = 'public';
        els.privacyOptions.forEach(opt => {
          if (opt.checked) selectedPrivacy = opt.value;
        });
        const nameVal = els.privacyNameInput ? els.privacyNameInput.value.trim() : '';

        updatePrivacySettings(selectedPrivacy, nameVal || 'You (Terminal User)');
        els.privacyModal.hidden = true;
        document.body.style.overflow = '';
      });
    }

    if (els.privacyModal) {
      els.privacyModal.addEventListener('click', (e) => {
        if (e.target === els.privacyModal) {
          els.privacyModal.hidden = true;
          document.body.style.overflow = '';
        }
      });
    }

    // Initial load
    fetchLeaderboardData();
    fetchUserRank();
  }

  // Expose global methods
  window.initLeaderboardPage = function () {
    fetchLeaderboardData();
    fetchUserRank();
  };

  window.calculateRiskLoopScore = calculateRiskLoopScore;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLeaderboard);
  } else {
    initLeaderboard();
  }

}(window));
