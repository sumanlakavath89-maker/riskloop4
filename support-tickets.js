/**
 * RiskLoop Support Tickets Module
 * Manages full-page ticket listing, real-time conversation threads,
 * status filtering, ticket creation, and Supabase database sync.
 */

(function (window) {
  'use strict';

  // ── Initial Mock Tickets (Used if database is empty/offline) ───────────
  const INITIAL_TICKETS = [
    {
      id: 'ticket_1',
      ticket_number: 'TICK-84920',
      user_id: 'default_user',
      user_email: 'trader@riskloop.io',
      user_name: 'Suman Ghosh',
      subject: 'Angel One WebSocket feed latency during high-volatility session',
      category: 'Broker Connection',
      priority: 'High',
      status: 'Waiting for User',
      assigned_agent: 'Priya Sharma (Senior Technical Support)',
      description: 'During market open at 09:15 AM IST, option strikes feed lagged by ~1.2s before stabilizing.',
      attachment_url: '',
      created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 3600000).toISOString(),
      messages: [
        {
          id: 'msg_1_1',
          sender_type: 'user',
          sender_name: 'Suman Ghosh',
          message: 'Hello RiskLoop team, during today market open at 09:15 AM IST, option strike LTP feeds on the NIFTY 24500 CE experienced ~1.2s latency before stabilizing. Is there an active WebSocket reconnection threshold I should adjust in settings?',
          created_at: new Date(Date.now() - 2 * 86400000).toISOString()
        },
        {
          id: 'msg_1_2',
          sender_type: 'agent',
          sender_name: 'Priya Sharma (Senior Technical Support)',
          message: 'Hi Suman, thank you for reporting this. We analyzed the Angel One SmartAPI tick pump server logs around 09:15–09:17 AM. A surge in broker-side socket re-subscriptions caused a brief packet queue. Could you please check if the issue persisted after 09:20 AM or if you have your local client log export available?',
          created_at: new Date(Date.now() - 3600000).toISOString()
        }
      ]
    },
    {
      id: 'ticket_2',
      ticket_number: 'TICK-72814',
      user_id: 'default_user',
      user_email: 'trader@riskloop.io',
      user_name: 'Suman Ghosh',
      subject: 'Capital Shield daily drawdown lock trigger confirmation',
      category: 'Calculator',
      priority: 'Medium',
      status: 'Resolved',
      assigned_agent: 'Vikram Mehta (Risk Specialist)',
      description: 'Tested the 3% daily drawdown threshold. Verified that trade calculation locked as expected.',
      attachment_url: '',
      created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
      updated_at: new Date(Date.now() - 4 * 86400000).toISOString(),
      messages: [
        {
          id: 'msg_2_1',
          sender_type: 'user',
          sender_name: 'Suman Ghosh',
          message: 'Wanted to verify whether Capital Shield locks orders immediately upon reaching 3% max daily loss or if pending orders in the queue are still calculated.',
          created_at: new Date(Date.now() - 5 * 86400000).toISOString()
        },
        {
          id: 'msg_2_2',
          sender_type: 'agent',
          sender_name: 'Vikram Mehta (Risk Specialist)',
          message: 'Hello Suman, Capital Shield instantly halts any new position sizing calculation the moment cumulative daily loss reaches the configured 3.0% threshold. Existing positions remain protected with stop-losses active on your broker terminal.',
          created_at: new Date(Date.now() - 4 * 86400000).toISOString()
        }
      ]
    }
  ];

  // ── State ─────────────────────────────────────────────────────────────
  const ticketState = {
    tickets: [],
    filteredTickets: [],
    activeTicket: null,
    activeMessages: [],
    loading: false,
    filters: {
      search: '',
      status: 'all',
      category: 'all',
      sort: 'newest'
    }
  };

  // ── DOM References ─────────────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('supportTicketsPage'),
      // Views
      listView: document.getElementById('stkListView'),
      detailView: document.getElementById('stkDetailView'),
      createModal: document.getElementById('stkCreateModal'),
      // Header Actions
      newTicketBtn: document.getElementById('stkNewTicketBtn'),
      emptyNewTicketBtn: document.getElementById('stkEmptyNewTicketBtn'),
      // Filter Inputs
      searchInput: document.getElementById('stkSearchInput'),
      statusFilter: document.getElementById('stkStatusFilter'),
      categoryFilter: document.getElementById('stkCategoryFilter'),
      sortFilter: document.getElementById('stkSortFilter'),
      // Status Count Pills
      countAll: document.getElementById('stkCountAll'),
      countOpen: document.getElementById('stkCountOpen'),
      countInProgress: document.getElementById('stkCountInProgress'),
      countWaiting: document.getElementById('stkCountWaiting'),
      countResolved: document.getElementById('stkCountResolved'),
      countClosed: document.getElementById('stkCountClosed'),
      statusPillButtons: document.querySelectorAll('.stk-status-pill'),
      // List Elements
      ticketsTableBody: document.getElementById('stkTableBody'),
      emptyState: document.getElementById('stkEmptyState'),
      // Detail View Elements
      detailBackBtn: document.getElementById('stkDetailBackBtn'),
      detailTicketNumber: document.getElementById('stkDetailTicketNumber'),
      detailSubject: document.getElementById('stkDetailSubject'),
      detailStatusBadge: document.getElementById('stkDetailStatusBadge'),
      detailPriorityBadge: document.getElementById('stkDetailPriorityBadge'),
      detailCategory: document.getElementById('stkDetailCategory'),
      detailCreated: document.getElementById('stkDetailCreated'),
      detailAgent: document.getElementById('stkDetailAgent'),
      messagesContainer: document.getElementById('stkMessagesContainer'),
      replyForm: document.getElementById('stkReplyForm'),
      replyInput: document.getElementById('stkReplyInput'),
      replySendBtn: document.getElementById('stkReplySendBtn'),
      // Create Form Elements
      createForm: document.getElementById('stkCreateForm'),
      createCloseBtn: document.getElementById('stkCreateCloseBtn'),
      createCancelBtn: document.getElementById('stkCreateCancelBtn'),
      createSubmitBtn: document.getElementById('stkCreateSubmitBtn'),
      createCategory: document.getElementById('stkCreateCategory'),
      createPriority: document.getElementById('stkCreatePriority'),
      createSubject: document.getElementById('stkCreateSubject'),
      createDescription: document.getElementById('stkCreateDescription'),
      createAttachment: document.getElementById('stkCreateAttachment')
    };
  }

  // ── Load Tickets from Supabase or Cache ────────────────────────────────
  async function fetchUserTickets() {
    ticketState.loading = true;

    try {
      let localCached = null;
      try {
        const raw = localStorage.getItem('riskloop_support_tickets');
        if (raw) localCached = JSON.parse(raw);
      } catch (e) {}

      let user = null;
      if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
        user = window.RiskLoopAuth.getUser();
      }

      if (window.supabaseClient && user && user.id) {
        const { data: dbTickets, error } = await window.supabaseClient
          .from('support_tickets')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (dbTickets && !error && dbTickets.length > 0) {
          ticketState.tickets = dbTickets;
        } else if (localCached && localCached.length > 0) {
          ticketState.tickets = localCached;
        } else {
          ticketState.tickets = INITIAL_TICKETS;
        }
      } else if (localCached && localCached.length > 0) {
        ticketState.tickets = localCached;
      } else {
        ticketState.tickets = INITIAL_TICKETS;
      }

      // Persist local copy
      try {
        localStorage.setItem('riskloop_support_tickets', JSON.stringify(ticketState.tickets));
      } catch (e) {}

    } catch (err) {
      console.warn('[SupportTickets] Error fetching tickets:', err);
      ticketState.tickets = INITIAL_TICKETS;
    } finally {
      ticketState.loading = false;
      applyFiltersAndRender();
    }
  }

  // ── Filter and Render Ticket List ──────────────────────────────────────
  function applyFiltersAndRender() {
    const els = getElements();
    const { search, status, category, sort } = ticketState.filters;

    // 1. Calculate live counts across all tickets
    const counts = {
      all: ticketState.tickets.length,
      open: 0,
      in_progress: 0,
      waiting_for_user: 0,
      resolved: 0,
      closed: 0
    };

    ticketState.tickets.forEach(t => {
      const s = normalizeStatus(t.status);
      if (counts[s] !== undefined) counts[s]++;
    });

    if (els.countAll) els.countAll.textContent = counts.all;
    if (els.countOpen) els.countOpen.textContent = counts.open;
    if (els.countInProgress) els.countInProgress.textContent = counts.in_progress;
    if (els.countWaiting) els.countWaiting.textContent = counts.waiting_for_user;
    if (els.countResolved) els.countResolved.textContent = counts.resolved;
    if (els.countClosed) els.countClosed.textContent = counts.closed;

    // 2. Filter tickets
    let list = [...ticketState.tickets];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(t => 
        (t.ticket_number && t.ticket_number.toLowerCase().includes(q)) ||
        (t.subject && t.subject.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
      );
    }

    if (status !== 'all') {
      list = list.filter(t => normalizeStatus(t.status) === status);
    }

    if (category !== 'all') {
      list = list.filter(t => (t.category || '').toLowerCase() === category.toLowerCase());
    }

    // 3. Sort tickets
    list.sort((a, b) => {
      const dateA = new Date(a.created_at || a.updated_at || 0).getTime();
      const dateB = new Date(b.created_at || b.updated_at || 0).getTime();
      return sort === 'oldest' ? dateA - dateB : dateB - dateA;
    });

    ticketState.filteredTickets = list;

    // 4. Render Table
    if (els.ticketsTableBody && els.emptyState) {
      if (list.length === 0) {
        els.ticketsTableBody.innerHTML = '';
        els.emptyState.hidden = false;
      } else {
        els.emptyState.hidden = true;
        els.ticketsTableBody.innerHTML = list.map(t => renderTicketRow(t)).join('');
      }
    }
  }

  function renderTicketRow(t) {
    const statusObj = getStatusConfig(t.status);
    const priorityObj = getPriorityConfig(t.priority);
    const createdStr = formatFriendlyDate(t.created_at);
    const updatedStr = formatFriendlyDate(t.updated_at || t.created_at);

    return `
      <tr class="stk-row" onclick="window.openTicketDetails('${escapeHtml(t.id)}')">
        <td class="stk-col-id">
          <span class="stk-id-badge">${escapeHtml(t.ticket_number || 'TICK-00000')}</span>
        </td>
        <td class="stk-col-subject">
          <div class="stk-subject-wrap">
            <strong class="stk-subject-title">${escapeHtml(t.subject)}</strong>
            <span class="stk-subject-desc">${escapeHtml(t.description || '')}</span>
          </div>
        </td>
        <td class="stk-col-cat">
          <span class="stk-cat-pill">${escapeHtml(t.category || 'Other')}</span>
        </td>
        <td class="stk-col-status">
          <span class="stk-status-badge ${statusObj.cls}">
            <span class="stk-dot"></span>
            <span>${escapeHtml(statusObj.label)}</span>
          </span>
        </td>
        <td class="stk-col-priority">
          <span class="stk-priority-badge ${priorityObj.cls}">${escapeHtml(priorityObj.label)}</span>
        </td>
        <td class="stk-col-agent">
          <span class="stk-agent-txt">${escapeHtml(t.assigned_agent || 'Support Team')}</span>
        </td>
        <td class="stk-col-updated">
          <span class="stk-time-txt" title="${escapeHtml(t.updated_at || '')}">${updatedStr}</span>
        </td>
        <td class="stk-col-action">
          <button class="stk-view-btn" type="button" title="View Conversation">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
          </button>
        </td>
      </tr>
    `;
  }

  // ── Detail Conversation View ───────────────────────────────────────────
  async function openTicketDetails(ticketId) {
    const els = getElements();
    const ticket = ticketState.tickets.find(t => String(t.id) === String(ticketId));
    if (!ticket) return;

    ticketState.activeTicket = ticket;

    // Load messages from Supabase or ticket object
    let messages = ticket.messages || [];
    if (window.supabaseClient && ticket.id && typeof ticket.id === 'string' && ticket.id.includes('-')) {
      try {
        const { data: dbMessages } = await window.supabaseClient
          .from('ticket_messages')
          .select('*')
          .eq('ticket_id', ticket.id)
          .order('created_at', { ascending: true });

        if (dbMessages && dbMessages.length > 0) {
          messages = dbMessages;
        }
      } catch (e) {
        console.warn('[SupportTickets] Messages fetch fallback:', e);
      }
    }
    ticketState.activeMessages = messages;

    // Populate Detail Header
    const statusObj = getStatusConfig(ticket.status);
    const priorityObj = getPriorityConfig(ticket.priority);

    if (els.detailTicketNumber) els.detailTicketNumber.textContent = ticket.ticket_number || 'TICK-00000';
    if (els.detailSubject) els.detailSubject.textContent = ticket.subject;
    if (els.detailCategory) els.detailCategory.textContent = ticket.category || 'General';
    if (els.detailCreated) els.detailCreated.textContent = formatFriendlyDate(ticket.created_at);
    if (els.detailAgent) els.detailAgent.textContent = ticket.assigned_agent || 'RiskLoop Support Team';

    if (els.detailStatusBadge) {
      els.detailStatusBadge.className = `stk-status-badge ${statusObj.cls}`;
      els.detailStatusBadge.innerHTML = `<span class="stk-dot"></span><span>${escapeHtml(statusObj.label)}</span>`;
    }

    if (els.detailPriorityBadge) {
      els.detailPriorityBadge.className = `stk-priority-badge ${priorityObj.cls}`;
      els.detailPriorityBadge.textContent = priorityObj.label;
    }

    // Render Message Bubbles
    renderConversationMessages(messages, ticket);

    // Switch View
    if (els.listView) els.listView.hidden = true;
    if (els.detailView) els.detailView.hidden = false;

    // Scroll to bottom
    if (els.messagesContainer) {
      setTimeout(() => {
        els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
      }, 50);
    }
  }

  function renderConversationMessages(messages, ticket) {
    const els = getElements();
    if (!els.messagesContainer) return;

    // Initial original ticket description bubble
    let html = `
      <div class="stk-msg-bubble stk-msg-user">
        <div class="stk-msg-header">
          <div class="stk-msg-author">
            <span class="stk-avatar-circle">${escapeHtml(getInitials(ticket.user_name || 'You'))}</span>
            <strong class="stk-author-name">${escapeHtml(ticket.user_name || 'You')}</strong>
            <span class="stk-role-pill">Author</span>
          </div>
          <span class="stk-msg-time">${formatFriendlyDate(ticket.created_at)}</span>
        </div>
        <div class="stk-msg-body">${escapeHtml(ticket.description)}</div>
      </div>
    `;

    // Subsequent replies
    if (Array.isArray(messages)) {
      messages.forEach(m => {
        const isAgent = m.sender_type === 'agent';
        html += `
          <div class="stk-msg-bubble ${isAgent ? 'stk-msg-agent' : 'stk-msg-user'}">
            <div class="stk-msg-header">
              <div class="stk-msg-author">
                <span class="stk-avatar-circle ${isAgent ? 'stk-agent-avatar' : ''}">
                  ${isAgent ? '🛡️' : escapeHtml(getInitials(m.sender_name || 'You'))}
                </span>
                <strong class="stk-author-name">${escapeHtml(m.sender_name || (isAgent ? 'Support Specialist' : 'You'))}</strong>
                ${isAgent ? '<span class="stk-verified-pill">Official Support</span>' : '<span class="stk-role-pill">You</span>'}
              </div>
              <span class="stk-msg-time">${formatFriendlyDate(m.created_at)}</span>
            </div>
            <div class="stk-msg-body">${escapeHtml(m.message)}</div>
            ${m.attachment_url ? `<div class="stk-msg-attachment"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg><a href="${escapeHtml(m.attachment_url)}" target="_blank" rel="noopener">Attachment</a></div>` : ''}
          </div>
        `;
      });
    }

    els.messagesContainer.innerHTML = html;
  }

  function closeTicketDetails() {
    const els = getElements();
    if (els.listView) els.listView.hidden = false;
    if (els.detailView) els.detailView.hidden = true;
    ticketState.activeTicket = null;
    applyFiltersAndRender();
  }

  // ── Send Ticket Reply ──────────────────────────────────────────────────
  async function sendTicketReply() {
    const els = getElements();
    const text = (els.replyInput?.value || '').trim();
    const ticket = ticketState.activeTicket;

    if (!text || !ticket) return;

    let user = null;
    if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
      user = window.RiskLoopAuth.getUser();
    }
    const senderName = user?.fullName || user?.email || 'You';

    const newMsg = {
      id: 'msg_' + Date.now(),
      ticket_id: ticket.id,
      sender_type: 'user',
      sender_name: senderName,
      message: text,
      created_at: new Date().toISOString()
    };

    // Append to active messages
    if (!ticket.messages) ticket.messages = [];
    ticket.messages.push(newMsg);
    ticketState.activeMessages.push(newMsg);

    // Update ticket status
    ticket.status = 'Open';
    ticket.updated_at = new Date().toISOString();

    // Clear input
    if (els.replyInput) els.replyInput.value = '';

    // Render updated thread
    renderConversationMessages(ticketState.activeMessages, ticket);

    // Persist to Supabase if live
    if (window.supabaseClient && typeof ticket.id === 'string' && ticket.id.includes('-')) {
      try {
        await window.supabaseClient.from('ticket_messages').insert({
          ticket_id: ticket.id,
          sender_id: user?.id || null,
          sender_type: 'user',
          sender_name: senderName,
          message: text,
          created_at: new Date().toISOString()
        });

        await window.supabaseClient
          .from('support_tickets')
          .update({
            status: 'Open',
            updated_at: new Date().toISOString()
          })
          .eq('id', ticket.id);
      } catch (err) {
        console.warn('[SupportTickets] Error saving reply to Supabase:', err);
      }
    }

    try {
      localStorage.setItem('riskloop_support_tickets', JSON.stringify(ticketState.tickets));
    } catch (e) {}

    showToast('Reply posted successfully!', false);

    if (els.messagesContainer) {
      setTimeout(() => {
        els.messagesContainer.scrollTop = els.messagesContainer.scrollHeight;
      }, 50);
    }
  }

  // ── Create New Ticket ──────────────────────────────────────────────────
  function openCreateTicketModal() {
    const els = getElements();
    if (els.createModal) {
      els.createModal.hidden = false;
      document.body.style.overflow = 'hidden';
      if (els.createSubject) els.createSubject.focus();
    }
  }

  function closeCreateTicketModal() {
    const els = getElements();
    if (els.createModal) {
      els.createModal.hidden = true;
      document.body.style.overflow = '';
      if (els.createForm) els.createForm.reset();
    }
  }

  async function submitNewTicket(e) {
    if (e) e.preventDefault();
    const els = getElements();

    const category = (els.createCategory?.value || 'General').trim();
    const priority = (els.createPriority?.value || 'Medium').trim();
    const subject = (els.createSubject?.value || '').trim();
    const description = (els.createDescription?.value || '').trim();
    const attachmentUrl = (els.createAttachment?.value || '').trim();

    if (!subject) {
      showToast('Please enter a ticket subject.', true);
      els.createSubject?.focus();
      return;
    }

    if (!description) {
      showToast('Please provide a detailed description.', true);
      els.createDescription?.focus();
      return;
    }

    let user = null;
    if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
      user = window.RiskLoopAuth.getUser();
    }

    const ticketNumber = `TICK-${Math.floor(10000 + Math.random() * 90000)}`;
    const newTicket = {
      id: 'ticket_' + Date.now(),
      ticket_number: ticketNumber,
      user_id: user?.id || 'usr_local',
      user_email: user?.email || 'trader@riskloop.io',
      user_name: user?.fullName || 'Trader',
      subject: subject,
      category: category,
      priority: priority,
      status: 'Open',
      assigned_agent: 'RiskLoop Support Team',
      description: description,
      attachment_url: attachmentUrl,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: []
    };

    // Disable button while submitting
    if (els.createSubmitBtn) {
      els.createSubmitBtn.disabled = true;
      els.createSubmitBtn.innerHTML = `
        <svg class="prof-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
        <span>Submitting...</span>
      `;
    }

    try {
      // 1. Try Supabase Insert if available
      if (window.supabaseClient && user && user.id) {
        const { data: insertedTicket, error: tErr } = await window.supabaseClient
          .from('support_tickets')
          .insert({
            ticket_number: ticketNumber,
            user_id: user.id,
            user_email: user.email,
            user_name: user.fullName || user.email,
            subject: subject,
            category: category,
            priority: priority,
            status: 'Open',
            assigned_agent: 'RiskLoop Support Team',
            description: description,
            attachment_url: attachmentUrl || null
          })
          .select()
          .single();

        if (insertedTicket && !tErr) {
          newTicket.id = insertedTicket.id;
        }
      }

      // Add to front of list
      ticketState.tickets.unshift(newTicket);
      try {
        localStorage.setItem('riskloop_support_tickets', JSON.stringify(ticketState.tickets));
      } catch (e) {}

      closeCreateTicketModal();
      showToast(`Ticket ${ticketNumber} created successfully!`, false);

      // Open new ticket details immediately
      openTicketDetails(newTicket.id);

    } catch (err) {
      console.error('[SupportTickets] Error creating ticket:', err);
      showToast('Error creating ticket: ' + (err.message || 'Please try again'), true);
    } finally {
      if (els.createSubmitBtn) {
        els.createSubmitBtn.disabled = false;
        els.createSubmitBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Submit Ticket</span>
        `;
      }
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────
  function normalizeStatus(s) {
    if (!s) return 'open';
    const str = s.toLowerCase().replace(/[\s-]+/g, '_');
    if (str.includes('progress')) return 'in_progress';
    if (str.includes('wait')) return 'waiting_for_user';
    if (str.includes('resolve')) return 'resolved';
    if (str.includes('close')) return 'closed';
    return 'open';
  }

  function getStatusConfig(status) {
    const s = normalizeStatus(status);
    switch (s) {
      case 'in_progress':
        return { label: 'In Progress', cls: 'stk-status-inprogress' };
      case 'waiting_for_user':
        return { label: 'Waiting for User', cls: 'stk-status-waiting' };
      case 'resolved':
        return { label: 'Resolved', cls: 'stk-status-resolved' };
      case 'closed':
        return { label: 'Closed', cls: 'stk-status-closed' };
      case 'open':
      default:
        return { label: 'Open', cls: 'stk-status-open' };
    }
  }

  function getPriorityConfig(priority) {
    const p = (priority || 'medium').toLowerCase();
    if (p.includes('urgent')) return { label: 'Urgent', cls: 'stk-priority-urgent' };
    if (p.includes('high')) return { label: 'High', cls: 'stk-priority-high' };
    if (p.includes('low')) return { label: 'Low', cls: 'stk-priority-low' };
    return { label: 'Medium', cls: 'stk-priority-medium' };
  }

  function formatFriendlyDate(dateStr) {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      const now = new Date();
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays === 0) {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else if (diffDays === 1) {
        return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      } else {
        return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }
    } catch (e) {
      return dateStr;
    }
  }

  function getInitials(name) {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function showToast(message, isError = false) {
    if (typeof window.showAuthToast === 'function') {
      window.showAuthToast(message, isError);
      return;
    }

    const toast = document.createElement('div');
    toast.className = `prof-toast ${isError ? 'prof-toast-error' : 'prof-toast-success'}`;
    toast.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        ${isError ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' : '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'}
      </svg>
      <span>${escapeHtml(message)}</span>
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('prof-toast-show'), 10);
    setTimeout(() => {
      toast.classList.remove('prof-toast-show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ── Initialize Event Listeners ─────────────────────────────────────────
  function initSupportTicketsPage() {
    const els = getElements();

    // Create New Ticket Buttons
    if (els.newTicketBtn) els.newTicketBtn.onclick = openCreateTicketModal;
    if (els.emptyNewTicketBtn) els.emptyNewTicketBtn.onclick = openCreateTicketModal;

    // Search input
    if (els.searchInput) {
      els.searchInput.oninput = (e) => {
        ticketState.filters.search = e.target.value;
        applyFiltersAndRender();
      };
    }

    // Status filter dropdown
    if (els.statusFilter) {
      els.statusFilter.onchange = (e) => {
        ticketState.filters.status = e.target.value;
        updateActivePill(e.target.value);
        applyFiltersAndRender();
      };
    }

    // Category filter dropdown
    if (els.categoryFilter) {
      els.categoryFilter.onchange = (e) => {
        ticketState.filters.category = e.target.value;
        applyFiltersAndRender();
      };
    }

    // Sort filter dropdown
    if (els.sortFilter) {
      els.sortFilter.onchange = (e) => {
        ticketState.filters.sort = e.target.value;
        applyFiltersAndRender();
      };
    }

    // Status Pill Buttons
    if (els.statusPillButtons) {
      els.statusPillButtons.forEach(btn => {
        btn.onclick = () => {
          const s = btn.dataset.status || 'all';
          ticketState.filters.status = s;
          if (els.statusFilter) els.statusFilter.value = s;
          updateActivePill(s);
          applyFiltersAndRender();
        };
      });
    }

    // Detail Back Button
    if (els.detailBackBtn) els.detailBackBtn.onclick = closeTicketDetails;

    // Reply Form
    if (els.replySendBtn) els.replySendBtn.onclick = sendTicketReply;
    if (els.replyInput) {
      els.replyInput.onkeydown = (e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          sendTicketReply();
        }
      };
    }

    // Create Ticket Form
    if (els.createForm) els.createForm.onsubmit = submitNewTicket;
    if (els.createSubmitBtn) els.createSubmitBtn.onclick = submitNewTicket;
    if (els.createCloseBtn) els.createCloseBtn.onclick = closeCreateTicketModal;
    if (els.createCancelBtn) els.createCancelBtn.onclick = closeCreateTicketModal;

    // Fetch and render
    fetchUserTickets();
  }

  function updateActivePill(status) {
    const pills = document.querySelectorAll('.stk-status-pill');
    pills.forEach(p => {
      p.classList.toggle('stk-pill-active', p.dataset.status === status);
    });
  }

  // Expose global methods
  window.initSupportTicketsPage = initSupportTicketsPage;
  window.openMyTicketsModal = () => { window.location.hash = 'tickets'; };
  window.openTicketDetails = openTicketDetails;
  window.closeTicketDetails = closeTicketDetails;
  window.openCreateTicketModal = openCreateTicketModal;
  window.closeCreateTicketModal = closeCreateTicketModal;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#tickets' || window.location.hash === '#support-tickets' || window.location.hash === '#my-tickets') {
        initSupportTicketsPage();
      }
    });
  }

}(window));
