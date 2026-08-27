/**
 * RiskLoop Contact Support Module
 * Manages full-page support options, category pre-selection chips,
 * support request form submission, and Supabase ticket creation.
 */

(function (window) {
  'use strict';

  // ── DOM References ─────────────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('contactSupportPage'),
      // Option Cards
      cardCreateBtn: document.getElementById('csCardCreateBtn'),
      cardMyTicketsBtn: document.getElementById('csCardMyTicketsBtn'),
      categoryChips: document.querySelectorAll('.cs-category-chip'),
      // Form Elements
      formCard: document.getElementById('csFormCard'),
      form: document.getElementById('csContactForm'),
      categorySelect: document.getElementById('csCategorySelect'),
      prioritySelect: document.getElementById('csPrioritySelect'),
      subjectInput: document.getElementById('csSubjectInput'),
      descriptionInput: document.getElementById('csDescriptionInput'),
      attachmentInput: document.getElementById('csAttachmentInput'),
      submitBtn: document.getElementById('csSubmitBtn'),
      // Confirmation Box
      confirmCard: document.getElementById('csConfirmCard'),
      confirmTicketId: document.getElementById('csConfirmTicketId'),
      confirmSubject: document.getElementById('csConfirmSubject'),
      confirmViewBtn: document.getElementById('csConfirmViewBtn'),
      confirmCreateAnotherBtn: document.getElementById('csConfirmCreateAnotherBtn')
    };
  }

  // ── Category Chip Click Handler ────────────────────────────────────────
  function selectCategory(catName) {
    const els = getElements();
    if (els.categorySelect) {
      // Find matching option in select
      let matched = false;
      for (let i = 0; i < els.categorySelect.options.length; i++) {
        if (els.categorySelect.options[i].value.toLowerCase() === catName.toLowerCase() ||
            els.categorySelect.options[i].text.toLowerCase().includes(catName.toLowerCase())) {
          els.categorySelect.selectedIndex = i;
          matched = true;
          break;
        }
      }
      if (!matched && els.categorySelect.options.length > 0) {
        els.categorySelect.value = catName;
      }
    }

    // Highlight active chip
    if (els.categoryChips) {
      els.categoryChips.forEach(chip => {
        chip.classList.toggle('cs-chip-active', chip.dataset.category?.toLowerCase() === catName.toLowerCase());
      });
    }

    // Scroll to form smoothly
    if (els.formCard) {
      els.formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    if (els.subjectInput) {
      setTimeout(() => els.subjectInput.focus(), 350);
    }
  }

  // ── Form Submission ────────────────────────────────────────────────────
  async function handleContactSubmit(e) {
    if (e) e.preventDefault();
    const els = getElements();

    const category = (els.categorySelect?.value || 'General').trim();
    const priority = (els.prioritySelect?.value || 'Medium').trim();
    const subject = (els.subjectInput?.value || '').trim();
    const description = (els.descriptionInput?.value || '').trim();
    const attachmentUrl = (els.attachmentInput?.value || '').trim();

    if (!subject) {
      showToast('Please enter a request subject.', true);
      els.subjectInput?.focus();
      return;
    }

    if (!description) {
      showToast('Please describe your question or issue in detail.', true);
      els.descriptionInput?.focus();
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

    // Disable submit button while saving
    if (els.submitBtn) {
      els.submitBtn.disabled = true;
      els.submitBtn.innerHTML = `
        <svg class="prof-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
        <span>Sending Support Request...</span>
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

      // 2. Add to local support tickets array for instant sync
      try {
        const existing = JSON.parse(localStorage.getItem('riskloop_support_tickets') || '[]');
        existing.unshift(newTicket);
        localStorage.setItem('riskloop_support_tickets', JSON.stringify(existing));
      } catch (e) {}

      // 3. Show confirmation card
      showConfirmation(newTicket);

      showToast(`Support request ${ticketNumber} sent successfully!`, false);

    } catch (err) {
      console.error('[ContactSupport] Error creating ticket:', err);
      showToast('Error submitting support request: ' + (err.message || 'Please try again'), true);
    } finally {
      if (els.submitBtn) {
        els.submitBtn.disabled = false;
        els.submitBtn.innerHTML = `
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          <span>Send Support Request</span>
        `;
      }
    }
  }

  function showConfirmation(ticket) {
    const els = getElements();
    if (els.formCard) els.formCard.hidden = true;
    if (els.confirmCard) {
      els.confirmCard.hidden = false;
      if (els.confirmTicketId) els.confirmTicketId.textContent = ticket.ticket_number || 'TICK-00000';
      if (els.confirmSubject) els.confirmSubject.textContent = ticket.subject;
      if (els.confirmViewBtn) {
        els.confirmViewBtn.onclick = () => {
          window.location.hash = 'tickets';
          setTimeout(() => {
            if (typeof window.openTicketDetails === 'function') {
              window.openTicketDetails(ticket.id);
            }
          }, 60);
        };
      }
      els.confirmCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function resetToForm() {
    const els = getElements();
    if (els.form) els.form.reset();
    if (els.confirmCard) els.confirmCard.hidden = true;
    if (els.formCard) {
      els.formCard.hidden = false;
      if (els.subjectInput) els.subjectInput.focus();
    }
    if (els.categoryChips) {
      els.categoryChips.forEach(c => c.classList.remove('cs-chip-active'));
    }
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
  function initContactSupportPage() {
    const els = getElements();

    // Option Card Buttons
    if (els.cardCreateBtn) {
      els.cardCreateBtn.onclick = () => {
        resetToForm();
        if (els.formCard) els.formCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
        if (els.subjectInput) setTimeout(() => els.subjectInput.focus(), 300);
      };
    }

    if (els.cardMyTicketsBtn) {
      els.cardMyTicketsBtn.onclick = () => {
        window.location.hash = 'tickets';
      };
    }

    // Category Chips
    if (els.categoryChips) {
      els.categoryChips.forEach(chip => {
        chip.onclick = () => {
          const cat = chip.dataset.category || chip.textContent.trim();
          selectCategory(cat);
        };
      });
    }

    // Form Handlers
    if (els.form) els.form.onsubmit = handleContactSubmit;
    if (els.submitBtn) els.submitBtn.onclick = handleContactSubmit;
    if (els.confirmCreateAnotherBtn) els.confirmCreateAnotherBtn.onclick = resetToForm;

    // Default form visibility
    if (els.confirmCard) els.confirmCard.hidden = true;
    if (els.formCard) els.formCard.hidden = false;
  }

  // Expose global methods
  window.initContactSupportPage = initContactSupportPage;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (window.location.hash === '#contact-support' || window.location.hash === '#support') {
        initContactSupportPage();
      }
    });
  }

}(window));
