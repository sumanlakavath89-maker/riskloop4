/**
 * RiskLoop My Profile Module
 * Handles loading, editing, and syncing user profile and account details with Supabase.
 * Supports image file picker upload, real-time preview, change, remove, validation, and confirmation.
 */

(function (window) {
  'use strict';

  // ── State ─────────────────────────────────────────────────────────────
  const profileState = {
    isEditing: false,
    loading: false,
    user: null,
    profileData: {
      fullName: 'Suman Ghosh',
      email: 'trader@riskloop.io',
      phone: '+91 98765 43210',
      country: 'India',
      countryCode: 'IN',
      timezone: 'Asia/Kolkata',
      avatarUrl: '',
      memberSince: 'August 2026',
      isVerified: true,
      plan: 'Institutional Pro',
      planBadge: 'PRO',
      userId: 'usr_89f41b2c7e09',
      accountStatus: 'Active • Good Standing'
    }
  };

  // Avatar Upload / Preview temporary working state
  const avatarUploadState = {
    pendingAvatarUrl: null,
    pendingFile: null,
    pendingIsRemove: false,
    isUploading: false
  };

  // ── DOM References Cache ───────────────────────────────────────────────
  function getElements() {
    return {
      page: document.getElementById('profilePage'),
      // Header elements
      avatarDisplay: document.getElementById('profAvatarDisplay'),
      avatarInitials: document.getElementById('profAvatarInitials'),
      headerName: document.getElementById('profHeaderName'),
      headerEmail: document.getElementById('profHeaderEmail'),
      memberSince: document.getElementById('profMemberSince'),
      verifiedBadge: document.getElementById('profVerifiedBadge'),
      planBadge: document.getElementById('profPlanBadge'),
      // Edit Toggle & Actions
      editBtn: document.getElementById('profEditToggleBtn'),
      editBtnText: document.getElementById('profEditBtnText'),
      saveBtn: document.getElementById('profSaveBtn'),
      cancelBtn: document.getElementById('profCancelBtn'),
      actionBar: document.getElementById('profActionBar'),
      // Personal Info Inputs & Displays
      fullNameInput: document.getElementById('profFullNameInput'),
      fullNameView: document.getElementById('profFullNameView'),
      emailInput: document.getElementById('profEmailInput'),
      emailView: document.getElementById('profEmailView'),
      phoneInput: document.getElementById('profPhoneInput'),
      phoneView: document.getElementById('profPhoneView'),
      countryInput: document.getElementById('profCountryInput'),
      countryView: document.getElementById('profCountryView'),
      timezoneInput: document.getElementById('profTimezoneInput'),
      timezoneView: document.getElementById('profTimezoneView'),
      avatarUrlInput: document.getElementById('profAvatarUrlInput'),
      avatarUrlField: document.getElementById('profAvatarUrlField'),
      avatarChangeBtn: document.getElementById('profAvatarChangeBtn'),
      // Avatar Upload Modal & Input Elements
      avatarFileInput: document.getElementById('profAvatarFileInput'),
      avatarModal: document.getElementById('profAvatarModal'),
      avatarModalCloseBtn: document.getElementById('profAvatarModalCloseBtn'),
      avatarModalCancelBtn: document.getElementById('profModalCancelBtn'),
      avatarModalConfirmBtn: document.getElementById('profModalConfirmBtn'),
      avatarModalConfirmText: document.getElementById('profModalConfirmText'),
      avatarModalChangeFileBtn: document.getElementById('profModalChangeFileBtn'),
      avatarModalRemovePhotoBtn: document.getElementById('profModalRemovePhotoBtn'),
      modalPreviewBox: document.getElementById('profModalPreviewBox'),
      modalPreviewImg: document.getElementById('profModalPreviewImg'),
      modalFallback: document.getElementById('profModalFallback'),
      modalFileInfo: document.getElementById('profModalFileInfo'),
      modalFileName: document.getElementById('profModalFileName'),
      modalFileSize: document.getElementById('profModalFileSize'),
      modalError: document.getElementById('profModalError'),
      modalErrorText: document.getElementById('profModalErrorText'),
      uploadSpinner: document.getElementById('profUploadSpinner'),
      // Account Information Elements
      accAccessPill: document.getElementById('profAccAccessPill'),
      accPlanName: document.getElementById('profAccPlanName'),
      accEmailVerifiedBadge: document.getElementById('profAccEmailVerifiedBadge'),
      accMemberSince: document.getElementById('profAccMemberSince'),
      accUserId: document.getElementById('profAccUserId'),
      accStatusBadge: document.getElementById('profAccStatusBadge'),
      // Account & Security in Profile
      secVerifiedBadge: document.getElementById('profSecVerifiedBadge'),
      secAuthMethod: document.getElementById('profSecAuthMethod'),
      secEmail: document.getElementById('profSecEmail'),
      sec2FABadge: document.getElementById('prof2FABadge'),
      sec2FAText: document.getElementById('prof2FAText'),
      sec2FAActionBtn: document.getElementById('prof2FAActionBtn'),
      secCurrentDevice: document.getElementById('profSecCurrentDevice')
    };
  }

  function getProfileApiUrl(path) {
    const cleanPath = path.startsWith('/') ? path : '/' + path;
    const origin = typeof window !== 'undefined' && window.location ? window.location.origin : '';
    if (origin && origin.startsWith('http') && !origin.includes(':5500') && !origin.includes(':8080') && !origin.includes(':5173')) {
      return cleanPath;
    }
    return 'http://localhost:3000' + cleanPath;
  }
  window.getProfileApiUrl = getProfileApiUrl;

  // ── Load Profile Data from Backend Database / Supabase / Auth ──────────
  async function loadUserProfile() {
    profileState.loading = true;
    
    try {
      // 0. Wait for Supabase authentication initialization
      if (window.RiskLoopAuth && typeof window.RiskLoopAuth.whenReady === 'function') {
        await window.RiskLoopAuth.whenReady();
      }

      // 1. Get current user identity
      let currentUser = null;
      if (window.RiskLoopAuth && typeof window.RiskLoopAuth.getUser === 'function') {
        currentUser = window.RiskLoopAuth.getUser();
      }
      if (!currentUser && window.RiskLoopAuth && typeof window.RiskLoopAuth.getCurrentUser === 'function') {
        currentUser = await window.RiskLoopAuth.getCurrentUser();
      }

      if (!currentUser) {
        try {
          const raw = localStorage.getItem('riskloop_current_user');
          if (raw) currentUser = JSON.parse(raw);
        } catch (e) {
          console.warn('[Profile] Local user parse warning:', e);
        }
      }

      const userId = currentUser?.id || localStorage.getItem('riskloop_user_id') || 'trader_session';

      // 2. Check Supabase profiles table directly if live client exists
      let sbProfile = null;
      if (window.supabaseClient && currentUser && currentUser.id) {
        try {
          console.log('[Profile Fetch] Querying Supabase profiles table for user ID:', currentUser.id);
          const { data: profileRow, error: pErr } = await window.supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .maybeSingle();

          if (pErr) {
            console.error('[Profile Fetch Error] Supabase profiles select error:', pErr);
          } else if (profileRow) {
            console.log('[Profile Fetch Success] Retrieved profile record from Supabase:', profileRow);
            sbProfile = profileRow;
          }

          const { data: settingsRow } = await window.supabaseClient
            .from('user_settings')
            .select('*')
            .eq('user_id', currentUser.id)
            .maybeSingle();

          if (settingsRow) {
            if (settingsRow.phone) profileState.profileData.phone = settingsRow.phone;
            if (settingsRow.country) profileState.profileData.country = settingsRow.country;
            if (settingsRow.timezone) profileState.profileData.timezone = settingsRow.timezone;
          }
        } catch (sbErr) {
          console.error('[Profile Fetch Error] Exception querying Supabase:', sbErr);
        }
      }

      // 3. Fetch from Backend Database GET /api/profile
      let backendProfile = null;
      try {
        const authHeaders = await getProfileAuthHeaders();
        const apiUrl = getProfileApiUrl('/api/profile');
        const resp = await fetch(apiUrl, {
          method: 'GET',
          headers: authHeaders
        });
        if (resp.ok) {
          const resJson = await resp.json();
          if (resJson.success && resJson.data) {
            backendProfile = resJson.data;
          }
        }
      } catch (apiErr) {
        console.warn('[Profile] GET /api/profile fetch warning:', apiErr);
      }

      // 4. Resolve persistent values (Supabase Cloudinary secure_url takes top precedence)
      const resolvedAvatar = (
        sbProfile?.avatar_url ||
        backendProfile?.avatar_url ||
        backendProfile?.avatarUrl ||
        currentUser?.avatar_url ||
        currentUser?.avatarUrl ||
        ''
      );

      const resolvedFullName = (
        sbProfile?.full_name ||
        backendProfile?.fullName ||
        backendProfile?.full_name ||
        currentUser?.fullName ||
        (currentUser?.email ? currentUser.email.split('@')[0] : '') ||
        'Trader'
      );

      const resolvedEmail = (
        sbProfile?.email ||
        backendProfile?.email ||
        currentUser?.email ||
        'trader@riskloop.io'
      );

      const resolvedPublicId = (
        sbProfile?.avatar_public_id ||
        backendProfile?.avatarPublicId ||
        backendProfile?.avatar_public_id ||
        null
      );

      profileState.profileData.fullName = resolvedFullName;
      profileState.profileData.email = resolvedEmail;
      profileState.profileData.avatarUrl = resolvedAvatar;
      profileState.profileData.avatarPublicId = resolvedPublicId;
      if (currentUser?.id) {
        profileState.profileData.userId = currentUser.id;
      }
      if (backendProfile?.createdAt || sbProfile?.created_at || currentUser?.createdAt || currentUser?.created_at) {
        profileState.profileData.memberSince = formatMemberDate(
          backendProfile?.createdAt || sbProfile?.created_at || currentUser?.createdAt || currentUser?.created_at
        );
      }

      // 5. Update local cache with persistent avatar so header & menu stay in sync
      const updatedUserObj = {
        ...(currentUser || {}),
        id: userId,
        fullName: resolvedFullName,
        email: resolvedEmail,
        avatarUrl: resolvedAvatar,
        avatar_url: resolvedAvatar,
        avatarPublicId: resolvedPublicId
      };
      profileState.user = updatedUserObj;

      try {
        localStorage.setItem('riskloop_current_user', JSON.stringify(updatedUserObj));
      } catch (_) {}

      // Synchronize all UI avatars across header, dashboard, and profile
      syncAppHeaderUser(updatedUserObj);

    } catch (err) {
      console.error('[Profile] Error loading profile:', err);
    } finally {
      profileState.loading = false;
      renderProfileView();
    }
  }

  // ── Render Profile UI ──────────────────────────────────────────────────
  function renderProfileView() {
    const els = getElements();
    const data = profileState.profileData;

    // 1. Header Information
    if (els.headerName) els.headerName.textContent = data.fullName || 'Trader';
    if (els.headerEmail) els.headerEmail.textContent = data.email || 'trader@riskloop.io';
    if (els.memberSince) els.memberSince.textContent = `Member since ${data.memberSince || 'August 2026'}`;
    
    // Avatar
    if (els.avatarDisplay) {
      const hasImg = data.avatarUrl && (data.avatarUrl.trim().startsWith('http') || data.avatarUrl.trim().startsWith('data:image/'));
      if (hasImg) {
        els.avatarDisplay.innerHTML = `<img src="${escapeHtml(data.avatarUrl)}" alt="${escapeHtml(data.fullName)}" class="prof-avatar-img" onerror="this.parentElement.innerHTML='<span class=\\'prof-avatar-fallback\\'>${escapeHtml(getInitials(data.fullName))}</span>'" />`;
      } else {
        els.avatarDisplay.innerHTML = `<span class="prof-avatar-fallback">${escapeHtml(getInitials(data.fullName))}</span>`;
      }
    }

    // Badges
    if (els.planBadge) {
      els.planBadge.textContent = data.planBadge || 'PRO';
    }
    if (els.verifiedBadge) {
      els.verifiedBadge.hidden = !data.isVerified;
    }

    // 2. Personal Information Fields
    if (els.fullNameView) els.fullNameView.textContent = data.fullName || '—';
    if (els.fullNameInput) els.fullNameInput.value = data.fullName || '';

    if (els.emailView) els.emailView.textContent = data.email || '—';
    if (els.emailInput) els.emailInput.value = data.email || '';

    if (els.phoneView) els.phoneView.textContent = data.phone || '—';
    if (els.phoneInput) els.phoneInput.value = data.phone || '';

    if (els.countryView) els.countryView.textContent = data.country || 'India';
    if (els.countryInput) els.countryInput.value = data.country || 'India';

    if (els.timezoneView) els.timezoneView.textContent = data.timezone || 'Asia/Kolkata (IST +5:30)';
    if (els.timezoneInput) els.timezoneInput.value = data.timezone || 'Asia/Kolkata';

    if (els.avatarUrlInput) els.avatarUrlInput.value = data.avatarUrl || '';

    // 3. Account Information
    if (els.accAccessPill) els.accAccessPill.textContent = 'Full Access';
    if (els.accPlanName) els.accPlanName.textContent = data.plan || 'Institutional Pro Terminal';
    if (els.accMemberSince) els.accMemberSince.textContent = data.memberSince || 'August 2026';
    if (els.accUserId) els.accUserId.textContent = data.userId || 'usr_89f41b2c7e09';

    // 4. Account & Security Section in My Profile
    const isGoogle = (profileState.user?.app_metadata?.provider === 'google' || profileState.user?.provider === 'google');
    if (els.secAuthMethod) {
      els.secAuthMethod.textContent = isGoogle ? 'Google OAuth Login' : 'Email & Password Login';
    }
    if (els.secEmail) {
      els.secEmail.textContent = data.email || 'trader@riskloop.io';
    }
    if (els.secVerifiedBadge) {
      els.secVerifiedBadge.textContent = data.isVerified ? 'Verified' : 'Pending';
      els.secVerifiedBadge.className = data.isVerified ? 'prof-sec-status-pill prof-sec-status-verified' : 'prof-sec-status-pill';
    }

    const is2FA = localStorage.getItem('riskloop_2fa_enabled') === 'true';
    if (els.sec2FABadge) {
      els.sec2FABadge.textContent = is2FA ? '2FA Enabled' : '2FA Disabled';
      els.sec2FABadge.className = is2FA ? 'prof-sec-status-pill prof-sec-status-verified' : 'prof-sec-status-pill';
    }
    if (els.sec2FAText) {
      els.sec2FAText.textContent = is2FA ? 'TOTP Authenticator Protection' : 'Authenticator Protection (Disabled)';
    }
    if (els.sec2FAActionBtn) {
      els.sec2FAActionBtn.textContent = is2FA ? 'Disable 2FA' : 'Enable 2FA';
    }
    if (els.secCurrentDevice) {
      els.secCurrentDevice.textContent = getBrowserAndOsInfo();
    }

    // Apply view vs edit visibility
    applyEditModeUI(profileState.isEditing);
  }

  function getInitials(name) {
    if (!name) return 'TR';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function formatMemberDate(dateStr) {
    if (!dateStr) return 'August 2026';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'August 2026';
      return d.toLocaleDateString([], { month: 'long', year: 'numeric' });
    } catch (e) {
      return 'August 2026';
    }
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function applyEditModeUI(isEditing) {
    const els = getElements();
    const page = els.page;
    if (!page) return;

    page.classList.toggle('prof-editing-mode', isEditing);

    // Toggle input field displays
    const viewFields = page.querySelectorAll('.prof-field-view');
    const inputFields = page.querySelectorAll('.prof-field-input');

    viewFields.forEach(el => el.hidden = isEditing);
    inputFields.forEach(el => el.hidden = !isEditing);

    if (els.avatarUrlField) {
      els.avatarUrlField.hidden = !isEditing;
    }

    if (els.actionBar) {
      els.actionBar.hidden = !isEditing;
    }

    if (els.editBtnText) {
      els.editBtnText.textContent = isEditing ? 'Cancel Edit' : 'Edit Profile';
    }
  }

  // ── Toggle Edit Mode ───────────────────────────────────────────────────
  function toggleEditMode(forceState) {
    profileState.isEditing = typeof forceState === 'boolean' ? forceState : !profileState.isEditing;
    renderProfileView();
  }

  // ── File Validation ───────────────────────────────────────────────────
  function validateImageFile(file) {
    if (!file) {
      return { valid: false, message: 'No file selected.' };
    }

    const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const validExtensions = ['jpg', 'jpeg', 'png', 'webp'];

    const ext = (file.name || '').split('.').pop().toLowerCase();
    const mime = (file.type || '').toLowerCase();

    const isValidType = validMimeTypes.includes(mime) || validExtensions.includes(ext);
    if (!isValidType) {
      return {
        valid: false,
        message: 'Unsupported format. Please select a JPG, JPEG, PNG, or WebP image.'
      };
    }

    // Max 5MB limit
    const maxSizeBytes = 5 * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      return {
        valid: false,
        message: 'Image size exceeds 5MB limit. Please choose a smaller photo.'
      };
    }

    return { valid: true };
  }

  // ── Photo Upload & Preview Modal Flow ──────────────────────────────────
  function openAvatarModal() {
    const els = getElements();
    if (!els.avatarModal) return;

    els.avatarModal.hidden = false;
    document.body.style.overflow = 'hidden';

    // Clear error
    if (els.modalError) els.modalError.hidden = true;
    if (els.uploadSpinner) els.uploadSpinner.hidden = true;

    // Reset buttons state
    if (els.avatarModalConfirmBtn) {
      els.avatarModalConfirmBtn.disabled = false;
    }
    if (els.avatarModalCancelBtn) {
      els.avatarModalCancelBtn.disabled = false;
    }
    if (els.avatarModalConfirmText) {
      els.avatarModalConfirmText.textContent = 'Save & Apply Photo';
    }
  }

  function closeAvatarModal() {
    if (avatarUploadState.isUploading) return; // Block during active upload

    const els = getElements();
    if (els.avatarModal) {
      els.avatarModal.hidden = true;
    }
    document.body.style.overflow = '';

    // Reset pending state
    avatarUploadState.pendingAvatarUrl = null;
    avatarUploadState.pendingFile = null;
    avatarUploadState.pendingIsRemove = false;
    avatarUploadState.isUploading = false;

    if (els.avatarFileInput) {
      els.avatarFileInput.value = '';
    }
  }

  function handleFileSelected(file) {
    const els = getElements();
    const validation = validateImageFile(file);

    if (!validation.valid) {
      if (els.modalErrorText) els.modalErrorText.textContent = validation.message;
      if (els.modalError) els.modalError.hidden = false;
      showToast(validation.message, true);
      openAvatarModal();
      return;
    }

    if (els.modalError) els.modalError.hidden = true;

    const reader = new FileReader();
    reader.onload = function (e) {
      const dataUrl = e.target.result;
      avatarUploadState.pendingAvatarUrl = dataUrl;
      avatarUploadState.pendingFile = file;
      avatarUploadState.pendingIsRemove = false;

      // Update Preview Elements in Modal
      if (els.modalPreviewImg) {
        els.modalPreviewImg.src = dataUrl;
        els.modalPreviewImg.hidden = false;
      }
      if (els.modalFallback) {
        els.modalFallback.hidden = true;
      }
      if (els.modalFileName) {
        els.modalFileName.textContent = file.name;
      }
      if (els.modalFileSize) {
        els.modalFileSize.textContent = formatBytes(file.size);
      }

      openAvatarModal();
    };

    reader.onerror = function () {
      showToast('Could not read image file. Please try another.', true);
    };

    reader.readAsDataURL(file);
  }

  function handleRemovePhoto() {
    const els = getElements();
    avatarUploadState.pendingIsRemove = true;
    avatarUploadState.pendingAvatarUrl = '';
    avatarUploadState.pendingFile = null;

    if (els.modalPreviewImg) {
      els.modalPreviewImg.hidden = true;
      els.modalPreviewImg.src = '';
    }
    if (els.modalFallback) {
      els.modalFallback.hidden = false;
      els.modalFallback.textContent = getInitials(profileState.profileData.fullName);
    }
    if (els.modalFileName) {
      els.modalFileName.textContent = 'Photo will be removed';
    }
    if (els.modalFileSize) {
      els.modalFileSize.textContent = 'Default Initials';
    }
    if (els.modalError) {
      els.modalError.hidden = true;
    }
  }

  // ── Auth Token Helper for Profile API ───────────────────────────────────
  async function getProfileAuthHeaders() {
    const headers = {};
    try {
      if (window.supabaseClient && typeof window.supabaseClient.auth?.getSession === 'function') {
        const { data: { session } } = await window.supabaseClient.auth.getSession();
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
          headers['x-supabase-token'] = session.access_token;
        }
      }
    } catch (_) {}

    const localUser = profileState.user || (typeof window.RiskLoopAuth?.getUser === 'function' ? window.RiskLoopAuth.getUser() : null);
    if (localUser?.id) {
      headers['x-user-id'] = localUser.id;
    }
    if (localUser?.email) {
      headers['x-user-email'] = localUser.email;
    }

    return headers;
  }

  async function handleConfirmAvatar() {
    if (avatarUploadState.isUploading) return;

    const els = getElements();
    avatarUploadState.isUploading = true;

    // Show Loading State
    if (els.uploadSpinner) {
      els.uploadSpinner.hidden = false;
    }
    if (els.avatarModalConfirmBtn) {
      els.avatarModalConfirmBtn.disabled = true;
    }
    if (els.avatarModalCancelBtn) {
      els.avatarModalCancelBtn.disabled = true;
    }
    if (els.avatarModalChangeFileBtn) {
      els.avatarModalChangeFileBtn.disabled = true;
    }
    if (els.avatarModalRemovePhotoBtn) {
      els.avatarModalRemovePhotoBtn.disabled = true;
    }
    if (els.avatarModalConfirmText) {
      els.avatarModalConfirmText.textContent = 'Uploading...';
    }

    try {
      const authHeaders = await getProfileAuthHeaders();
      let newAvatar = '';
      let newPublicId = null;

      if (avatarUploadState.pendingIsRemove) {
        // DELETE /api/profile/avatar — removes active Cloudinary asset
        try {
          console.log('[Profile Avatar] Deleting active avatar asset...');
          const delResp = await fetch(getProfileApiUrl('/api/profile/avatar'), {
            method: 'DELETE',
            headers: authHeaders
          });
          const delJson = await delResp.json();
          console.log('[Profile Avatar Delete Response]', delJson);
          if (!delJson.success) {
            console.warn('[Profile] Avatar delete warning:', delJson.error);
          }
        } catch (delErr) {
          console.warn('[Profile] Avatar delete request error:', delErr.message);
        }
        newAvatar = '';
        newPublicId = null;
      } else if (avatarUploadState.pendingFile) {
        // POST /api/profile/avatar — stream upload to Cloudinary via FormData
        const formData = new FormData();
        formData.append('avatar', avatarUploadState.pendingFile);

        console.log('[Profile Avatar Upload] Initiating Cloudinary upload...');
        const resp = await fetch(getProfileApiUrl('/api/profile/avatar'), {
          method: 'POST',
          headers: authHeaders,
          body: formData
        });

        const resJson = await resp.json();
        console.log('[Profile Avatar Cloudinary Response]', resJson);

        if (!resJson.success) {
          throw new Error(resJson.error || 'Failed to upload photo to Cloudinary.');
        }

        newAvatar = resJson.data?.avatar_url || resJson.data?.avatarUrl || '';
        newPublicId = resJson.data?.public_id || resJson.data?.avatarPublicId || null;
      } else {
        newAvatar = avatarUploadState.pendingAvatarUrl || '';
      }

      // 1. Update local profile state
      profileState.profileData.avatarUrl = newAvatar;
      profileState.profileData.avatarPublicId = newPublicId;

      if (els.avatarUrlInput) {
        els.avatarUrlInput.value = newAvatar;
      }

      // 2. Permanently upsert Cloudinary secure_url into Supabase profiles table
      if (window.supabaseClient && profileState.user && profileState.user.id) {
        try {
          const updatePayload = {
            id: profileState.user.id,
            email: profileState.user.email || profileState.profileData.email,
            full_name: profileState.profileData.fullName || profileState.user.fullName,
            avatar_url: newAvatar || null,
            avatar_public_id: newPublicId || null,
            updated_at: new Date().toISOString()
          };
          console.log('[Profile Avatar Supabase Upsert Payload]', updatePayload);
          const { data: sbData, error: sbErr } = await window.supabaseClient
            .from('profiles')
            .upsert(updatePayload)
            .select();

          if (sbErr) {
            console.error('[Profile Avatar Supabase Upsert Error]', sbErr);
          } else {
            console.log('[Profile Avatar Supabase Upsert Success]', sbData);
          }

          // Also update Supabase auth user_metadata
          try {
            await window.supabaseClient.auth.updateUser({
              data: {
                avatar_url: newAvatar || null,
                picture: newAvatar || null
              }
            });
          } catch (_) {}
        } catch (sbErr) {
          console.error('[Profile Avatar Supabase Upsert Exception]', sbErr);
        }
      }

      // 3. Update localStorage & RiskLoopAuth
      const updatedUserObj = {
        ...(profileState.user || {}),
        fullName: profileState.profileData.fullName,
        avatarUrl: newAvatar,
        avatar_url: newAvatar,
        avatarPublicId: newPublicId || (avatarUploadState.pendingIsRemove ? null : profileState.user?.avatarPublicId)
      };
      profileState.user = updatedUserObj;

      try {
        localStorage.setItem('riskloop_current_user', JSON.stringify(updatedUserObj));
      } catch (_) {}

      // 4. Synchronize all UI avatars across header, dashboard, and profile
      syncAppHeaderUser(updatedUserObj);
      renderProfileView();

      // Show success toast
      showToast(newAvatar ? 'Profile photo updated successfully!' : 'Profile photo removed.', false);

    } catch (err) {
      console.error('[Profile] Avatar update error:', err);
      showToast('Failed to save profile photo: ' + (err.message || 'Please try again'), true);
    } finally {
      avatarUploadState.isUploading = false;
      if (els.uploadSpinner) els.uploadSpinner.hidden = true;
      if (els.avatarModalConfirmBtn) els.avatarModalConfirmBtn.disabled = false;
      if (els.avatarModalCancelBtn) els.avatarModalCancelBtn.disabled = false;
      if (els.avatarModalChangeFileBtn) els.avatarModalChangeFileBtn.disabled = false;
      if (els.avatarModalRemovePhotoBtn) els.avatarModalRemovePhotoBtn.disabled = false;
      if (els.avatarModalConfirmText) els.avatarModalConfirmText.textContent = 'Save & Apply Photo';
      
      closeAvatarModal();
    }
  }

  // ── Save Profile to Supabase & Local Cache ──────────────────────────────
  async function saveUserProfile() {
    const els = getElements();
    const data = profileState.profileData;

    // Collect updated inputs
    const newFullName = (els.fullNameInput?.value || data.fullName).trim();
    const newPhone = (els.phoneInput?.value || '').trim();
    const newCountry = (els.countryInput?.value || 'India').trim();
    const newTimezone = (els.timezoneInput?.value || 'Asia/Kolkata').trim();
    const newAvatarUrl = (els.avatarUrlInput?.value || data.avatarUrl || '').trim();

    // Update local state
    data.fullName = newFullName;
    data.phone = newPhone;
    data.country = newCountry;
    data.timezone = newTimezone;
    data.avatarUrl = newAvatarUrl;

    // Disable save button while saving
    if (els.saveBtn) {
      els.saveBtn.disabled = true;
      els.saveBtn.innerHTML = `
        <svg class="prof-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>
        <span>Saving...</span>
      `;
    }

    try {
      // 1. Update Supabase Database if client is live
      if (window.supabaseClient && profileState.user && profileState.user.id) {
        const uid = profileState.user.id;

        // Upsert profiles table
        const profilePayload = {
          id: uid,
          email: profileState.user.email || data.email,
          full_name: newFullName,
          avatar_url: newAvatarUrl || null,
          avatar_public_id: data.avatarPublicId || null,
          updated_at: new Date().toISOString()
        };
        console.log('[Profile Save Supabase Upsert Payload]', profilePayload);
        const { error: sbErr } = await window.supabaseClient
          .from('profiles')
          .upsert(profilePayload);

        if (sbErr) {
          console.error('[Profile Save Supabase Upsert Error]', sbErr);
        }

        // Update user_settings table
        await window.supabaseClient
          .from('user_settings')
          .upsert({
            user_id: uid,
            phone: newPhone,
            country: newCountry,
            timezone: newTimezone,
            updated_at: new Date().toISOString()
          });

        // Update auth user metadata
        try {
          await window.supabaseClient.auth.updateUser({
            data: {
              full_name: newFullName,
              avatar_url: newAvatarUrl || null
            }
          });
        } catch (_) {}
      }

      // 2. Update RiskLoopAuth state & localStorage
      const updatedUserObj = {
        ...(profileState.user || {}),
        fullName: newFullName,
        avatarUrl: newAvatarUrl,
        avatar_url: newAvatarUrl,
        phone: newPhone,
        country: newCountry,
        timezone: newTimezone
      };
      profileState.user = updatedUserObj;

      try {
        localStorage.setItem('riskloop_current_user', JSON.stringify(updatedUserObj));
      } catch (e) {}

      // Synchronize header display name & avatar
      syncAppHeaderUser(updatedUserObj);

      // Show success toast
      showToast('Profile updated successfully!', false);

      // Switch back to view mode
      profileState.isEditing = false;
      renderProfileView();

    } catch (err) {
      console.error('[Profile] Error saving profile:', err);
      showToast('Error saving profile: ' + (err.message || 'Please try again'), true);
    } finally {
      if (els.saveBtn) {
        els.saveBtn.disabled = false;
        els.saveBtn.innerHTML = `
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          <span>Save Changes</span>
        `;
      }
    }
  }

  // ── Sync Header User Elements ──────────────────────────────────────────
  function syncAppHeaderUser(user) {
    if (!user) return;
    const headerUserName = document.getElementById('headerUserName');
    const headerUserEmail = document.getElementById('headerUserEmail');
    const menuUserName = document.getElementById('menuUserName');
    const menuUserEmail = document.getElementById('menuUserEmail');
    const dashUserGreetingName = document.getElementById('dashUserGreetingName');
    const headerUserAvatar = document.getElementById('headerUserAvatar');
    const menuUserAvatar = document.getElementById('menuUserAvatar');
    const dashUserAvatar = document.getElementById('dashUserAvatar');
    const secUserAvatar = document.getElementById('secUserAvatar');

    const displayName = user.fullName || user.email?.split('@')[0] || 'Trader';
    if (headerUserName) headerUserName.textContent = displayName;
    if (headerUserEmail) headerUserEmail.textContent = user.email || '';
    if (menuUserName) menuUserName.textContent = displayName;
    if (menuUserEmail) menuUserEmail.textContent = user.email || '';
    if (dashUserGreetingName) dashUserGreetingName.textContent = displayName;

    const hasImg = user.avatarUrl && (user.avatarUrl.trim().startsWith('http') || user.avatarUrl.trim().startsWith('data:image/'));
    const initials = getInitials(displayName);

    if (headerUserAvatar) {
      if (hasImg) {
        headerUserAvatar.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="Avatar" class="header-avatar-img" />`;
      } else {
        headerUserAvatar.textContent = initials;
      }
    }

    if (menuUserAvatar) {
      if (hasImg) {
        menuUserAvatar.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="Avatar" class="header-avatar-img" />`;
      } else {
        menuUserAvatar.textContent = initials;
      }
    }

    if (dashUserAvatar) {
      if (hasImg) {
        dashUserAvatar.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="Avatar" class="dash-avatar-img" />`;
      } else {
        dashUserAvatar.textContent = initials;
      }
    }

    if (secUserAvatar) {
      if (hasImg) {
        secUserAvatar.innerHTML = `<img src="${escapeHtml(user.avatarUrl)}" alt="Avatar" class="dash-avatar-img" />`;
      } else {
        secUserAvatar.textContent = initials;
      }
    }
  }

  function showToast(message, isError = false) {
    if (typeof window.showAuthToast === 'function') {
      window.showAuthToast(message, isError);
      return;
    }

    // Fallback toast
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
  function initProfilePage() {
    const els = getElements();

    if (els.editBtn) {
      els.editBtn.onclick = () => toggleEditMode();
    }

    if (els.cancelBtn) {
      els.cancelBtn.onclick = () => toggleEditMode(false);
    }

    if (els.saveBtn) {
      els.saveBtn.onclick = () => saveUserProfile();
    }

    // Camera Icon -> Opens Native File Picker Directly
    if (els.avatarChangeBtn) {
      els.avatarChangeBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (els.avatarFileInput) {
          els.avatarFileInput.value = '';
          els.avatarFileInput.click();
        }
      };
    }

    // File Picker Input Change
    if (els.avatarFileInput) {
      els.avatarFileInput.onchange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
          handleFileSelected(e.target.files[0]);
        }
      };
    }

    // Modal Close / Cancel / Confirm buttons
    if (els.avatarModalCloseBtn) {
      els.avatarModalCloseBtn.onclick = () => closeAvatarModal();
    }

    if (els.avatarModalCancelBtn) {
      els.avatarModalCancelBtn.onclick = () => closeAvatarModal();
    }

    if (els.avatarModalChangeFileBtn) {
      els.avatarModalChangeFileBtn.onclick = () => {
        if (els.avatarFileInput) {
          els.avatarFileInput.value = '';
          els.avatarFileInput.click();
        }
      };
    }

    if (els.avatarModalRemovePhotoBtn) {
      els.avatarModalRemovePhotoBtn.onclick = () => handleRemovePhoto();
    }

    if (els.avatarModalConfirmBtn) {
      els.avatarModalConfirmBtn.onclick = () => handleConfirmAvatar();
    }

    // Close on overlay backdrop click
    if (els.avatarModal) {
      els.avatarModal.onclick = (e) => {
        if (e.target === els.avatarModal && !avatarUploadState.isUploading) {
          closeAvatarModal();
        }
      };
    }

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && els.avatarModal && !els.avatarModal.hidden && !avatarUploadState.isUploading) {
        closeAvatarModal();
      }
    });

    // 2FA Toggle Action in Profile
    if (els.sec2FAActionBtn) {
      els.sec2FAActionBtn.onclick = () => {
        const is2FA = localStorage.getItem('riskloop_2fa_enabled') === 'true';
        const newVal = !is2FA;
        localStorage.setItem('riskloop_2fa_enabled', newVal ? 'true' : 'false');
        showToast(newVal ? 'Two-Factor Authentication enabled! Your terminal is protected.' : 'Two-Factor Authentication disabled.', false);
        renderProfileView();
      };
    }

    loadUserProfile();
  }

  function getBrowserAndOsInfo() {
    const ua = navigator.userAgent || '';
    let browser = 'Chrome';
    if (ua.includes('Firefox')) browser = 'Firefox';
    else if (ua.includes('Edg')) browser = 'Microsoft Edge';
    else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';

    let os = 'Windows';
    if (ua.includes('Macintosh') || ua.includes('Mac OS')) os = 'macOS';
    else if (ua.includes('Linux')) os = 'Linux';
    else if (ua.includes('Android')) os = 'Android';
    else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';

    return `${browser} on ${os}`;
  }

  // Expose global methods
  window.initProfilePage = initProfilePage;
  window.loadUserProfile = loadUserProfile;
  window.saveUserProfile = saveUserProfile;
  window.toggleProfileEditMode = toggleEditMode;
  window.handleProfileAvatarFile = handleFileSelected;

  window.addEventListener('riskloop_auth_ready', (e) => {
    if (e.detail?.isAuthenticated) {
      loadUserProfile();
    }
  });

  window.addEventListener('riskloop_auth_state_changed', (e) => {
    if (e.detail?.isAuthenticated) {
      loadUserProfile();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      loadUserProfile();
      if (window.location.hash === '#profile') {
        initProfilePage();
      }
    });
  } else {
    loadUserProfile();
    if (window.location.hash === '#profile') {
      initProfilePage();
    }
  }

}(window));
