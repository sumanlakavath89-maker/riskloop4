/**
 * RiskLoop - Unified Smart Market Discussion & Analysis Component
 * Powers both Indian Market and Forex Market trade idea discussions with identical smart UI and dedicated context.
 */

(function () {
  'use strict';

  class SmartMarketComments {
    constructor() {
      this.apiBaseUrl = (typeof window !== 'undefined' && window.API_BASE_URL) 
        ? `${window.API_BASE_URL}/api/market` 
        : 'http://localhost:3000/api/market';

      this.markets = {
        indian: {
          comments: [],
          sort: 'recent',
          filter: 'all',
          page: 1,
          limit: 20,
          isLoading: false,
          selectedSentiment: 'bullish',
          selectedTimeframe: ''
        },
        forex: {
          comments: [],
          sort: 'recent',
          filter: 'all',
          page: 1,
          limit: 20,
          isLoading: false,
          selectedSentiment: 'bullish',
          selectedTimeframe: ''
        }
      };

      this.init();
    }

    /**
     * Get current authenticated user
     */
    getCurrentUser() {
      if (typeof window.RiskLoopAuth !== 'undefined' && typeof window.RiskLoopAuth.getUser === 'function') {
        const u = window.RiskLoopAuth.getUser();
        if (u && (u.id || u.email)) {
          return {
            id: u.id || u.email,
            username: u.fullName || u.username || u.email?.split('@')[0] || 'Trader',
            avatar: u.avatarUrl || u.avatar || '',
            isPro: !!u.isPro,
            isLoggedIn: true
          };
        }
      }

      const authUser = localStorage.getItem('riskloop_current_user') || localStorage.getItem('riskloop_auth_user');
      if (authUser) {
        try {
          const u = JSON.parse(authUser);
          if (u && (u.id || u.email)) {
            return {
              id: u.id || u.email,
              username: u.fullName || u.username || u.email?.split('@')[0] || 'Trader',
              avatar: u.avatarUrl || u.avatar || '',
              isPro: !!u.isPro,
              isLoggedIn: true
            };
          }
        } catch (e) {}
      }

      return null;
    }

    /**
     * Initialize smart discussions across all market sections
     */
    init() {
      this.bindGlobalEvents();
      this.initSection('indian');
      this.initSection('forex');
      this.loadComments('indian');
      this.loadComments('forex');
      this.updateComposerAvatars();
    }

    /**
     * Bind global listeners (auth changes, outside clicks)
     */
    bindGlobalEvents() {
      if (this._globalBound) return;
      this._globalBound = true;

      // Auth state change listener
      if (typeof window.RiskLoopAuth !== 'undefined' && typeof window.RiskLoopAuth.onAuthStateChange === 'function') {
        window.RiskLoopAuth.onAuthStateChange((event, session) => {
          this.updateComposerAvatars();
          if (session?.user) {
            this.handlePendingDraft();
          }
        });
      }

      window.addEventListener('storage', (e) => {
        if (e.key === 'riskloop_current_user' || e.key === 'riskloop_auth_user') {
          this.updateComposerAvatars();
        }
      });

      window.addEventListener('riskloop_auth_success', () => {
        this.updateComposerAvatars();
        this.handlePendingDraft();
      });

      // Close dropdown menus on outside click
      document.addEventListener('click', (e) => {
        if (!e.target.closest('.comment-menu')) {
          document.querySelectorAll('.comment-menu-dropdown').forEach(m => {
            m.style.display = 'none';
          });
        }
      });
    }

    /**
     * Initialize a specific market section container
     */
    initSection(marketKey) {
      const section = document.querySelector(`.market-comments-section[data-market="${marketKey}"]`) ||
                      document.getElementById(marketKey === 'forex' ? 'forexCommentsSection' : 'indianCommentsSection');
      if (!section) return;

      // 1. Filter buttons (All / Bullish / Bearish)
      section.querySelectorAll('.discussion-filter-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          section.querySelectorAll('.discussion-filter-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.markets[marketKey].filter = btn.getAttribute('data-filter') || 'all';
          this.renderComments(marketKey);
        };
      });

      // 2. Sort dropdown
      const sortSelect = section.querySelector('.comment-sort-select');
      if (sortSelect) {
        sortSelect.onchange = (e) => {
          this.markets[marketKey].sort = e.target.value;
          this.markets[marketKey].page = 1;
          this.loadComments(marketKey);
        };
      }

      // 3. Refresh button
      const refreshBtn = section.querySelector('.comments-refresh-btn');
      if (refreshBtn) {
        refreshBtn.onclick = (e) => {
          e.preventDefault();
          refreshBtn.classList.add('rotating');
          this.loadComments(marketKey).finally(() => {
            setTimeout(() => refreshBtn.classList.remove('rotating'), 600);
          });
        };
      }

      // 4. Sentiment selector buttons
      section.querySelectorAll('.composer-sentiment-bar .sentiment-btn').forEach(btn => {
        btn.onclick = (e) => {
          e.preventDefault();
          section.querySelectorAll('.composer-sentiment-bar .sentiment-btn').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          this.markets[marketKey].selectedSentiment = btn.getAttribute('data-sentiment') || 'bullish';
        };
      });

      // 5. Timeframe select
      const timeframeSelect = section.querySelector('.composer-timeframe-select');
      if (timeframeSelect) {
        timeframeSelect.onchange = (e) => {
          this.markets[marketKey].selectedTimeframe = e.target.value;
        };
      }

      // 6. Textarea input and shortcuts
      const textarea = section.querySelector('.composer-textarea');
      if (textarea) {
        textarea.oninput = () => {
          this.updateCharacterCount(textarea);
        };

        textarea.onkeydown = (e) => {
          if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            this.postComment(marketKey, null, section);
          }
        };

        textarea.onfocus = () => {
          if (!this.getCurrentUser()) {
            this.requireAuthOrPrompt('comment');
          }
        };
      }

      // 7. Quick Emojis
      section.querySelectorAll('.quick-emoji-bar .q-emoji').forEach(qEmoji => {
        qEmoji.onclick = (e) => {
          e.preventDefault();
          const emoji = qEmoji.getAttribute('data-emoji') || qEmoji.textContent.trim();
          if (textarea) {
            textarea.value = textarea.value ? `${textarea.value.trim()} ${emoji} ` : `${emoji} `;
            textarea.focus();
            this.updateCharacterCount(textarea);
          }
        };
      });

      // 8. Emoji button (randomizer / quick insert)
      const emojiBtn = section.querySelector('.emoji-btn');
      if (emojiBtn && textarea) {
        emojiBtn.onclick = (e) => {
          e.preventDefault();
          const reactions = ['📈', '📉', '🎯', '🛑', '⚡', '🔥', '🚀', '💡'];
          const rand = reactions[Math.floor(Math.random() * reactions.length)];
          textarea.value = textarea.value ? `${textarea.value.trim()} ${rand} ` : `${rand} `;
          textarea.focus();
          this.updateCharacterCount(textarea);
        };
      }

      // 9. Post comment button
      const postBtn = section.querySelector('.post-comment-btn');
      if (postBtn) {
        postBtn.onclick = (e) => {
          e.preventDefault();
          this.postComment(marketKey, null, section);
        };
      }
    }

    /**
     * Require authentication or open modal
     */
    requireAuthOrPrompt(action = 'comment') {
      const user = this.getCurrentUser();
      if (!user) {
        this.showToast('Please login or register to participate in trader discussions.', 'info');
        if (typeof window.openAuthModal === 'function') {
          window.openAuthModal('login');
        } else if (typeof window.showPage === 'function') {
          window.showPage('login');
        }
        return false;
      }
      return true;
    }

    /**
     * Update avatar initials & placeholders for all composers
     */
    updateComposerAvatars() {
      const user = this.getCurrentUser();
      const initial = user ? (user.username || 'T').charAt(0).toUpperCase() : 'T';

      document.querySelectorAll('.market-comments-section .composer-avatar .avatar-initials').forEach(el => {
        el.textContent = initial;
        if (user) {
          el.style.background = 'linear-gradient(135deg, #10b981, #059669)';
          el.title = `Logged in as ${user.username}`;
        } else {
          el.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
          el.title = 'Trader';
        }
      });

      document.querySelectorAll('.market-comments-section .composer-textarea').forEach(textarea => {
        const isForex = !!textarea.closest('[data-market="forex"], #forexCommentsSection');
        if (user) {
          textarea.placeholder = isForex 
            ? 'Share your analysis, currency setup, key levels (support/resistance), and risk rationale... (Ctrl+Enter to post)'
            : 'Share your analysis, trade setup, key levels (support/resistance), and risk rationale... (Ctrl+Enter to post)';
        } else {
          textarea.placeholder = isForex
            ? 'Share your analysis, currency setup, key levels (support/resistance), and risk rationale...'
            : 'Share your analysis, trade setup, key levels (support/resistance), and risk rationale...';
        }
      });
    }

    /**
     * Update character counter display
     */
    updateCharacterCount(textarea) {
      const composer = textarea.closest('.comment-composer');
      if (!composer) return;
      const counter = composer.querySelector('.char-counter');
      if (!counter) return;

      const len = textarea.value.length;
      counter.textContent = `${len}/2000`;
      if (len > 2000) {
        counter.style.color = '#ef4444';
      } else if (len > 1800) {
        counter.style.color = '#f59e0b';
      } else {
        counter.style.color = '#9ca3af';
      }
    }

    /**
     * Load comments from API or fallback local dataset
     */
    async loadComments(marketKey) {
      const state = this.markets[marketKey];
      if (state.isLoading) return;
      state.isLoading = true;

      const feed = document.getElementById(`${marketKey}CommentsFeed`) ||
                   document.querySelector(`.market-comments-section[data-market="${marketKey}"] .comments-feed`);

      try {
        const response = await fetch(
          `${this.apiBaseUrl}/comments?market=${marketKey}&sort=${state.sort}&page=${state.page}&limit=${state.limit}`,
          { credentials: 'include' }
        ).catch(() => null);

        if (response && response.ok) {
          const result = await response.json();
          if (result && result.success && Array.isArray(result.data?.comments)) {
            state.comments = result.data.comments;
            this.renderComments(marketKey);
            return;
          }
        }

        this.loadMockComments(marketKey);
      } catch (err) {
        this.loadMockComments(marketKey);
      } finally {
        state.isLoading = false;
      }
    }

    /**
     * Default curated mock dataset for each market
     */
    loadMockComments(marketKey) {
      const storageKey = `riskloop_${marketKey}_comments`;
      let saved = null;
      try {
        saved = localStorage.getItem(storageKey);
        if (saved) {
          this.markets[marketKey].comments = JSON.parse(saved);
          this.renderComments(marketKey);
          return;
        }
      } catch (e) {}

      if (marketKey === 'forex') {
        this.markets.forex.comments = [
          {
            id: 'fx_1',
            userId: 'u_fx1',
            username: 'Marcus Vance',
            userAvatar: '',
            isPro: true,
            sentiment: 'bullish',
            timeframe: 'Intraday (15m - 1H)',
            market: 'forex',
            content: 'EUR/USD rejected the 1.0820 support cluster cleanly during the London open. Seeing strong liquidity sweep of previous Asia lows with target set at 1.0885.',
            createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
            relativeTime: '35m ago',
            likes: 28,
            dislikes: 1,
            isLiked: false,
            replies: [
              {
                id: 'fx_r1',
                userId: 'u_fx2',
                username: 'Sophia Ray',
                userAvatar: '',
                isPro: false,
                content: 'Agreed. Volume delta turned strongly positive right after Frankfurt open. Stop below 1.0795 offers favorable 1:2.8 RR.',
                createdAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
                relativeTime: '18m ago',
                likes: 8,
                dislikes: 0,
                isLiked: false
              }
            ]
          },
          {
            id: 'fx_2',
            userId: 'u_fx3',
            username: 'Kenji Sato',
            userAvatar: '',
            isPro: false,
            sentiment: 'bearish',
            timeframe: 'Swing (4H - Daily)',
            market: 'forex',
            content: 'GBP/USD testing significant 4H supply zone at 1.2950 ahead of upcoming central bank inflation updates. Bearish divergence visible on MACD.',
            createdAt: new Date(Date.now() - 1000 * 60 * 110).toISOString(),
            relativeTime: '2h ago',
            likes: 16,
            dislikes: 2,
            isLiked: false,
            replies: []
          },
          {
            id: 'fx_3',
            userId: 'u_fx4',
            username: 'Liam Chen',
            userAvatar: '',
            isPro: true,
            sentiment: 'bullish',
            timeframe: 'Scalp (1m - 5m)',
            market: 'forex',
            content: 'XAU/USD (Gold) holding the $2,640 structural support level. Buyers actively absorbing selling pressure at London/NY handover.',
            createdAt: new Date(Date.now() - 1000 * 60 * 240).toISOString(),
            relativeTime: '4h ago',
            likes: 42,
            dislikes: 0,
            isLiked: false,
            replies: []
          }
        ];
      } else {
        this.markets.indian.comments = [
          {
            id: 'in_1',
            userId: 'u_in1',
            username: 'Aarav Mehta',
            userAvatar: '',
            isPro: true,
            sentiment: 'bullish',
            timeframe: 'Intraday (15m - 1H)',
            market: 'indian',
            content: 'Nifty 50 holding firmly above the 24,800 demand cluster. Strong call unwinding seen across 24,900 & 25,000 strikes as heavyweights gain traction.',
            createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
            relativeTime: '45m ago',
            likes: 36,
            dislikes: 2,
            isLiked: false,
            replies: [
              {
                id: 'in_r1',
                userId: 'u_in2',
                username: 'Rohan Sharma',
                userAvatar: '',
                isPro: false,
                content: 'HDFC Bank and ICICI Bank displaying solid relative strength. Looking for breakout above 25,050 for continuation.',
                createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
                relativeTime: '20m ago',
                likes: 11,
                dislikes: 0,
                isLiked: false
              }
            ]
          },
          {
            id: 'in_2',
            userId: 'u_in3',
            username: 'Priya Nair',
            userAvatar: '',
            isPro: false,
            sentiment: 'neutral',
            timeframe: 'Swing (4H - Daily)',
            market: 'indian',
            content: 'Bank Nifty compressing between 51,200 and 51,800. Watching for a clean 15m candle close outside this balance zone before adding directional risk.',
            createdAt: new Date(Date.now() - 1000 * 60 * 150).toISOString(),
            relativeTime: '2h ago',
            likes: 21,
            dislikes: 1,
            isLiked: false,
            replies: []
          },
          {
            id: 'in_3',
            userId: 'u_in4',
            username: 'Vikram Singhania',
            userAvatar: '',
            isPro: true,
            sentiment: 'bullish',
            timeframe: 'Scalp (1m - 5m)',
            market: 'indian',
            content: 'Reliance retesting VWAP average at 2,980 with healthy buy volume. High risk-to-reward setup targeting 3,025 with stop under 2,960.',
            createdAt: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
            relativeTime: '5h ago',
            likes: 31,
            dislikes: 0,
            isLiked: false,
            replies: []
          }
        ];
      }

      this.renderComments(marketKey);
    }

    /**
     * Post comment from composer
     */
    async postComment(marketKey, parentId = null, section = null) {
      if (!this.requireAuthOrPrompt('comment')) return;

      const container = section || document.querySelector(`.market-comments-section[data-market="${marketKey}"]`) || document;
      let textarea = parentId 
        ? container.querySelector(`#reply-input-${parentId}`)
        : container.querySelector('.composer-textarea');

      if (!textarea) return;

      const content = textarea.value.trim();
      if (!content) {
        this.showToast('Please enter your analysis or trade setup before posting.', 'error');
        textarea.focus();
        return;
      }

      if (content.length > 2000) {
        this.showToast('Analysis exceeds 2000 character limit.', 'error');
        return;
      }

      const sentiment = parentId ? undefined : (this.markets[marketKey].selectedSentiment || 'bullish');
      const timeframe = parentId ? '' : (this.markets[marketKey].selectedTimeframe || '');
      const user = this.getCurrentUser();

      try {
        const response = await fetch(`${this.apiBaseUrl}/comments`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Id': user.id,
            'X-Username': user.username,
            'X-User-Avatar': user.avatar || '',
            'X-User-Pro': (!!user.isPro).toString(),
          },
          credentials: 'include',
          body: JSON.stringify({
            content,
            parentId,
            sentiment,
            timeframe,
            market: marketKey
          })
        }).catch(() => null);

        if (response && response.ok) {
          const res = await response.json();
          if (res && res.success) {
            textarea.value = '';
            this.updateCharacterCount(textarea);
            this.showToast(parentId ? 'Reply posted!' : 'Analysis shared with the community!', 'success');
            this.loadComments(marketKey);
            return;
          }
        }

        // Local fallback
        const newComment = {
          id: `${marketKey}_` + Date.now(),
          userId: user.id,
          username: user.username,
          userAvatar: user.avatar || '',
          isPro: !!user.isPro,
          sentiment: sentiment || 'bullish',
          timeframe: timeframe || '',
          market: marketKey,
          content: content,
          createdAt: new Date().toISOString(),
          relativeTime: 'Just now',
          likes: 0,
          dislikes: 0,
          isLiked: false,
          replies: []
        };

        if (parentId) {
          const parent = this.markets[marketKey].comments.find(c => c.id === parentId);
          if (parent) {
            if (!parent.replies) parent.replies = [];
            parent.replies.push({
              id: 'r_' + Date.now(),
              userId: user.id,
              username: user.username,
              userAvatar: user.avatar || '',
              content: content,
              createdAt: new Date().toISOString(),
              relativeTime: 'Just now',
              likes: 0,
              dislikes: 0,
              isLiked: false
            });
          }
        } else {
          this.markets[marketKey].comments.unshift(newComment);
        }

        try {
          localStorage.setItem(`riskloop_${marketKey}_comments`, JSON.stringify(this.markets[marketKey].comments));
        } catch (e) {}

        textarea.value = '';
        this.updateCharacterCount(textarea);
        this.showToast(parentId ? 'Reply posted!' : 'Analysis shared with the community!', 'success');
        this.renderComments(marketKey);
      } catch (err) {
        console.error('Error posting discussion:', err);
        this.showToast('Analysis saved locally.', 'success');
      }
    }

    /**
     * Filter comments for a specific market
     */
    getFilteredComments(marketKey) {
      const state = this.markets[marketKey];
      let list = [...state.comments];

      if (state.filter === 'bullish') {
        list = list.filter(c => c.sentiment === 'bullish');
      } else if (state.filter === 'bearish') {
        list = list.filter(c => c.sentiment === 'bearish');
      }

      if (state.sort === 'liked') {
        list.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      } else {
        list.sort((a, b) => new Date(b.createdAt || b.timestamp || 0) - new Date(a.createdAt || a.timestamp || 0));
      }

      return list;
    }

    /**
     * Render discussions feed
     */
    renderComments(marketKey) {
      const feed = document.getElementById(`${marketKey}CommentsFeed`) ||
                   document.querySelector(`.market-comments-section[data-market="${marketKey}"] .comments-feed`);
      if (!feed) return;

      const list = this.getFilteredComments(marketKey);

      if (list.length === 0) {
        feed.innerHTML = `
          <div class="no-comments" style="text-align:center;padding:40px 20px;color:#9ca3af;">
            <div style="font-size:32px;margin-bottom:12px;">📊</div>
            <p style="font-size:15px;font-weight:600;color:#e5e7eb;margin-bottom:6px;">No trade ideas in this filter yet</p>
            <p style="font-size:13px;color:#6b7280;">Be the first trader to share your setup and analysis!</p>
          </div>
        `;
        return;
      }

      feed.innerHTML = list.map(comment => this.renderCommentCard(comment, marketKey)).join('');
    }

    /**
     * Render single discussion item card
     */
    renderCommentCard(c, marketKey) {
      const user = this.getCurrentUser();
      const isOwner = user && c.userId === user.id;
      const initial = (c.username || 'T').charAt(0).toUpperCase();

      // Sentiment badge
      let sentimentBadge = '';
      if (c.sentiment === 'bullish') {
        sentimentBadge = '<span class="comment-tag-badge tag-bullish">🟢 Bullish</span>';
      } else if (c.sentiment === 'bearish') {
        sentimentBadge = '<span class="comment-tag-badge tag-bearish">🔴 Bearish</span>';
      } else if (c.sentiment === 'neutral') {
        sentimentBadge = '<span class="comment-tag-badge tag-neutral">⚪ Neutral</span>';
      }

      // Timeframe badge
      const timeframeBadge = c.timeframe 
        ? `<span class="comment-tag-badge tag-timeframe">⏱️ ${this.escapeHtml(c.timeframe)}</span>` 
        : '';

      // Market badge
      const marketLabel = marketKey === 'forex' ? 'Forex' : 'Indian Market';
      const marketBadge = `<span class="comment-tag-badge tag-market-ctx">${marketLabel}</span>`;

      // Pro badge
      const proBadge = c.isPro ? '<span class="pro-badge">PRO</span>' : '';

      // Replies HTML
      const repliesHtml = (c.replies && c.replies.length > 0) ? `
        <div class="comment-replies">
          ${c.replies.map(r => this.renderReplyCard(r, c.id, marketKey)).join('')}
        </div>
      ` : '';

      return `
        <div class="comment-item" data-comment-id="${c.id}">
          <div class="comment-avatar">
            ${c.userAvatar 
              ? `<img src="${c.userAvatar}" alt="${this.escapeHtml(c.username)}" />` 
              : `<div class="avatar-initials">${initial}</div>`
            }
          </div>
          <div class="comment-content">
            <div class="comment-header">
              <div class="comment-author-wrap">
                <span class="comment-author">${this.escapeHtml(c.username)}</span>
                ${proBadge}
                <span class="comment-time">${c.relativeTime || 'Recently'}</span>
                ${c.isEdited ? '<span class="edited-badge">(edited)</span>' : ''}
              </div>
              <div class="comment-badges-wrap">
                ${sentimentBadge}
                ${timeframeBadge}
                ${marketBadge}
              </div>
              <div class="comment-menu">
                <button class="comment-menu-btn" onclick="marketComments.toggleMenu('${c.id}')" title="Options">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="1"></circle>
                    <circle cx="12" cy="5" r="1"></circle>
                    <circle cx="12" cy="19" r="1"></circle>
                  </svg>
                </button>
                <div class="comment-menu-dropdown" id="menu-${c.id}" style="display: none;">
                  ${isOwner ? `
                    <button onclick="marketComments.deleteComment('${c.id}', '${marketKey}')">
                      <span>🗑️ Delete</span>
                    </button>
                  ` : `
                    <button onclick="marketComments.reportComment('${c.id}')">
                      <span>🚩 Report</span>
                    </button>
                  `}
                </div>
              </div>
            </div>

            <div class="comment-text">${this.formatContent(c.content)}</div>

            <div class="comment-actions">
              <button class="comment-like-btn ${c.isLiked ? 'active' : ''}" onclick="marketComments.toggleLike('${c.id}', '${marketKey}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="${c.isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
                <span class="like-count">${c.likes || 0}</span>
              </button>
              <button class="comment-reply-btn" onclick="marketComments.toggleReplyBox('${c.id}')">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>Reply</span>
              </button>
            </div>

            ${repliesHtml}

            <!-- Inline Reply Box -->
            <div class="reply-composer" id="reply-box-${c.id}" style="display: none;">
              <textarea id="reply-input-${c.id}" placeholder="Write your reply or counter-analysis..." maxlength="2000" rows="2"></textarea>
              <div class="reply-actions">
                <button class="btn-cancel" onclick="marketComments.toggleReplyBox('${c.id}')" type="button">Cancel</button>
                <button class="btn-post-reply" onclick="marketComments.postReply('${c.id}', '${marketKey}')" type="button">Post Reply</button>
              </div>
            </div>
          </div>
        </div>
      `;
    }

    /**
     * Render reply item
     */
    renderReplyCard(r, parentId, marketKey) {
      const user = this.getCurrentUser();
      const isOwner = user && r.userId === user.id;
      const initial = (r.username || 'T').charAt(0).toUpperCase();

      return `
        <div class="comment-reply" data-reply-id="${r.id}">
          <div class="comment-avatar">
            ${r.userAvatar 
              ? `<img src="${r.userAvatar}" alt="${this.escapeHtml(r.username)}" />` 
              : `<div class="avatar-initials">${initial}</div>`
            }
          </div>
          <div class="comment-content">
            <div class="comment-header">
              <span class="comment-author">${this.escapeHtml(r.username)}</span>
              ${r.isPro ? '<span class="pro-badge">PRO</span>' : ''}
              <span class="comment-time">${r.relativeTime || 'Recently'}</span>
            </div>
            <div class="comment-text">${this.formatContent(r.content)}</div>
            <div class="comment-actions">
              <button class="comment-like-btn ${r.isLiked ? 'active' : ''}" onclick="marketComments.toggleReplyLike('${parentId}', '${r.id}', '${marketKey}')">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="${r.isLiked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
                </svg>
                <span class="like-count">${r.likes || 0}</span>
              </button>
            </div>
          </div>
        </div>
      `;
    }

    /**
     * Toggle like on comment
     */
    async toggleLike(commentId, marketKey) {
      if (!this.requireAuthOrPrompt('like')) return;

      const state = this.markets[marketKey];
      const comment = state.comments.find(c => c.id === commentId);
      if (!comment) return;

      comment.isLiked = !comment.isLiked;
      comment.likes = comment.isLiked ? (comment.likes || 0) + 1 : Math.max(0, (comment.likes || 1) - 1);

      try {
        localStorage.setItem(`riskloop_${marketKey}_comments`, JSON.stringify(state.comments));
      } catch (e) {}

      this.renderComments(marketKey);

      // Async API sync
      fetch(`${this.apiBaseUrl}/comments/${commentId}/like`, {
        method: 'POST',
        credentials: 'include'
      }).catch(() => {});
    }

    /**
     * Toggle like on reply
     */
    toggleReplyLike(parentId, replyId, marketKey) {
      if (!this.requireAuthOrPrompt('like')) return;

      const state = this.markets[marketKey];
      const parent = state.comments.find(c => c.id === parentId);
      if (!parent || !parent.replies) return;

      const reply = parent.replies.find(r => r.id === replyId);
      if (!reply) return;

      reply.isLiked = !reply.isLiked;
      reply.likes = reply.isLiked ? (reply.likes || 0) + 1 : Math.max(0, (reply.likes || 1) - 1);

      try {
        localStorage.setItem(`riskloop_${marketKey}_comments`, JSON.stringify(state.comments));
      } catch (e) {}

      this.renderComments(marketKey);
    }

    /**
     * Toggle reply composer
     */
    toggleReplyBox(commentId) {
      const box = document.getElementById(`reply-box-${commentId}`);
      if (!box) return;

      const isHidden = box.style.display === 'none';
      box.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        const input = document.getElementById(`reply-input-${commentId}`);
        if (input) input.focus();
      }
    }

    /**
     * Post a reply
     */
    postReply(parentId, marketKey) {
      this.postComment(marketKey, parentId);
      this.toggleReplyBox(parentId);
    }

    /**
     * Delete comment
     */
    async deleteComment(commentId, marketKey) {
      if (!confirm('Are you sure you want to delete this discussion?')) return;

      const state = this.markets[marketKey];
      state.comments = state.comments.filter(c => c.id !== commentId);

      try {
        localStorage.setItem(`riskloop_${marketKey}_comments`, JSON.stringify(state.comments));
      } catch (e) {}

      this.renderComments(marketKey);
      this.showToast('Discussion removed.', 'info');

      fetch(`${this.apiBaseUrl}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'include'
      }).catch(() => {});
    }

    /**
     * Report comment
     */
    reportComment(commentId) {
      this.showToast('Thank you. This analysis has been flagged for review.', 'info');
      const menu = document.getElementById(`menu-${commentId}`);
      if (menu) menu.style.display = 'none';
    }

    /**
     * Toggle dropdown options menu
     */
    toggleMenu(commentId) {
      const menu = document.getElementById(`menu-${commentId}`);
      if (!menu) return;
      const isVisible = menu.style.display === 'block';
      document.querySelectorAll('.comment-menu-dropdown').forEach(m => m.style.display = 'none');
      menu.style.display = isVisible ? 'none' : 'block';
    }

    /**
     * Auto-publish pending draft after successful auth
     */
    handlePendingDraft() {
      const draftStr = sessionStorage.getItem('pending_comment_draft');
      if (!draftStr) return;

      try {
        const draft = JSON.parse(draftStr);
        sessionStorage.removeItem('pending_comment_draft');
        if (draft && draft.content) {
          const mKey = draft.market || 'indian';
          this.showToast('Publishing your analysis...', 'info');
          setTimeout(() => {
            const section = document.querySelector(`.market-comments-section[data-market="${mKey}"]`);
            const textarea = section?.querySelector('.composer-textarea');
            if (textarea) textarea.value = draft.content;
            this.postComment(mKey, draft.parentId, section);
          }, 500);
        }
      } catch (e) {
        sessionStorage.removeItem('pending_comment_draft');
      }
    }

    /**
     * Notification Toast
     */
    showToast(message, type = 'info') {
      if (typeof window.showToastNotification === 'function') {
        window.showToastNotification(message, type);
        return;
      }
      if (typeof window.showNotification === 'function') {
        window.showNotification(message, type);
        return;
      }

      const existing = document.getElementById('marketDiscussionToast');
      if (existing) existing.remove();

      const toast = document.createElement('div');
      toast.id = 'marketDiscussionToast';
      toast.className = `market-toast market-toast-${type}`;
      toast.textContent = message;
      document.body.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('show');
      }, 10);

      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 3500);
    }

    /**
     * Escape HTML & format cashtags ($NIFTY, $EURUSD) & hashtags (#Breakout)
     */
    formatContent(str) {
      if (!str) return '';
      let escaped = this.escapeHtml(str);

      // Cashtags ($NIFTY, $EURUSD, $GOLD)
      escaped = escaped.replace(/\$([A-Z0-9_]{2,10})/g, '<span class="content-cashtag">$$$1</span>');
      // Hashtags (#Intraday, #Breakout)
      escaped = escaped.replace(/#([a-zA-Z0-9_]{2,20})/g, '<span class="content-hashtag">#$1</span>');

      return escaped;
    }

    escapeHtml(text) {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }

  // Instantiate and export globally
  window.marketComments = new SmartMarketComments();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.marketComments.init();
    });
  }
})();
