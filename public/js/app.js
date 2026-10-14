/**
 * TIA ENTERPRISE PORTAL - APPLICATION ENGINE
 * Tirupati Intellect Authority - Empowering Tirupati with AI
 * Official GSTIN: 37EYLPM8018M1ZN
 * Design Language: Blue + Pure White + Green + Black + Slate Grey
 */

// Application State
const state = {
  currentUser: null,
  employees: [],
  attendance: [],
  courses: [],
  students: { all: [], ongoing: [], completed: [] },
  payslips: [],
  activeChannel: 'general',
  messages: [],
  replyingTo: null,
  ws: null,
  pendingFile: null,
  pendingVoiceBlob: null,
  mediaRecorder: null,
  audioChunks: [],
  isRecordingVoice: false,
  isDictating: false,
  speechRecognition: null,
  studentSubTab: 'ongoing',
  shiftTimerInterval: null,
  ide: {
    files: [],
    openTabs: [],
    activeTab: null,
    activeSidebar: 'explorer',
    activeDockTab: 'terminal',
    isLivePreview: false,
    cmdHistory: [],
    cmdHistoryIndex: -1
  }
};

// ===================================================================
// INITIALIZATION & APP MODE DETECTION
// ===================================================================
function detectAppMode() {
  const isStandalone = (window.matchMedia && (
                          window.matchMedia('(display-mode: standalone)').matches ||
                          window.matchMedia('(display-mode: fullscreen)').matches ||
                          window.matchMedia('(display-mode: minimal-ui)').matches
                        )) ||
                       window.navigator.standalone === true ||
                       document.referrer.includes('android-app://') ||
                       window.location.search.includes('source=pwa') ||
                       window.location.search.includes('mode=app') ||
                       (typeof window.Capacitor !== 'undefined' && window.Capacitor !== null);

  if (isStandalone) {
    document.body.classList.add('in-app-mode');
    document.documentElement.classList.add('in-app-mode');
    const dlBtns = document.querySelectorAll('.download-app-btn, #btnToolbarDownloadApp, #btnHeaderDownloadApp, #pwaInstallBanner, .pwa-install-banner');
    dlBtns.forEach(el => {
      if (el) el.style.setProperty('display', 'none', 'important');
    });
  } else {
    document.body.classList.remove('in-app-mode');
    document.documentElement.classList.remove('in-app-mode');
    try { localStorage.removeItem('tia_app_installed'); } catch (e) {}
  }
  return isStandalone;
}

// Cooperative non-blocking scheduling for instant sub-second FCP and zero Long Tasks
const scheduleTask = (window.requestIdleCallback) ? window.requestIdleCallback : ((fn) => setTimeout(fn, 16));

document.addEventListener('DOMContentLoaded', () => {
  detectAppMode();
  initClock();
  restoreSession();
  initIdeStudio();

  scheduleTask(async () => {
    try {
      await loadEmployees();
      renderChatStaffList();
      restoreSession();
    } catch (e) {
      console.warn('Initial staff sync notice:', e);
    }
  });

  scheduleTask(async () => {
    try {
      initWebSocket();
      initSpeechRecognition();
      setupPresenceTracking();
      initSandbox();
      await loadAttendance();
      setTimeout(async () => {
        try {
          await loadCourses();
          await loadStudents();
        } catch (e) { console.warn(e); }
      }, 120);
      setTimeout(async () => {
        try {
          await loadPayslips();
          await selectChannel(state.activeChannel);
        } catch (e) { console.warn(e); }
      }, 250);
    } catch (e) {
      console.warn('Deferred background services notice:', e);
    }
  });
});

// Real-Time Clock in India Standard Time (IST)
function initClock() {
  const clockEl = document.getElementById('headerClock');
  if (!clockEl) return;
  function update() {
    const now = new Date();
    clockEl.textContent = now.toLocaleDateString('en-IN', {
      timeZone: 'Asia/Kolkata',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }) + ' • ' + now.toLocaleTimeString('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    }) + ' IST';
  }
  update();
  setInterval(update, 1000);
}

// Navigation Tabs
function switchTab(tabId) {
  document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));

  const targetPane = document.getElementById(`tab-${tabId}`);
  if (targetPane) targetPane.classList.add('active');

  const buttons = document.querySelectorAll('.nav-tab-btn');
  buttons.forEach(btn => {
    if (btn.getAttribute('onclick') && btn.getAttribute('onclick').includes(`switchTab('${tabId}')`)) {
      btn.classList.add('active');
    }
  });

  // Sync mobile bottom navigation active state
  document.querySelectorAll('.mobile-nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.getAttribute('onclick') && item.getAttribute('onclick').includes(`'${tabId}'`)) {
      item.classList.add('active');
    }
  });
}

// Courses Sub-View Switcher (Catalog vs Dealers/Clients)
function switchCourseSubView(view) {
  const btnCatalog = document.getElementById('btnCourseSubCatalog');
  const btnDealers = document.getElementById('btnCourseSubDealers');
  const viewCatalog = document.getElementById('courseCatalogView');
  const viewDealers = document.getElementById('courseDealersView');

  if (view === 'catalog') {
    btnCatalog.classList.add('active');
    btnDealers.classList.remove('active');
    viewCatalog.style.display = 'block';
    viewDealers.style.display = 'none';
  } else {
    btnCatalog.classList.remove('active');
    btnDealers.classList.add('active');
    viewCatalog.style.display = 'none';
    viewDealers.style.display = 'block';
  }
}

// ===================================================================
// AUTHENTICATION & LOGIN (Username / Email / Mobile + Password)
// ===================================================================
function openLoginModal() {
  document.getElementById('loginErrorAlert').style.display = 'none';
  openModal('modalRoleLogin');
}

function quickFillRoleLogin(roleKey, btnEl) {
  document.querySelectorAll('#modalRoleLogin .btn-role-select').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const customBox = document.getElementById('customStaffFieldsContainer');
  if (customBox) customBox.style.display = 'none';

  const btnSubmit = document.getElementById('btnSubmitRoleLogin');
  if (btnSubmit) btnSubmit.innerHTML = '<i class="ph ph-sign-in"></i> Sign In to Portal';

  const identifierInput = document.getElementById('loginIdentifier');
  const passwordInput = document.getElementById('loginPassword');
  const displayNameInput = document.getElementById('loginDisplayName');

  const roleCreds = {
    ceo: { ident: 'ceo', pwd: 'tia123', name: 'M. Bhargav Rayudu' },
    cmo: { ident: 'cmo', pwd: 'tia123', name: 'Chief Marketing Officer' },
    pm: { ident: 'pm', pwd: 'tia123', name: 'Project Manager' },
    techmgr: { ident: 'techmgr', pwd: 'tia123', name: 'Technical Manager' },
    pa: { ident: 'pa', pwd: 'tia123', name: 'Personal Assistant' },
    officemgr: { ident: 'officemgr', pwd: 'tia123', name: 'Office Manager' }
  };

  const selected = roleCreds[roleKey] || roleCreds.ceo;
  if (identifierInput) identifierInput.value = selected.ident;
  if (passwordInput) passwordInput.value = selected.pwd;
  if (displayNameInput) displayNameInput.value = selected.name;
}

function activateCustomStaffRegistration(btnEl) {
  document.querySelectorAll('#modalRoleLogin .btn-role-select').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const customBox = document.getElementById('customStaffFieldsContainer');
  if (customBox) customBox.style.display = 'block';

  const identifierInput = document.getElementById('loginIdentifier');
  const displayNameInput = document.getElementById('loginDisplayName');
  const customRoleInput = document.getElementById('loginCustomRole');
  const customDeptInput = document.getElementById('loginCustomDept');
  const pwdInput = document.getElementById('loginPassword');

  if (identifierInput) identifierInput.value = '';
  if (displayNameInput) displayNameInput.value = '';
  if (customRoleInput) customRoleInput.value = '';
  if (customDeptInput) customDeptInput.value = '';
  // Automatic password for custom staff addition is always tia123!
  if (pwdInput) pwdInput.value = 'tia123';

  const btnSubmit = document.getElementById('btnSubmitRoleLogin');
  if (btnSubmit) btnSubmit.innerHTML = '<i class="ph ph-user-plus"></i> Register & Sign In as Staff';

  if (customRoleInput) customRoleInput.focus();
}

function clearLoginFields(btnEl) {
  activateCustomStaffRegistration(btnEl);
}

async function submitRoleLogin() {
  let identifier = document.getElementById('loginIdentifier').value.trim();
  const password = document.getElementById('loginPassword').value.trim() || 'tia123';
  let displayName = document.getElementById('loginDisplayName').value.trim();
  const customRole = document.getElementById('loginCustomRole')?.value.trim() || '';
  const customDepartment = document.getElementById('loginCustomDept')?.value.trim() || '';
  const isCustom = document.getElementById('btnRoleCustom')?.classList.contains('active') || !!customRole;
  const alertEl = document.getElementById('loginErrorAlert');

  if (isCustom) {
    if (!displayName && customRole) displayName = customRole;
    if (!identifier) {
      identifier = (displayName || customRole || 'staff').toLowerCase().replace(/\s+/g, '_');
      document.getElementById('loginIdentifier').value = identifier;
    }
  }

  if (!identifier) {
    alertEl.textContent = 'Please enter your Username, Email, Mobile Number, or Custom Role details.';
    alertEl.style.display = 'block';
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identifier, password, displayName, isCustom, customRole, customDepartment })
    });
    const result = await res.json();

    if (result.success) {
      state.currentUser = result.user;
      localStorage.setItem('tia_session', JSON.stringify(result.user));
      closeModal('modalRoleLogin');
      await loadEmployees();
      renderChatStaffList();
      updateAuthUI();
      if (result.newlyRegistered) {
        showNotification(`🎉 Welcome to TIA! Registered & signed in as ${result.user.name} (${result.user.role})!`);
      } else {
        showNotification(`Signed in successfully as ${result.user.name || result.user.role}!`);
      }
      sendPresencePing(true);
      selectChannel('general');
    } else {
      alertEl.textContent = result.error || 'Login failed. Please check credentials.';
      alertEl.style.display = 'block';
    }
  } catch (err) {
    console.warn('Login error:', err);
    alertEl.textContent = 'Network or server error during sign in.';
    alertEl.style.display = 'block';
  }
}

async function performLogout() {
  if (!state.currentUser) return;
  const roleId = state.currentUser.id;

  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roleId })
    });
  } catch (e) {
    console.warn(e);
  }

  localStorage.removeItem('tia_session');
  state.currentUser = null;
  stopShiftTimer();
  await loadEmployees();
  updateAuthUI();
  showNotification('Signed out from portal session.');
}

function restoreSession() {
  const sessionStr = localStorage.getItem('tia_session');
  if (sessionStr) {
    try {
      const user = JSON.parse(sessionStr);
      const match = state.employees.find(e => e.id === user.id);
      state.currentUser = match || user;
      updateAuthUI();
      renderEmployeeGrid();
      renderChatStaffList();
      if (state.currentUser.clockedIn && state.currentUser.clockInTime) {
        startLiveShiftTimer(new Date(state.currentUser.clockInTime));
      }
    } catch (e) {
      console.warn('Session parse error:', e);
    }
  }
}

function updateAuthUI() {
  const badgeDot = document.getElementById('currentUserPresenceDot');
  const badgeText = document.getElementById('activeUserBadgeText');
  const bannerName = document.getElementById('bannerUserName');
  const btnLogout = document.getElementById('btnHeaderLogout');
  const headerLoginBtnText = document.getElementById('headerLoginBtnText');
  const brandSub = document.getElementById('brandExecutiveSubtitle');

  const ideBadgeDot = document.getElementById('ideUserPresenceDot');
  const ideRoleText = document.getElementById('ideActiveRoleText');
  const ideToolbarLoginText = document.getElementById('ideToolbarLoginText');
  const statusPresenceDot = document.getElementById('statusPresenceDot');
  const statusRoleName = document.getElementById('statusRoleName');
  const dockRoleName = document.getElementById('dockRoleName');

  if (state.currentUser) {
    const nameStr = state.currentUser.name && state.currentUser.name.trim() ? state.currentUser.name : state.currentUser.role;
    const roleStr = state.currentUser.role;
    const credsStr = state.currentUser.credentials || state.currentUser.department || 'Tirupati Intellect Authority';

    badgeText.textContent = nameStr;
    badgeDot.className = 'online-indicator online';
    bannerName.textContent = `${nameStr} (${roleStr})`;
    btnLogout.style.display = 'inline-flex';
    headerLoginBtnText.textContent = 'Switch Role';

    if (brandSub) {
      brandSub.textContent = `${roleStr} • ${nameStr} | ${credsStr}`;
    }

    if (ideRoleText) ideRoleText.textContent = roleStr;
    if (ideBadgeDot) ideBadgeDot.className = 'online-indicator online';
    if (ideToolbarLoginText) ideToolbarLoginText.textContent = `Switch (${roleStr})`;
    if (statusRoleName) statusRoleName.textContent = `Role: ${roleStr}`;
    if (statusPresenceDot) statusPresenceDot.className = 'online-indicator online';
    if (dockRoleName) dockRoleName.textContent = roleStr;
  } else {
    badgeText.textContent = 'Not Logged In';
    badgeDot.className = 'online-indicator offline';
    bannerName.textContent = 'Awaiting Login';
    btnLogout.style.display = 'none';
    headerLoginBtnText.textContent = 'Role Login';

    if (brandSub) {
      brandSub.textContent = 'CEO • M. Bhargav Rayudu | B.Tech Mechatronics • CAD Diploma';
    }

    if (ideRoleText) ideRoleText.textContent = 'Guest';
    if (ideBadgeDot) ideBadgeDot.className = 'online-indicator offline';
    if (ideToolbarLoginText) ideToolbarLoginText.textContent = 'Role Login';
    if (statusRoleName) statusRoleName.textContent = 'Role: Guest';
    if (statusPresenceDot) statusPresenceDot.className = 'online-indicator offline';
    if (dockRoleName) dockRoleName.textContent = 'Awaiting Login';
  }

  updateHeaderClockButton();

  const btnRosterAddRole = document.getElementById('btnRosterAddRole');
  if (btnRosterAddRole) {
    btnRosterAddRole.style.display = isCurrentUserExecutive() ? 'inline-flex' : 'none';
  }
}

// ===================================================================
// CHECK IN & CHECK OUT (ATTENDANCE) - 1-CLICK FIXED & DEVELOPED
// ===================================================================
async function toggleClockAction() {
  if (!state.currentUser) {
    openLoginModal();
    showNotification('Please sign in with your role to Check In / Check Out.');
    return;
  }

  if (state.currentUser.clockedIn) {
    await performClockOut();
  } else {
    await performClockIn();
  }
}

async function performClockIn() {
  if (!state.currentUser) {
    openLoginModal();
    return;
  }

  const workMode = document.getElementById('clockWorkMode')?.value || state.currentUser.workMode || 'Executive Office';
  const location = document.getElementById('clockLocation')?.value || 'Tirupati Intellect Authority Online';
  const notes = document.getElementById('clockNotes')?.value || 'Online portal active';

  try {
    const res = await fetch('/api/attendance/clock-in', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: state.currentUser.id,
        workMode,
        location,
        notes
      })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modalClockIn');
      state.currentUser.clockedIn = true;
      state.currentUser.clockInTime = result.employee.clockInTime || new Date().toISOString();
      localStorage.setItem('tia_session', JSON.stringify(state.currentUser));

      await loadEmployees();
      await loadAttendance();
      updateAuthUI();
      startLiveShiftTimer(new Date(state.currentUser.clockInTime));
      showNotification('🟢 Checked In successfully! Shift timer started.');
    } else {
      alert(result.error || 'Check-in failed');
    }
  } catch (err) {
    console.warn('Check In error:', err);
    alert('Check in request failed.');
  }
}

async function performClockOut() {
  if (!state.currentUser) return;
  const notes = document.getElementById('clockNotes')?.value || 'Shift completed';

  try {
    const res = await fetch('/api/attendance/clock-out', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employeeId: state.currentUser.id,
        notes
      })
    });
    const result = await res.json();
    if (result.success) {
      closeModal('modalClockIn');
      stopShiftTimer();
      state.currentUser.clockedIn = false;
      state.currentUser.clockInTime = null;
      localStorage.setItem('tia_session', JSON.stringify(state.currentUser));

      await loadEmployees();
      await loadAttendance();
      updateAuthUI();
      showNotification(`🔴 Checked Out! Duration: ${result.record ? result.record.duration : 'Completed'}`);
    } else {
      alert(result.error || 'Check-out failed');
    }
  } catch (err) {
    console.warn('Check Out error:', err);
    alert('Check out request failed.');
  }
}

function startLiveShiftTimer(startTime) {
  stopShiftTimer();
  function tick() {
    const now = new Date();
    const diffMs = Math.max(0, now - startTime);
    const hrs = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diffMs % (1000 * 60)) / 1000);
    const timeFormatted = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const bannerStatus = document.getElementById('bannerSessionStatus');
    if (bannerStatus) {
      bannerStatus.textContent = `Checked In • Live Shift: ${timeFormatted}`;
    }
    const dot = document.getElementById('bannerSessionDot');
    if (dot) dot.className = 'online-indicator online';

    const statusShiftTimer = document.getElementById('statusShiftTimer');
    if (statusShiftTimer) statusShiftTimer.textContent = `Shift: ${timeFormatted}`;

    const dockShiftStatus = document.getElementById('dockShiftStatus');
    if (dockShiftStatus) dockShiftStatus.textContent = `🟢 Checked In (${timeFormatted})`;
  }
  tick();
  state.shiftTimerInterval = setInterval(tick, 1000);
}

function stopShiftTimer() {
  if (state.shiftTimerInterval) {
    clearInterval(state.shiftTimerInterval);
    state.shiftTimerInterval = null;
  }
  const bannerStatus = document.getElementById('bannerSessionStatus');
  if (bannerStatus) bannerStatus.textContent = 'Checked Out • Off Shift';
  const dot = document.getElementById('bannerSessionDot');
  if (dot) dot.className = 'online-indicator offline';

  const statusShiftTimer = document.getElementById('statusShiftTimer');
  if (statusShiftTimer) statusShiftTimer.textContent = 'Shift: 00:00:00';

  const dockShiftStatus = document.getElementById('dockShiftStatus');
  if (dockShiftStatus) dockShiftStatus.textContent = 'Checked Out';
}

function updateHeaderClockButton() {
  const btn = document.getElementById('btnHeaderClock');
  const label = document.getElementById('clockBtnLabel');
  const dashBtn = document.getElementById('btnDashboardCheckIn');
  const dashLabel = document.getElementById('dashboardClockBtnLabel');
  const ideBtn = document.getElementById('ideBtnClock');
  const ideLabel = document.getElementById('ideClockBtnLabel');

  if (state.currentUser && state.currentUser.clockedIn) {
    if (btn) {
      btn.className = 'btn-clock-action btn-clock-out';
      if (label) label.textContent = 'Check Out';
      btn.innerHTML = `<i class="ph ph-sign-out"></i> <span>Check Out</span>`;
    }
    if (dashBtn) {
      dashBtn.className = 'btn-clock-action btn-clock-out';
      if (dashLabel) dashLabel.textContent = 'Check Out Now';
    }
    if (ideBtn) {
      ideBtn.className = 'btn-clock-action btn-clock-out';
      if (ideLabel) ideLabel.textContent = 'Check Out';
      ideBtn.innerHTML = `<i class="ph ph-sign-out"></i> <span>Check Out</span>`;
    }
  } else {
    if (btn) {
      btn.className = 'btn-clock-action btn-clock-in';
      if (label) label.textContent = 'Check In';
      btn.innerHTML = `<i class="ph ph-fingerprint"></i> <span>Check In</span>`;
    }
    if (dashBtn) {
      dashBtn.className = 'btn-clock-action btn-clock-in';
      if (dashLabel) dashLabel.textContent = '1-Click Check In';
    }
    if (ideBtn) {
      ideBtn.className = 'btn-clock-action btn-clock-in';
      if (ideLabel) ideLabel.textContent = 'Check In';
      ideBtn.innerHTML = `<i class="ph ph-fingerprint"></i> <span>Check In</span>`;
    }
  }
}

function openClockModal() {
  if (!state.currentUser) {
    openLoginModal();
    return;
  }
  const nameStr = state.currentUser.name && state.currentUser.name.trim() ? state.currentUser.name : state.currentUser.role;
  document.getElementById('modalClockEmpName').textContent = `${nameStr} (${state.currentUser.role})`;
  document.getElementById('modalClockEmpRole').textContent = state.currentUser.department;

  const btnIn = document.getElementById('btnPerformClockIn');
  const btnOut = document.getElementById('btnPerformClockOut');

  if (state.currentUser.clockedIn) {
    btnIn.style.display = 'none';
    btnOut.style.display = 'inline-flex';
  } else {
    btnIn.style.display = 'inline-flex';
    btnOut.style.display = 'none';
  }

  openModal('modalClockIn');
}

// Time parsing helper: converts time strings like '09:30 am', '9:30 AM', '17:45' to minutes from midnight
function parseTimeStrToMinutes(timeStr) {
  if (!timeStr || timeStr === '--') return null;
  const cleaned = timeStr.trim().toLowerCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?$/);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const modifier = match[3];

  if (modifier === 'pm' && hours < 12) hours += 12;
  if (modifier === 'am' && hours === 12) hours = 0;

  return hours * 60 + minutes;
}

// Calculate accurate duration matching Time In and Time Out
function calculateAttendanceDuration(clockIn, clockOut, clockInTime, clockOutTime) {
  if (!clockOut || clockOut === '--') {
    return 'In Session';
  }

  // 1. If ISO timestamps are present and valid, calculate exact difference
  if (clockInTime && clockOutTime) {
    const tIn = new Date(clockInTime).getTime();
    const tOut = new Date(clockOutTime).getTime();
    if (!isNaN(tIn) && !isNaN(tOut) && tOut >= tIn) {
      const diffMs = tOut - tIn;
      const totalMins = Math.round(diffMs / 60000);
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      return `${h}h ${String(m).padStart(2, '0')}m`;
    }
  }

  // 2. Parse 12h/24h time strings (e.g. '09:00 am' to '05:30 pm')
  const inMins = parseTimeStrToMinutes(clockIn);
  const outMins = parseTimeStrToMinutes(clockOut);

  if (inMins !== null && outMins !== null) {
    let diffMins = outMins - inMins;
    if (diffMins < 0) {
      diffMins += 24 * 60; // Overnight shift
    }
    const h = Math.floor(diffMins / 60);
    const m = diffMins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
  }

  return 'Completed';
}

// Attendance History - Stored & Preserved until Authorities (CEO / P.A / Office Manager) Delete
async function loadAttendance() {
  try {
    try { localStorage.removeItem('tia_attendance_cleared_at'); } catch (e) {}

    const res = await fetch(`/api/attendance?_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    let list = await res.json();
    if (Array.isArray(list)) {
      let localSaved = [];
      try {
        localSaved = JSON.parse(localStorage.getItem('tia_attendance_records') || '[]');
      } catch (e) {}

      if (list.length > 0) {
        state.attendance = list;
        try { localStorage.setItem('tia_attendance_records', JSON.stringify(list)); } catch (e) {}
      } else if (localSaved.length > 0) {
        // If server was restarted with empty disk, restore from client backup and sync
        state.attendance = localSaved;
        try {
          fetch('/api/attendance/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ records: localSaved })
          }).catch(() => {});
        } catch (e) {}
      } else {
        state.attendance = [];
      }
    }
    renderAttendanceTable();
  } catch (err) {
    console.warn('Failed to load attendance:', err);
    try {
      const localSaved = JSON.parse(localStorage.getItem('tia_attendance_records') || '[]');
      if (Array.isArray(localSaved) && localSaved.length > 0) {
        state.attendance = localSaved;
        renderAttendanceTable();
      }
    } catch (e) {}
  }
}

function renderAttendanceTable() {
  const tbody = document.getElementById('attendanceTableBody');
  if (!tbody) return;

  if (state.attendance.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:24px; color:var(--grey-medium);"><i class="ph ph-fingerprint" style="font-size:1.6rem; color:var(--blue-light); display:block; margin-bottom:6px;"></i>No attendance records logged yet. Click "Check In" to begin.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.attendance.map(row => {
    const isClockedOut = row.clockOut && row.clockOut !== '--';
    const duration = isClockedOut
      ? calculateAttendanceDuration(row.clockIn, row.clockOut, row.clockInTime, row.clockOutTime)
      : (row.duration || 'In Session');

    return `
    <tr>
      <td><strong style="color: #ffffff;">${row.employeeName || row.role}</strong></td>
      <td><div style="font-size:0.8rem; color:var(--blue-light); font-weight:600;">${row.role}</div></td>
      <td><span style="font-family:'JetBrains Mono',monospace; font-size:0.8rem; color:var(--grey-light);">${row.date || 'Today'}</span></td>
      <td><span class="badge badge-green">${row.clockIn}</span></td>
      <td><span class="badge ${!isClockedOut ? 'badge-blue' : 'badge-grey'}">${row.clockOut}</span></td>
      <td>
        <div style="font-size:0.82rem;">${row.workMode}</div>
        <div style="font-size:0.72rem; color:var(--grey-medium);">${row.location}</div>
      </td>
      <td><strong style="font-family: 'JetBrains Mono', monospace; color:var(--green-light);">${duration}</strong></td>
      <td><span class="badge ${!isClockedOut ? 'badge-green' : 'badge-blue'}">${row.status}</span></td>
      <td style="text-align: center;">
        <button class="btn-sm-action" onclick="deleteSingleAttendanceRecord('${row.id}', '${escapeQuotes(row.employeeName || row.role)}')" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); padding: 4px 8px;" title="Delete Record (Authorities: CEO / Office Manager / P.A)">
          <i class="ph ph-trash"></i>
        </button>
      </td>
    </tr>
  `;
  }).join('');
}

async function deleteSingleAttendanceRecord(attId, empName) {
  if (!isCurrentUserExecutive()) {
    openLoginModal();
    showNotification('🔒 Authority Access: Please sign in as CEO, Office Manager, or P.A to delete attendance records.');
    return;
  }

  const confirmed = confirm(`Executive Authority (${state.currentUser.role}):\nAre you sure you want to delete the attendance record for "${empName}"?\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/attendance/${encodeURIComponent(attId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: state.currentUser.id,
        requesterRole: state.currentUser.role,
        requesterName: state.currentUser.name || state.currentUser.role
      })
    });
    const result = await res.json();
    if (result.success) {
      showNotification(`🗑️ ${result.message || 'Attendance record deleted.'}`);
      state.attendance = state.attendance.filter(a => a.id !== attId);
      try { localStorage.setItem('tia_attendance_records', JSON.stringify(state.attendance)); } catch (e) {}
      renderAttendanceTable();
    } else {
      alert(result.error || 'Failed to delete attendance record.');
    }
  } catch (err) {
    console.warn('Delete attendance error:', err);
    alert('Network error while deleting attendance record.');
  }
}

function exportAttendanceCSV() {
  if (state.attendance.length === 0) {
    alert('No attendance data available to export.');
    return;
  }

  let csv = 'Personnel,Role,Date,Clock In,Clock Out,Duration,Work Mode,Location,Notes\n';
  state.attendance.forEach(a => {
    const isClockedOut = a.clockOut && a.clockOut !== '--';
    const duration = isClockedOut
      ? calculateAttendanceDuration(a.clockIn, a.clockOut, a.clockInTime, a.clockOutTime)
      : (a.duration || 'In Session');
    csv += `"${a.employeeName}","${a.role}","${a.date}","${a.clockIn}","${a.clockOut}","${duration}","${a.workMode}","${a.location}","${a.notes || ''}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `TIA_Attendance_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Attendance Clearing - Authority strictly restricted to CEO / P.A / Office Manager
async function clearAttendanceLog() {
  if (!state.currentUser) {
    alert('Access Denied: Please sign in. Only CEO, P.A, or Office Manager have the authority to clear attendance logs.');
    openLoginModal();
    return;
  }

  const roleClean = ((state.currentUser.role || '') + ' ' + (state.currentUser.name || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
  const idClean = (state.currentUser.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '');

  const isAuthorized = roleClean.includes('ceo') ||
                       roleClean.includes('pa') ||
                       roleClean.includes('personalassistant') ||
                       roleClean.includes('officemanager') ||
                       roleClean.includes('officemgr') ||
                       idClean === 'role_ceo' ||
                       idClean === 'role_pa' ||
                       idClean === 'role_office_mgr';

  if (!isAuthorized) {
    alert(`Access Denied: Your current role is "${state.currentUser.role}".\nOnly CEO, P.A, or Office Manager are authorized to clear attendance records.`);
    return;
  }

  const confirmed = confirm(`Executive Clearance Authority (${state.currentUser.role}):\nAre you sure you want to clear and reset all attendance records? This cannot be undone.`);
  if (!confirmed) return;

  // Optimistic UI clear and clear local cache
  state.attendance = [];
  try {
    localStorage.removeItem('tia_attendance_records');
    localStorage.removeItem('tia_attendance_cleared_at');
  } catch (e) {}
  renderAttendanceTable();

  try {
    const res = await fetch('/api/attendance/clear', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: state.currentUser.id,
        requesterRole: state.currentUser.role,
        requesterName: state.currentUser.name || state.currentUser.role
      })
    });
    const result = await res.json();
    if (result.success) {
      showNotification(`🧹 Attendance cleared: ${result.message || 'All records reset.'}`);
      await loadAttendance();
      await loadEmployees();
      updateAuthUI();
    } else {
      alert(result.error || 'Failed to clear attendance.');
      await loadAttendance();
    }
  } catch (err) {
    console.warn('Clear attendance error:', err);
    alert('Network error while clearing attendance records.');
    await loadAttendance();
  }
}

// ===================================================================
// EMPLOYEES PAYSLIP MANAGEMENT (Name, Salary, Extra Commission)
// ===================================================================
async function loadPayslips() {
  try {
    const res = await fetch('/api/payslips');
    state.payslips = await res.json();
    renderPayslipsTable();
    updatePayslipKPIs();
  } catch (err) {
    console.warn('Failed to load payslips:', err);
  }
}

function updatePayslipKPIs() {
  const count = state.payslips.length;
  const totalBase = state.payslips.reduce((a, p) => a + (Number(p.salary) || 0), 0);
  const totalComm = state.payslips.reduce((a, p) => a + (Number(p.extraCommission) || 0), 0);
  const totalGross = totalBase + totalComm;

  const countEl = document.getElementById('kpiPayslipCount');
  const baseEl = document.getElementById('kpiTotalBaseSalary');
  const commEl = document.getElementById('kpiTotalCommissions');
  const grossEl = document.getElementById('kpiTotalGrossPayout');

  if (countEl) countEl.textContent = count;
  if (baseEl) baseEl.textContent = `₹${totalBase.toLocaleString('en-IN')}`;
  if (commEl) commEl.textContent = `₹${totalComm.toLocaleString('en-IN')}`;
  if (grossEl) grossEl.textContent = `₹${totalGross.toLocaleString('en-IN')}`;
}

function openAddPayslipModal() {
  calculatePayslipTotal();
  openModal('modalAddPayslip');
}

function calculatePayslipTotal() {
  const sal = Number(document.getElementById('payslipSalary')?.value) || 0;
  const comm = Number(document.getElementById('payslipCommission')?.value) || 0;
  const total = sal + comm;
  const display = document.getElementById('payslipTotalDisplay');
  if (display) display.value = total;
}

async function saveNewPayslip() {
  const employeeName = document.getElementById('payslipName').value.trim();
  const role = document.getElementById('payslipRole').value;
  const monthYear = document.getElementById('payslipMonth').value.trim();
  const salary = Number(document.getElementById('payslipSalary').value) || 0;
  const extraCommission = Number(document.getElementById('payslipCommission').value) || 0;
  const paymentMethod = document.getElementById('payslipPaymentMethod').value;
  const notes = document.getElementById('payslipNotes').value;

  if (!employeeName) {
    alert('Please enter employee name.');
    return;
  }
  if (!salary && salary !== 0) {
    alert('Please enter salary amount.');
    return;
  }

  const payload = {
    employeeName,
    role,
    monthYear,
    salary,
    extraCommission,
    paymentMethod,
    notes
  };

  try {
    const res = await fetch('/api/payslips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const saved = await res.json();
    closeModal('modalAddPayslip');
    await loadPayslips();
    showNotification(`Payslip generated for ${saved.employeeName} (Net: ₹${saved.totalNetPay.toLocaleString('en-IN')})`);
    generateAndShowPayslip(saved.id);
  } catch (err) {
    console.warn('Save payslip failed:', err);
    alert('Failed to generate payslip.');
  }
}

function renderPayslipsTable() {
  const tbody = document.getElementById('payslipsTableBody');
  if (!tbody) return;

  if (state.payslips.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align:center; padding:32px; color:var(--grey-medium);">
          <i class="ph ph-receipt" style="font-size:2rem; color:var(--green-light); display:block; margin-bottom:8px;"></i>
          No payslips issued yet.<br>
          <span style="font-size:0.8rem;">Click <strong>"Generate Employee Payslip"</strong> to input Name, Salary, and Extra Commission.</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.payslips.map(p => `
    <tr>
      <td><strong style="color:var(--blue-light); font-family:monospace;">${p.id}</strong></td>
      <td><strong style="color:#ffffff;">${p.employeeName}</strong></td>
      <td><span class="badge badge-blue">${p.role}</span></td>
      <td><span style="font-weight:600; color:var(--grey-light);">${p.monthYear}</span></td>
      <td style="color:#ffffff;">₹${Number(p.salary).toLocaleString('en-IN')}</td>
      <td style="color:var(--green-light); font-weight:700;">+ ₹${Number(p.extraCommission).toLocaleString('en-IN')}</td>
      <td><strong style="color:#ffffff; font-size:1rem;">₹${Number(p.totalNetPay).toLocaleString('en-IN')}</strong></td>
      <td><span class="badge badge-green">${p.status || 'Disbursed'}</span></td>
      <td>
        <div style="display:flex; gap:6px;">
          <button class="btn-sm-action" onclick="generateAndShowPayslip('${p.id}')" title="Print/Download Payslip">
            <i class="ph ph-printer"></i> View / Print
          </button>
          <button class="btn-sm-action" style="color:var(--red-danger); border-color:rgba(239,68,68,0.3);" onclick="deletePayslip('${p.id}')" title="Delete">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function deletePayslip(id) {
  if (!confirm('Are you sure you want to remove this payslip record?')) return;
  try {
    await fetch(`/api/payslips/${id}`, { method: 'DELETE' });
    await loadPayslips();
    showNotification('Payslip deleted.');
  } catch (err) {
    console.warn('Delete payslip error:', err);
  }
}

function generateAndShowPayslip(id) {
  const p = state.payslips.find(item => item.id === id);
  if (!p) return;

  const container = document.getElementById('printablePayslipContent');
  const baseSal = Number(p.salary) || 0;
  const comm = Number(p.extraCommission) || 0;
  const net = baseSal + comm;

  container.innerHTML = `
    <div class="payslip-header-row">
      <div class="payslip-brand">
        <img src="/assets/tia_logo_circle.png" alt="TIA Logo" class="payslip-logo-img">
        <div class="payslip-brand-text">
          <h2>TIRUPATI INTELLECT AUTHORITY</h2>
          <div class="tagline">Empowering Tirupati with AI • Human Resources & Payroll</div>
          <div class="ceo-cred">CEO • M. Bhargav Rayudu | B.Tech Mechatronics • CAD Diploma</div>
          <div style="font-size:0.75rem; color:#475569; margin-top:2px;">
            Tirupati Intellect Authority Online, Tech Park Road, Tirupati, Andhra Pradesh - 517501
          </div>
        </div>
      </div>
      <div class="payslip-meta">
        <h3>SALARY PAYSLIP</h3>
        <p><strong>Payslip Ref:</strong> ${p.id}</p>
        <p><strong>Pay Period:</strong> ${p.monthYear}</p>
        <p><strong>GSTIN:</strong> 37EYLPM8018M1ZN</p>
      </div>
    </div>

    <div class="payslip-details-grid">
      <div class="payslip-box">
        <h4>Employee Information</h4>
        <p><strong>Employee Name:</strong> ${p.employeeName}</p>
        <p><strong>Designation / Role:</strong> ${p.role}</p>
        <p><strong>Disbursement Date:</strong> ${p.generatedDate || new Date().toISOString().split('T')[0]}</p>
      </div>
      <div class="payslip-box">
        <h4>Disbursement Details</h4>
        <p><strong>Payment Method:</strong> ${p.paymentMethod || 'Direct Bank Transfer'}</p>
        <p><strong>Status:</strong> <span style="color:#059669; font-weight:700;">${p.status || 'Disbursed in Full'}</span></p>
        <p><strong>Remarks:</strong> ${p.notes || 'Performance commission & remuneration'}</p>
      </div>
    </div>

    <table class="payslip-table">
      <thead>
        <tr>
          <th>Earnings Component</th>
          <th>Type</th>
          <th style="text-align: right;">Amount (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td><strong>Base Basic Salary</strong><br><span style="font-size:0.75rem; color:#64748b;">Fixed monthly compensation</span></td>
          <td>Regular Earnings</td>
          <td style="text-align: right; font-weight:700;">₹${baseSal.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td><strong>Extra Performance Commission / Incentive</strong><br><span style="font-size:0.75rem; color:#64748b;">Target achievement & project deliverables</span></td>
          <td>Incentive Bonus</td>
          <td style="text-align: right; font-weight:700; color:#059669;">+ ₹${comm.toLocaleString('en-IN')}</td>
        </tr>
      </tbody>
    </table>

    <div class="payslip-totals">
      <table class="payslip-totals-table">
        <tr>
          <td>Gross Earnings:</td>
          <td style="text-align: right;">₹${net.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td>Deductions:</td>
          <td style="text-align: right;">₹0.00</td>
        </tr>
        <tr class="grand-total">
          <td style="color:#090e1a; font-weight:800;">Total Net Take-Home Pay:</td>
          <td style="text-align: right; color:#059669; font-weight:800; font-size:1.15rem;">₹${net.toLocaleString('en-IN')}</td>
        </tr>
      </table>
    </div>

    <div class="payslip-footer-row">
      <div>
        <div class="stamp-box">
          <i class="ph ph-seal-check"></i> DISBURSED & VERIFIED
        </div>
        <div style="font-size:0.74rem; color:#64748b; margin-top:8px;">
          GSTIN: <strong>37EYLPM8018M1ZN</strong> | Computer generated payslip authorized by TIA Financial Systems.
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-line">M. Bhargav Rayudu</div>
        <div class="signature-title">
          <strong>M. Bhargav Rayudu</strong><br>
          CEO & Founder, Tirupati Intellect Authority<br>
          B.Tech Mechatronics • CAD Diploma
        </div>
      </div>
    </div>
  `;

  openModal('modalPayslipPrint');
}

// ===================================================================
// EMPLOYEES ROSTER & CHAT
// ===================================================================
async function loadEmployees() {
  try {
    const res = await fetch('/api/employees');
    state.employees = await res.json();
    renderEmployeeGrid();
    renderChatStaffList();
    updatePresenceBadges();
  } catch (err) {
    console.warn('Failed to load employees:', err);
  }
}

function isCurrentUserExecutive() {
  if (!state.currentUser) return false;
  const roleClean = ((state.currentUser.role || '') + ' ' + (state.currentUser.name || '')).toLowerCase().replace(/[^a-z0-9]/g, '');
  const idClean = (state.currentUser.id || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  return roleClean.includes('ceo') ||
         roleClean.includes('pa') ||
         roleClean.includes('personalassistant') ||
         roleClean.includes('officemanager') ||
         roleClean.includes('officemgr') ||
         idClean === 'role_ceo' ||
         idClean === 'role_pa' ||
         idClean === 'role_office_mgr';
}

function renderEmployeeGrid() {
  const container = document.getElementById('employeeGrid');
  if (!container) return;

  const isExecutive = isCurrentUserExecutive();
  const btnRosterAddRole = document.getElementById('btnRosterAddRole');
  if (btnRosterAddRole) {
    btnRosterAddRole.style.display = 'inline-flex';
  }

  container.innerHTML = state.employees.map(emp => {
    const isOnline = emp.online;
    const statusClass = emp.status === 'away' ? 'away' : (isOnline ? 'online' : 'offline');
    const statusText = emp.status === 'away' ? 'Idle / Away' : (isOnline ? '🟢 Online in Portal' : 'Offline (Awaiting Login)');
    const isMe = state.currentUser && state.currentUser.id === emp.id;
    const titleName = emp.name && emp.name.trim() ? emp.name : emp.role;
    const isCustomEmp = !emp.id.startsWith('role_') || emp.id === 'emp_' || emp.id.includes('emp_');

    return `
      <div class="employee-card ${isMe ? 'is-active-user' : ''}">
        <div class="emp-top">
          <div class="emp-avatar">
            ${emp.avatar || '👤'}
            <span class="status-dot online-indicator ${statusClass}"></span>
          </div>
          <div class="emp-details">
            <h4>${titleName} ${isMe ? '<span class="badge badge-blue" style="font-size:0.6rem;">YOU</span>' : ''}</h4>
            <p>${emp.role}</p>
            ${emp.credentials ? `<div style="font-size:0.75rem; color:var(--blue-light); font-weight:600; margin-bottom:2px;"><i class="ph ph-certificate"></i> ${emp.credentials}</div>` : ''}
            <div class="dept">${emp.department}</div>
          </div>
        </div>

        <div class="emp-meta">
          <div style="display: flex; justify-content: space-between;">
            <span>Presence:</span>
            <strong style="color: ${isOnline ? '#34d399' : '#94a3b8'}">${statusText}</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span>Shift Status:</span>
            <span>${emp.clockedIn ? 'Clocked In' : 'Clocked Out'}</span>
          </div>
        </div>

        <div class="emp-actions">
          <button class="btn-sm-action" onclick="openDirectStaffChat('${emp.id}')">
            <i class="ph ph-chat-circle"></i> Message
          </button>
          ${emp.whatsapp ? `
            <a href="https://wa.me/${emp.whatsapp}?text=Hello%20${encodeURIComponent(titleName)}%2C%20connecting%20from%20TIA%20Enterprise%20Portal." target="_blank" class="btn-sm-action btn-sm-whatsapp" title="WhatsApp">
              <i class="ph ph-whatsapp-logo"></i> WhatsApp
            </a>
          ` : `
            <button class="btn-sm-action" onclick="openLoginModal()" title="Login to activate">
              <i class="ph ph-user"></i> Login
            </button>
          `}
          <button class="btn-sm-action" onclick="openEditEmployeeModal('${emp.id}')" title="Edit Staff & Role Credentials (Authorities: CEO / Office Manager / P.A)" style="border-color: rgba(59,130,246,0.45); color: var(--blue-light);">
            <i class="ph ph-pencil-simple"></i> Edit
          </button>
          ${emp.id !== 'role_ceo' ? `
            <button class="btn-sm-action" onclick="deleteEmployee('${emp.id}', '${escapeQuotes(titleName)}')" style="color: #ef4444; border-color: rgba(239,68,68,0.35);" title="Delete Staff Account (Authorities: CEO / Office Manager / P.A)">
              <i class="ph ph-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function openAddRoleModal() {
  if (!isCurrentUserExecutive()) {
    openLoginModal();
    showNotification('🔒 Authority Required: Please sign in as CEO, Office Manager, or P.A to add new staff roles.');
    return;
  }

  const titleEl = document.querySelector('#modalEditEmployee .modal-header h3 span');
  if (titleEl) titleEl.textContent = 'Add New Staff / Role';

  document.getElementById('editEmpId').value = 'new';
  document.getElementById('editEmpName').value = '';
  document.getElementById('editEmpRole').value = '';
  document.getElementById('editEmpDept').value = 'Operations';
  document.getElementById('editEmpCredentials').value = 'TIA Enterprise Staff';
  document.getElementById('editEmpMobile').value = '';
  document.getElementById('editEmpWhatsapp').value = '';
  document.getElementById('editEmpPassword').value = 'tia123';
  document.getElementById('editEmpWorkMode').value = 'Executive Office';

  const btnDel = document.getElementById('btnModalDeleteEmp');
  if (btnDel) btnDel.style.display = 'none';

  const alertEl = document.getElementById('editEmpAlert');
  if (alertEl) alertEl.style.display = 'none';

  openModal('modalEditEmployee');
}

function openEditEmployeeModal(empId) {
  if (!isCurrentUserExecutive()) {
    openLoginModal();
    showNotification('🔒 Authority Required: Please sign in as CEO, Office Manager, or P.A to edit role details & credentials.');
    return;
  }

  const emp = state.employees.find(e => e.id === empId);
  if (!emp) return;

  const titleEl = document.querySelector('#modalEditEmployee .modal-header h3 span');
  if (titleEl) titleEl.textContent = 'Edit Staff & Credentials';

  document.getElementById('editEmpId').value = emp.id;
  document.getElementById('editEmpName').value = emp.name || '';
  document.getElementById('editEmpRole').value = emp.role || '';
  document.getElementById('editEmpDept').value = emp.department || '';
  document.getElementById('editEmpCredentials').value = emp.credentials || '';
  document.getElementById('editEmpMobile').value = emp.mobile || emp.phone || '';
  document.getElementById('editEmpWhatsapp').value = emp.whatsapp || '';
  document.getElementById('editEmpPassword').value = emp.password || 'tia123';
  document.getElementById('editEmpWorkMode').value = emp.workMode || 'Executive Office';

  const btnDel = document.getElementById('btnModalDeleteEmp');
  if (btnDel) {
    btnDel.style.display = (emp.id !== 'role_ceo') ? 'inline-flex' : 'none';
  }

  const alertEl = document.getElementById('editEmpAlert');
  if (alertEl) alertEl.style.display = 'none';

  openModal('modalEditEmployee');
}

async function saveEmployeeChanges() {
  if (!isCurrentUserExecutive()) {
    alert('Access Denied: Only CEO, Office Manager, or P.A can save staff credential modifications.');
    return;
  }

  const empId = document.getElementById('editEmpId').value;
  const name = document.getElementById('editEmpName').value.trim();
  const role = document.getElementById('editEmpRole').value.trim();
  const department = document.getElementById('editEmpDept').value.trim();
  const credentials = document.getElementById('editEmpCredentials').value.trim();
  const mobile = document.getElementById('editEmpMobile').value.trim();
  const whatsapp = document.getElementById('editEmpWhatsapp').value.trim();
  const password = document.getElementById('editEmpPassword').value.trim() || 'tia123';
  const workMode = document.getElementById('editEmpWorkMode').value;

  if (!name || !role) {
    alert('Name and Role/Designation are required.');
    return;
  }

  const isNew = (!empId || empId === 'new');
  const url = isNew ? '/api/employees' : `/api/employees/${empId}`;
  const method = isNew ? 'POST' : 'PUT';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: state.currentUser.id,
        requesterRole: state.currentUser.role,
        requesterName: state.currentUser.name || state.currentUser.role,
        name,
        role,
        department,
        credentials,
        mobile,
        phone: mobile,
        whatsapp,
        password,
        workMode
      })
    });
    const result = await res.json();
    if (result.success) {
      if (isNew) {
        showNotification(`✅ Staff member added: ${result.employee.name} (${result.employee.role})!`);
        state.employees.push(result.employee);
      } else {
        showNotification(`✅ Credentials updated for ${result.employee.name} (${result.employee.role})!`);
        const idx = state.employees.findIndex(e => e.id === empId);
        if (idx !== -1) {
          state.employees[idx] = result.employee;
        }
        if (state.currentUser && state.currentUser.id === empId) {
          state.currentUser = { ...state.currentUser, ...result.employee };
          localStorage.setItem('tia_session', JSON.stringify(state.currentUser));
          updateAuthUI();
        }
      }
      renderEmployeeGrid();
      renderChatStaffList();
      closeModal('modalEditEmployee');
    } else {
      alert(result.error || 'Failed to save staff record.');
    }
  } catch (err) {
    console.warn('Save employee error:', err);
    alert('Network error while saving employee modifications.');
  }
}

async function deleteEmployee(empId, empName) {
  if (!isCurrentUserExecutive()) {
    openLoginModal();
    showNotification('🔒 Authority Required: Please sign in as CEO, Office Manager, or P.A to delete staff accounts.');
    return;
  }

  if (empId === 'role_ceo') {
    alert('Protection Rule: Primary CEO system account cannot be deleted.');
    return;
  }

  const confirmed = confirm(`Executive Authority (${state.currentUser.role}):\nAre you sure you want to delete "${empName}" from the TIA staff roster?\nThis action cannot be undone.`);
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/employees/${empId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requesterId: state.currentUser.id,
        requesterRole: state.currentUser.role,
        requesterName: state.currentUser.name || state.currentUser.role
      })
    });
    const result = await res.json();
    if (result.success) {
      showNotification(`🗑️ ${result.message || 'Staff member deleted.'}`);
      state.employees = state.employees.filter(e => e.id !== empId);
      if (state.currentUser && state.currentUser.id === empId) {
        performLogout();
      }
      renderEmployeeGrid();
      renderChatStaffList();
      closeModal('modalEditEmployee');
    } else {
      alert(result.error || 'Failed to delete staff member.');
    }
  } catch (err) {
    console.warn('Delete employee error:', err);
    alert('Network error while deleting staff account.');
  }
}

function confirmDeleteCurrentEmployee() {
  const empId = document.getElementById('editEmpId').value;
  const empName = document.getElementById('editEmpName').value;
  deleteEmployee(empId, empName);
}

function updatePresenceBadges() {
  const onlineCount = state.employees.filter(e => e.online).length;
  const badge = document.getElementById('onlineCountBadge');
  if (badge) badge.textContent = `${onlineCount} Online`;

  state.employees.forEach(emp => {
    const dot = document.getElementById(`dot-chan-${emp.id}`);
    if (dot) {
      dot.className = `status-dot online-indicator ${emp.online ? 'online' : 'offline'}`;
    }
    const staffDot = document.getElementById(`dot-staff-${emp.id}`);
    if (staffDot) {
      staffDot.className = `status-dot online-indicator ${emp.online ? 'online' : 'offline'}`;
    }
  });
}

// Render dynamic list of internal colleagues in chat sidebar
function renderChatStaffList(filterText = '') {
  const container = document.getElementById('chatStaffDirectList');
  const countBadge = document.getElementById('staffDirectCountBadge');
  if (!container) return;

  const filter = (filterText || '').toLowerCase().trim();
  const list = state.employees.filter(emp => {
    if (!filter) return true;
    const name = (emp.name || '').toLowerCase();
    const role = (emp.role || '').toLowerCase();
    const dept = (emp.department || '').toLowerCase();
    return name.includes(filter) || role.includes(filter) || dept.includes(filter);
  });

  if (countBadge) countBadge.textContent = state.employees.length;

  if (list.length === 0) {
    container.innerHTML = `
      <div style="padding: 10px 16px; font-size: 0.74rem; color: var(--grey-medium); text-align: center;">
        No staff found matching "${filterText}".
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(emp => {
    const isMe = state.currentUser && state.currentUser.id === emp.id;
    const title = (emp.name && emp.name.trim()) ? emp.name : emp.role;
    const isOnline = emp.online;
    const statusClass = isOnline ? 'online' : 'offline';

    const isTargetActive = state.activeChannel === emp.id || 
      (state.activeChannel.startsWith('dm_') && state.activeChannel.includes(emp.id));

    return `
      <div class="staff-direct-item ${isTargetActive ? 'active' : ''}" id="staff-item-${emp.id}" onclick="openDirectStaffChat('${emp.id}')">
        <span class="emp-avatar" style="width: 34px; height: 34px; font-size: 1.15rem; flex-shrink: 0;">
          ${emp.avatar || '👤'}
          <span class="status-dot online-indicator ${statusClass}" id="dot-staff-${emp.id}"></span>
        </span>
        <div class="channel-info" style="overflow: hidden; flex: 1;">
          <h4>
            <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${title}</span>
            ${isMe ? '<span class="badge badge-blue" style="font-size:0.55rem; padding:1px 4px; margin-left: 4px;">YOU</span>' : ''}
          </h4>
          <p style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${emp.role} • ${emp.department}</p>
        </div>
      </div>
    `;
  }).join('');
}

// Filter both fixed channels and dynamic staff list
function filterChatChannels(text) {
  const query = (text || '').toLowerCase().trim();
  document.querySelectorAll('.chat-channel-list > .channel-item').forEach(el => {
    const content = el.textContent.toLowerCase();
    el.style.display = content.includes(query) ? 'flex' : 'none';
  });
  renderChatStaffList(query);
}

// Direct 1-to-1 internal messaging between colleagues
function openDirectStaffChat(colleagueId) {
  switchTab('communications');
  const colleague = state.employees.find(e => e.id === colleagueId);
  if (!colleague) return;

  if (state.currentUser && state.currentUser.id === colleague.id) {
    showNotification(`📢 Company-wide communication: TIA All-Hands Stream.`);
    selectChannel('general');
    return;
  }

  let dmKey;
  if (state.currentUser) {
    // Standard deterministic DM key for two staff members
    dmKey = 'dm_' + [state.currentUser.id, colleague.id].sort().join('_');
  } else {
    dmKey = 'dm_guest_' + colleague.id;
  }

  selectChannel(dmKey, colleague);
}

function openDirectChat(employeeId) {
  openDirectStaffChat(employeeId);
}

async function selectChannel(channelId, targetEmp) {
  state.activeChannel = channelId;

  document.querySelectorAll('.channel-item, .staff-direct-item').forEach(el => el.classList.remove('active'));
  const activeEl = document.getElementById(`chan-${channelId}`) || 
                   document.getElementById(`staff-item-${channelId}`) ||
                   (targetEmp && document.getElementById(`staff-item-${targetEmp.id}`));
  if (activeEl) activeEl.classList.add('active');

  const headerTitle = document.getElementById('currentChannelTitle');
  const headerSubtitle = document.getElementById('currentChannelSubtitle');
  const btnWa = document.getElementById('btnChannelWhatsApp');
  const btnCall = document.getElementById('btnChannelCall');

  let emp = targetEmp;
  if (!emp) {
    if (channelId.startsWith('dm_')) {
      const parts = channelId.replace('dm_', '').split('_');
      const otherId = (state.currentUser && parts[0] === state.currentUser.id) ? parts[1] : parts[0];
      emp = state.employees.find(e => e.id === otherId);
    } else {
      emp = state.employees.find(e => e.id === channelId);
    }
  }

  if (channelId === 'general') {
    headerTitle.textContent = 'TIA All-Hands Stream';
    headerSubtitle.textContent = 'Company-wide communication across all divisions';
    btnWa.style.display = 'none';
    btnCall.style.display = 'none';
  } else if (emp) {
    const title = emp.name && emp.name.trim() ? `${emp.name} (${emp.role})` : `${emp.role} Desk`;
    headerTitle.textContent = channelId.startsWith('dm_') ? `Direct Chat: ${title}` : title;
    headerSubtitle.textContent = `${emp.online ? '🟢 Online in Portal' : 'Offline'} • ${emp.department} • Internal Staff`;
    btnWa.style.display = emp.whatsapp ? 'inline-flex' : 'none';
    btnCall.style.display = emp.phone ? 'inline-flex' : 'none';

    if (emp.whatsapp) {
      btnWa.href = `https://wa.me/${emp.whatsapp}?text=Hello%20${encodeURIComponent(title)}%2C%20connecting%20from%20TIA%20Enterprise%20Portal.`;
    }
    if (emp.phone) btnCall.href = `tel:${emp.phone}`;
  } else {
    headerTitle.textContent = 'Executive Leadership Channel';
    headerSubtitle.textContent = 'Active Enterprise Channel';
    btnWa.style.display = 'none';
    btnCall.style.display = 'none';
  }

  await loadMessages();
}

async function loadMessages() {
  try {
    const userId = state.currentUser ? state.currentUser.id : '';
    const res = await fetch(`/api/messages/${state.activeChannel}?userId=${encodeURIComponent(userId)}&_t=${Date.now()}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    const msgs = await res.json();
    if (Array.isArray(msgs) && msgs.length > 0) {
      state.messages = msgs;
      try { localStorage.setItem(`tia_chat_${state.activeChannel}`, JSON.stringify(msgs)); } catch (e) {}
    } else {
      const cached = localStorage.getItem(`tia_chat_${state.activeChannel}`);
      if (cached) {
        state.messages = JSON.parse(cached);
      } else {
        state.messages = msgs || [];
      }
    }
    renderMessages();
  } catch (err) {
    console.warn('Network error loading messages, using local cache:', err);
    try {
      const cached = localStorage.getItem(`tia_chat_${state.activeChannel}`);
      if (cached) {
        state.messages = JSON.parse(cached);
        renderMessages();
      }
    } catch (e) {}
  }
}

function renderMessages() {
  const container = document.getElementById('chatMessagesStream');
  if (!container) return;

  if (state.messages.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--grey-medium); margin-top: 60px; font-size: 0.9rem;">
        <i class="ph ph-chat-circle-dots" style="font-size: 2.5rem; color: var(--blue-light); margin-bottom: 8px;"></i>
        <div>No messages in this channel yet.</div>
        <p style="font-size: 0.78rem;">Send a message, share files, or record a voice note.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = state.messages.map(msg => {
    const isMe = state.currentUser && state.currentUser.id === msg.senderId;
    const timeFormatted = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    let attachmentHtml = '';
    if (msg.file) {
      attachmentHtml = `
        <div style="margin-top:8px; padding:10px 14px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid rgba(59,130,246,0.3); display:flex; align-items:center; justify-content:space-between; gap:10px;">
          <div style="font-size:1.3rem;">📁</div>
          <div style="flex:1; overflow:hidden;">
            <div style="font-size:0.82rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${msg.file.name}</div>
            <div style="font-size:0.72rem; color:var(--blue-light);">${msg.file.size}</div>
          </div>
          <a href="${msg.file.url}" download="${msg.file.name}" target="_blank" class="btn-sm-action" style="background:var(--blue-primary); color:#ffffff;">Download</a>
        </div>
      `;
    }

    let voiceHtml = '';
    if (msg.voice) {
      voiceHtml = `
        <div style="margin-top:8px; padding:8px 12px; border-radius:8px; background:rgba(0,0,0,0.3); border:1px solid rgba(16,185,129,0.3); display:flex; align-items:center; gap:8px;">
          <i class="ph ph-waveform" style="color:var(--green-light);"></i>
          <audio controls src="${msg.voice}" style="height:28px; width:220px;"></audio>
        </div>
      `;
    }

    let replyBoxHtml = '';
    if (msg.replyTo) {
      replyBoxHtml = `
        <div class="quoted-reply-box">
          <strong><i class="ph ph-arrow-bend-up-left"></i> ${escapeHtml(msg.replyTo.senderName || 'Staff')}</strong>
          <span class="quote-snippet">${escapeHtml(msg.replyTo.text || 'Attachment')}</span>
        </div>
      `;
    }

    let reactionsHtml = '';
    if (msg.reactions && Object.keys(msg.reactions).length > 0) {
      reactionsHtml = `
        <div class="msg-reactions-row">
          ${Object.entries(msg.reactions).map(([emoji, count]) => `
            <button class="reaction-pill" onclick="reactToMessage('${msg.id}', '${emoji}')" title="React with ${emoji}">
              <span>${emoji}</span> <span>${count}</span>
            </button>
          `).join('')}
        </div>
      `;
    }

    const actionsHtml = `
      <div class="msg-actions-bar">
        <button class="btn-msg-act" onclick="replyToMessage('${msg.id}')" title="Reply to message">
          <i class="ph ph-arrow-bend-up-left"></i> Reply
        </button>
        <button class="btn-msg-act" onclick="reactToMessage('${msg.id}', '👍')" title="Thumbs Up">👍</button>
        <button class="btn-msg-act" onclick="reactToMessage('${msg.id}', '❤️')" title="Love">❤️</button>
        <button class="btn-msg-act" onclick="reactToMessage('${msg.id}', '🚀')" title="Rocket">🚀</button>
        <button class="btn-msg-act" onclick="reactToMessage('${msg.id}', '✅')" title="Done">✅</button>
        <button class="btn-msg-act" onclick="copyMessageText('${escapeQuotes(msg.text || '')}')" title="Copy Text">
          <i class="ph ph-copy"></i>
        </button>
        <button class="btn-msg-act" onclick="speakText('${escapeQuotes(msg.text || 'Message attachment')}')" title="Listen Aloud">
          <i class="ph ph-speaker-high"></i>
        </button>
      </div>
    `;

    return `
      <div class="message-bubble ${isMe ? 'outgoing' : 'incoming'}">
        <div class="message-meta">
          <strong>${msg.senderName}</strong>
          <span>${timeFormatted}</span>
        </div>
        <div class="message-content">
          ${replyBoxHtml}
          ${msg.text ? `<div>${escapeHtml(msg.text)}</div>` : ''}
          ${attachmentHtml}
          ${voiceHtml}
          ${reactionsHtml}
          ${actionsHtml}
        </div>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function replyToMessage(msgId) {
  const msg = state.messages.find(m => m.id === msgId);
  if (!msg) return;
  state.replyingTo = {
    id: msg.id,
    senderName: msg.senderName,
    text: msg.text || (msg.file ? `File: ${msg.file.name}` : 'Voice Note')
  };
  const banner = document.getElementById('replyingToBanner');
  const authorEl = document.getElementById('replyingToAuthor');
  const snippetEl = document.getElementById('replyingToSnippet');
  if (authorEl) authorEl.textContent = state.replyingTo.senderName;
  if (snippetEl) snippetEl.textContent = state.replyingTo.text;
  if (banner) banner.style.display = 'flex';
  const input = document.getElementById('chatMessageInput');
  if (input) input.focus();
}

function cancelReply() {
  state.replyingTo = null;
  const banner = document.getElementById('replyingToBanner');
  if (banner) banner.style.display = 'none';
}

async function reactToMessage(msgId, emoji) {
  const user = state.currentUser ? (state.currentUser.name || state.currentUser.role) : 'Colleague';
  // Optimistic UI update
  const msg = state.messages.find(m => m.id === msgId);
  if (msg) {
    msg.reactions = msg.reactions || {};
    msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
    renderMessages();
  }

  try {
    await fetch(`/api/messages/${msgId}/react`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji, userName: user })
    });
  } catch (err) {
    console.warn('React error:', err);
  }
}

function copyMessageText(text) {
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    showNotification('📋 Message copied to clipboard!');
  });
}

// File Uploads & Media
async function handleFileSelect(event) {
  const file = event.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  const banner = document.getElementById('pendingAttachmentBanner');
  const nameEl = document.getElementById('pendingFileName');
  const sizeEl = document.getElementById('pendingFileSize');

  nameEl.textContent = `Uploading: ${file.name}...`;
  sizeEl.textContent = formatBytesJs(file.size);
  banner.style.display = 'flex';

  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const result = await res.json();
    if (result.success) {
      state.pendingFile = result.file;
      nameEl.textContent = result.file.name;
      sizeEl.textContent = `${result.file.size} (Ready to Send)`;
    } else {
      alert('Upload failed: ' + (result.error || 'Unknown error'));
      clearPendingAttachment();
    }
  } catch (err) {
    console.warn('File upload error:', err);
    alert('File upload failed.');
    clearPendingAttachment();
  }
}

function clearPendingAttachment() {
  state.pendingFile = null;
  document.getElementById('pendingAttachmentBanner').style.display = 'none';
  document.getElementById('fileUploadInput').value = '';
}

async function toggleVoiceRecording() {
  const btn = document.getElementById('btnVoiceRecord');
  if (!state.isRecordingVoice) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      state.mediaRecorder = new MediaRecorder(stream);
      state.audioChunks = [];

      state.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) state.audioChunks.push(e.data);
      };

      state.mediaRecorder.onstop = () => {
        const audioBlob = new Blob(state.audioChunks, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          state.pendingVoiceBlob = reader.result;
          document.getElementById('previewAudioElement').src = reader.result;
          document.getElementById('pendingVoiceBanner').style.display = 'flex';
        };
      };

      state.mediaRecorder.start();
      state.isRecordingVoice = true;
      btn.style.color = 'var(--red-danger)';
      showNotification('Recording voice note... Click mic again to stop.');
    } catch (err) {
      alert('Microphone access denied.');
    }
  } else {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
      state.mediaRecorder.stop();
      state.mediaRecorder.stream.getTracks().forEach(t => t.stop());
    }
    state.isRecordingVoice = false;
    btn.style.color = '#ffffff';
  }
}

function clearPendingVoice() {
  state.pendingVoiceBlob = null;
  document.getElementById('pendingVoiceBanner').style.display = 'none';
}

function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    state.speechRecognition = new SpeechRecognition();
    state.speechRecognition.continuous = false;
    state.speechRecognition.lang = 'en-US';

    state.speechRecognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      const input = document.getElementById('chatMessageInput');
      input.value = (input.value ? input.value + ' ' : '') + transcript;
    };
    state.speechRecognition.onend = () => {
      state.isDictating = false;
      document.getElementById('btnSpeechDictation').style.color = '#ffffff';
    };
  }
}

function toggleVoiceDictation() {
  if (!state.speechRecognition) {
    alert('Web Speech Recognition API is not supported in this browser.');
    return;
  }
  const btn = document.getElementById('btnSpeechDictation');
  if (!state.isDictating) {
    try {
      state.speechRecognition.start();
      state.isDictating = true;
      btn.style.color = 'var(--blue-light)';
      document.getElementById('speechStatusHint').textContent = 'Listening... Speak now.';
    } catch (e) { console.warn(e); }
  } else {
    state.speechRecognition.stop();
    state.isDictating = false;
    btn.style.color = '#ffffff';
  }
}

function speakText(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    window.speechSynthesis.speak(utterance);
  }
}

async function sendChatMessage() {
  const input = document.getElementById('chatMessageInput');
  const text = input.value.trim();

  if (!text && !state.pendingFile && !state.pendingVoiceBlob) return;

  const senderName = state.currentUser ? (state.currentUser.name || state.currentUser.role) : 'TIA Member';

  const payload = {
    channel: state.activeChannel,
    senderId: state.currentUser ? state.currentUser.id : 'role_user',
    senderName: senderName,
    role: state.currentUser ? state.currentUser.role : 'Executive',
    text: text,
    replyTo: state.replyingTo,
    file: state.pendingFile,
    voice: state.pendingVoiceBlob
  };

  const newMsg = {
    id: 'msg_' + Date.now(),
    channel: state.activeChannel,
    senderId: state.currentUser ? state.currentUser.id : 'role_user',
    senderName: senderName,
    role: state.currentUser ? state.currentUser.role : 'Executive',
    text: text,
    replyTo: state.replyingTo,
    file: state.pendingFile,
    voice: state.pendingVoiceBlob,
    timestamp: new Date().toISOString()
  };

  state.messages.push(newMsg);
  try { localStorage.setItem(`tia_chat_${state.activeChannel}`, JSON.stringify(state.messages)); } catch (e) {}
  renderMessages();

  input.value = '';
  cancelReply();
  clearPendingAttachment();
  clearPendingVoice();

  try {
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    console.warn('Network sync for message delayed, saved locally:', err);
  }
}

function handleChatKeyDown(e) {
  if (e.key === 'Enter') sendChatMessage();
}

// ===================================================================
// COURSES & STUDENTS
// ===================================================================
async function loadCourses() {
  try {
    const res = await fetch('/api/courses');
    state.courses = await res.json();
    renderCourses();
    populateCourseSelect();
  } catch (err) {
    console.warn('Failed to load courses:', err);
  }
}

function renderCourses() {
  const container = document.getElementById('coursesGridContainer');
  if (!container) return;

  container.innerHTML = state.courses.map(crs => `
    <div class="card" style="display:flex; flex-direction:column; justify-content:space-between; margin-bottom:0;">
      <div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
          <span class="badge badge-blue">${crs.badge || 'Professional'}</span>
          <span style="font-size:1.25rem; font-weight:800; color:var(--blue-light);">₹${crs.fees.toLocaleString('en-IN')}</span>
        </div>
        <h3 style="font-size:1.15rem; margin-bottom:6px;">${crs.title}</h3>
        <p style="font-size:0.8rem; color:var(--green-light); margin-bottom:8px;">
          <i class="ph ph-tag"></i> ${crs.category} • <i class="ph ph-hourglass"></i> ${crs.duration}
        </p>
        <p style="font-size:0.84rem; color:var(--grey-light); margin-bottom:14px; line-height:1.45;">
          ${crs.description}
        </p>
      </div>

      <div style="border-top:1px solid var(--border-subtle); padding-top:14px; margin-top:12px;">
        <div style="display:flex; justify-content:space-between; font-size:0.78rem; color:var(--grey-medium); margin-bottom:12px;">
          <span>Instructor: <strong>${crs.instructor}</strong></span>
          <span>Enrolled: <strong>${crs.enrolledCount || 0}/${crs.seats || 25}</strong></span>
        </div>
        <button class="btn-send" style="width:100%; justify-content:center; height:38px;" onclick="openEnrollForCourse('${crs.id}')">
          <i class="ph ph-user-plus"></i> Enroll Student
        </button>
      </div>
    </div>
  `).join('');
}

function populateCourseSelect() {
  const sel = document.getElementById('stuCourseSelect');
  if (!sel) return;
  sel.innerHTML = state.courses.map(c => `
    <option value="${c.id}" data-fees="${c.fees}" data-title="${c.title}">
      ${c.title} (₹${c.fees.toLocaleString('en-IN')})
    </option>
  `).join('');
}

function openAddCourseModal() {
  openModal('modalAddCourse');
}

async function saveNewCourse() {
  const title = document.getElementById('crsTitle').value;
  const category = document.getElementById('crsCategory').value;
  const duration = document.getElementById('crsDuration').value;
  const fees = document.getElementById('crsFees').value;
  const instructor = document.getElementById('crsInstructor').value;
  const description = document.getElementById('crsDescription').value;

  if (!title) return alert('Course Title required');

  try {
    const res = await fetch('/api/courses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, category, duration, fees, instructor, description })
    });
    const newCourse = await res.json();
    closeModal('modalAddCourse');
    await loadCourses();
    showNotification(`New course published: ${newCourse.title}`);
  } catch (e) { console.warn(e); }
}

// Students Management
async function loadStudents() {
  try {
    const res = await fetch('/api/students');
    state.students = await res.json();
    renderStudentKpis();
    renderStudentsTables();
  } catch (err) {
    console.warn('Failed to load students:', err);
  }
}

function renderStudentKpis() {
  const total = state.students.all.length;
  const ongoing = state.students.ongoing.length;
  const completed = state.students.completed.length;
  const totalFees = state.students.all.reduce((acc, s) => acc + (s.paidFees || 0), 0);

  document.getElementById('kpiTotalStudents').textContent = total;
  document.getElementById('kpiOngoingStudents').textContent = ongoing;
  document.getElementById('kpiCompletedStudents').textContent = completed;
  document.getElementById('kpiFeesCollected').textContent = `₹${totalFees.toLocaleString('en-IN')}`;
}

function switchStudentSubTab(tab) {
  state.studentSubTab = tab;
  const btnOngoing = document.getElementById('btnStudentSubOngoing');
  const btnCompleted = document.getElementById('btnStudentSubCompleted');
  const viewOngoing = document.getElementById('subview-ongoing-students');
  const viewCompleted = document.getElementById('subview-completed-students');

  if (tab === 'ongoing') {
    btnOngoing.classList.add('active');
    btnCompleted.classList.remove('active');
    viewOngoing.style.display = 'block';
    viewCompleted.style.display = 'none';
  } else {
    btnOngoing.classList.remove('active');
    btnCompleted.classList.add('active');
    viewOngoing.style.display = 'none';
    viewCompleted.style.display = 'block';
  }
}

function renderStudentsTables() {
  const ongoingTbody = document.getElementById('ongoingStudentsTableBody');
  if (state.students.ongoing.length === 0) {
    ongoingTbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--grey-medium);"><i class="ph ph-student" style="font-size:2rem; color:var(--blue-light); display:block; margin-bottom:6px;"></i>No ongoing students currently registered. Click "Enroll Student (Admin)" above.</td></tr>`;
  } else {
    ongoingTbody.innerHTML = state.students.ongoing.map(stu => `
      <tr>
        <td>
          <div style="font-weight:700; color:#ffffff;">${stu.name}</div>
          <div style="font-size:0.75rem; color:var(--grey-medium);">${stu.id} • ${stu.phone}</div>
        </td>
        <td><div style="font-weight:600; color:var(--blue-light);">${stu.courseName}</div></td>
        <td><div style="font-size:0.8rem;">${stu.startDate} <span style="color:var(--grey-medium);">to</span> ${stu.endDate}</div></td>
        <td>₹${Number(stu.totalFees).toLocaleString('en-IN')}</td>
        <td style="color:var(--green-light); font-weight:700;">₹${Number(stu.paidFees).toLocaleString('en-IN')}</td>
        <td style="color:${stu.balanceFees > 0 ? '#f59e0b' : '#94a3b8'}; font-weight:700;">₹${Number(stu.balanceFees).toLocaleString('en-IN')}</td>
        <td><span class="badge ${stu.balanceFees === 0 ? 'badge-green' : 'badge-blue'}">${stu.paymentStatus}</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm-action" onclick="generateAndShowInvoice('${stu.id}')" title="Print/Download Receipt">
              <i class="ph ph-receipt"></i> Bill Receipt
            </button>
            <button class="btn-sm-action" onclick="markStudentCompleted('${stu.id}')" title="Mark Completed & Auto-Shift">
              <i class="ph ph-check"></i> Complete
            </button>
          </div>
        </td>
      </tr>
    `).join('');
  }

  const completedTbody = document.getElementById('completedStudentsTableBody');
  if (state.students.completed.length === 0) {
    completedTbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:32px; color:var(--grey-medium);"><i class="ph ph-certificate" style="font-size:2rem; color:var(--green-light); display:block; margin-bottom:6px;"></i>No completed students archived yet. Completed batches shift here automatically!</td></tr>`;
  } else {
    completedTbody.innerHTML = state.students.completed.map(stu => `
      <tr>
        <td>
          <div style="font-weight:700; color:#ffffff;">${stu.name}</div>
          <div style="font-size:0.75rem; color:var(--grey-medium);">${stu.id} • ${stu.email}</div>
        </td>
        <td><div style="font-weight:600; color:var(--blue-light);">${stu.courseName}</div></td>
        <td><div style="font-size:0.82rem; color:var(--green-light);"><i class="ph ph-calendar-check"></i> ${stu.completionDate || stu.endDate}</div></td>
        <td style="color:var(--green-light); font-weight:700;">₹${Number(stu.paidFees).toLocaleString('en-IN')}</td>
        <td><span class="badge badge-blue" style="font-family:monospace;">${stu.certificateId || 'CERT-ISSUED'}</span></td>
        <td><span class="badge badge-green"><i class="ph ph-seal-check"></i> Certified</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-sm-action" onclick="generateAndShowInvoice('${stu.id}')"><i class="ph ph-receipt"></i> Invoice</button>
            <button class="btn-sm-action" style="background:rgba(16,185,129,0.2); border-color:var(--green-primary);" onclick="generateAndShowCertificate('${stu.id}')"><i class="ph ph-certificate"></i> Certificate</button>
          </div>
        </td>
      </tr>
    `).join('');
  }
}

function openAddStudentModal() {
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  document.getElementById('stuStartDate').value = today;
  document.getElementById('stuEndDate').value = nextMonth;
  handleStudentCourseChange();
  openModal('modalAddStudent');
}

function openEnrollForCourse(courseId) {
  switchTab('students');
  openAddStudentModal();
  const sel = document.getElementById('stuCourseSelect');
  sel.value = courseId;
  handleStudentCourseChange();
}

function handleStudentCourseChange() {
  const sel = document.getElementById('stuCourseSelect');
  const opt = sel.options[sel.selectedIndex];
  if (!opt) return;

  const fees = opt.getAttribute('data-fees') || 18500;
  document.getElementById('stuTotalFees').value = fees;
  document.getElementById('stuPaidFees').value = fees;
  calculateBalance();
}

function calculateBalance() {
  const total = Number(document.getElementById('stuTotalFees').value) || 0;
  const paid = Number(document.getElementById('stuPaidFees').value) || 0;
  const balance = Math.max(0, total - paid);
  document.getElementById('stuBalanceFees').value = balance;
}

async function saveNewStudent() {
  const name = document.getElementById('stuName').value.trim();
  const email = document.getElementById('stuEmail').value.trim();
  const phone = document.getElementById('stuPhone').value.trim();
  const sel = document.getElementById('stuCourseSelect');
  const opt = sel.options[sel.selectedIndex];
  const courseId = sel.value;
  const courseName = opt ? opt.getAttribute('data-title') : 'TIA Course';

  const startDate = document.getElementById('stuStartDate').value;
  const endDate = document.getElementById('stuEndDate').value;
  const totalFees = document.getElementById('stuTotalFees').value;
  const paidFees = document.getElementById('stuPaidFees').value;
  const paymentMethod = document.getElementById('stuPaymentMethod').value;
  const notes = document.getElementById('stuNotes').value;

  if (!name) return alert('Please enter student name.');

  const payload = {
    name, email, phone, courseId, courseName, startDate, endDate, totalFees, paidFees, paymentMethod, notes
  };

  try {
    const res = await fetch('/api/students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const newStu = await res.json();
    closeModal('modalAddStudent');
    await loadStudents();
    showNotification(`Student enrolled: ${newStu.name}`);
    generateAndShowInvoice(newStu.id);
  } catch (err) { console.warn(err); }
}

async function markStudentCompleted(studentId) {
  try {
    const res = await fetch(`/api/students/${studentId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'Completed',
        completionDate: new Date().toISOString().split('T')[0]
      })
    });
    const updated = await res.json();
    await loadStudents();
    showNotification(`${updated.name} shifted to Completed Students archive!`);
    switchStudentSubTab('completed');
  } catch (err) { console.warn(err); }
}

// Invoice Generator (GSTIN: 37EYLPM8018M1ZN)
function generateAndShowInvoice(studentId) {
  const stu = state.students.all.find(s => s.id === studentId);
  if (!stu) return;

  const invoiceContainer = document.getElementById('printableInvoiceContent');
  const baseFees = Math.round(stu.totalFees / 1.18);
  const gstAmount = stu.totalFees - baseFees;

  invoiceContainer.innerHTML = `
    <div class="invoice-header-row">
      <div class="invoice-brand">
        <img src="/assets/tia_logo_circle.png" alt="TIA Logo" class="invoice-logo-img">
        <div class="invoice-brand-text">
          <h2>TIRUPATI INTELLECT AUTHORITY</h2>
          <div class="tagline">Empowering Tirupati with AI • Academy of Technology</div>
          <div class="ceo-cred">CEO • M. Bhargav Rayudu | B.Tech Mechatronics • CAD Diploma</div>
          <div style="font-size:0.75rem; color:#475569; margin-top:2px;">
            Tirupati Intellect Authority Online, Tech Park Road, Tirupati, Andhra Pradesh - 517501
          </div>
        </div>
      </div>
      <div class="invoice-meta">
        <h3>OFFICIAL BILL RECEIPT</h3>
        <p><strong>Invoice No:</strong> ${stu.invoiceNo || 'TIA-INV-2026-001'}</p>
        <p><strong>Date:</strong> ${stu.invoiceDate || new Date().toISOString().split('T')[0]}</p>
        <p><strong>GSTIN:</strong> 37EYLPM8018M1ZN</p>
      </div>
    </div>

    <div class="invoice-details-grid">
      <div class="invoice-box">
        <h4>Billed To (Student Information)</h4>
        <p><strong>Name:</strong> ${stu.name}</p>
        <p><strong>Student ID:</strong> ${stu.id}</p>
        <p><strong>Phone:</strong> ${stu.phone || '--'}</p>
        <p><strong>Email:</strong> ${stu.email || '--'}</p>
      </div>
      <div class="invoice-box">
        <h4>Course & Batch Information</h4>
        <p><strong>Program:</strong> ${stu.courseName}</p>
        <p><strong>Batch Duration:</strong> ${stu.startDate} to ${stu.endDate}</p>
        <p><strong>Status:</strong> ${stu.status}</p>
      </div>
    </div>

    <table class="invoice-table">
      <thead>
        <tr>
          <th>Description of Services & Curriculum</th>
          <th>HSN/SAC</th>
          <th style="text-align: right;">Base Fee (₹)</th>
          <th style="text-align: right;">18% GST (₹)</th>
          <th style="text-align: right;">Total (₹)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>
            <strong>${stu.courseName}</strong><br>
            <span style="font-size:0.75rem; color:#64748b;">Professional hands-on engineering certification.</span>
          </td>
          <td>999293</td>
          <td style="text-align: right;">₹${baseFees.toLocaleString('en-IN')}</td>
          <td style="text-align: right;">₹${gstAmount.toLocaleString('en-IN')}</td>
          <td style="text-align: right; font-weight:700;">₹${stu.totalFees.toLocaleString('en-IN')}</td>
        </tr>
      </tbody>
    </table>

    <div class="invoice-totals">
      <table class="invoice-totals-table">
        <tr>
          <td>Subtotal (Tuition & Lab):</td>
          <td style="text-align: right;">₹${baseFees.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td>Taxes (18% GST):</td>
          <td style="text-align: right;">₹${gstAmount.toLocaleString('en-IN')}</td>
        </tr>
        <tr class="grand-total">
          <td>Total Course Fee:</td>
          <td style="text-align: right;">₹${stu.totalFees.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="color:#059669; font-weight:700;">Amount Received:</td>
          <td style="text-align: right; color:#059669; font-weight:700;">₹${stu.paidFees.toLocaleString('en-IN')}</td>
        </tr>
        <tr>
          <td style="color:${stu.balanceFees > 0 ? '#d97706' : '#64748b'}; font-weight:700;">Balance Due:</td>
          <td style="text-align: right; color:${stu.balanceFees > 0 ? '#d97706' : '#64748b'}; font-weight:700;">₹${stu.balanceFees.toLocaleString('en-IN')}</td>
        </tr>
      </table>
    </div>

    <div class="invoice-footer-row">
      <div>
        <div class="stamp-box">
          <i class="ph ph-seal-check"></i> ${stu.paymentStatus}
        </div>
        <div style="font-size:0.74rem; color:#64748b; margin-top:8px;">
          GSTIN: <strong>37EYLPM8018M1ZN</strong> | Authorized computer receipt.
        </div>
      </div>
      <div class="signature-box">
        <div class="signature-line">M. Bhargav Rayudu</div>
        <div class="signature-title">
          <strong>M. Bhargav Rayudu</strong><br>
          CEO & Founder, Tirupati Intellect Authority<br>
          B.Tech Mechatronics • CAD Diploma
        </div>
      </div>
    </div>
  `;

  openModal('modalInvoice');
}

function generateAndShowCertificate(studentId) {
  const stu = state.students.all.find(s => s.id === studentId);
  if (!stu) return;

  const certContainer = document.getElementById('printableCertificateContent');

  certContainer.innerHTML = `
    <div style="margin-bottom: 20px;">
      <img src="/assets/tia_logo_circle.png" alt="TIA Logo" style="width: 90px; height: 90px; border-radius: 50%; border: 3px solid #2563eb; margin: 0 auto; display: block;">
      <h1 style="color: #090e1a; font-size: 1.85rem; margin-top: 12px; letter-spacing: 0.05em;">TIRUPATI INTELLECT AUTHORITY</h1>
      <div style="color: #2563eb; font-size: 0.85rem; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase;">
        Empowering Tirupati with AI
      </div>
    </div>

    <div style="font-size: 1.6rem; color: #2563eb; font-family: 'Brush Script MT', serif; margin: 16px 0;">
      Certificate of Professional Competency
    </div>

    <p style="font-size: 0.95rem; color: #475569;">This is to certify that</p>
    <h2 style="font-size: 1.85rem; color: #090e1a; margin: 12px 0; text-decoration: underline; text-decoration-color: #2563eb;">
      ${stu.name}
    </h2>
    <p style="font-size: 0.95rem; color: #475569; max-width: 600px; margin: 0 auto 16px auto;">
      has successfully completed the intensive technical course in
    </p>
    <h3 style="font-size: 1.35rem; color: #090e1a; margin-bottom: 12px;">
      ${stu.courseName}
    </h3>

    <div style="display: flex; justify-content: space-around; align-items: flex-end; margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 24px;">
      <div style="text-align: center;">
        <div style="font-weight: 700; color: #090e1a; font-family: monospace;">${stu.certificateId || 'TIA-CERT-2026-VAL'}</div>
        <div style="font-size: 0.72rem; color: #64748b;">Verification ID</div>
      </div>
      <div style="text-align: center;">
        <div style="font-weight: 700; color: #090e1a;">${stu.completionDate || stu.endDate}</div>
        <div style="font-size: 0.72rem; color: #64748b;">Date of Issue</div>
      </div>
      <div style="text-align: center;">
        <div style="font-family: 'Brush Script MT', cursive; font-size: 1.6rem; color: #090e1a;">M. Bhargav Rayudu</div>
        <div style="font-size: 0.72rem; color: #64748b;">CEO, Tirupati Intellect Authority</div>
      </div>
    </div>
  `;

  openModal('modalCertificate');
}

// ===================================================================
// SOFTWARE FORGE & DEV TOOLS (Scaffold & Code Bug Fixer)
// ===================================================================
async function generateSoftwareScaffold() {
  const templateType = document.getElementById('scaffoldType').value;
  const projectName = document.getElementById('scaffoldProjectName').value;
  const description = document.getElementById('scaffoldDescription').value;

  try {
    const res = await fetch('/api/tools/scaffold', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateType, projectName, description })
    });
    const result = await res.json();
    if (result.success) {
      state.activeScaffold = result;
      renderScaffoldResults(result);
    }
  } catch (e) { console.warn(e); }
}

function renderScaffoldResults(data) {
  const view = document.getElementById('scaffoldResultsView');
  const tabsContainer = document.getElementById('scaffoldFilesTabs');
  const codeBox = document.getElementById('scaffoldCodeDisplay');

  view.style.display = 'block';
  tabsContainer.innerHTML = '';

  const files = data.template.files;
  files.forEach((f, idx) => {
    const btn = document.createElement('button');
    btn.className = `btn-sm-action ${idx === 0 ? 'active' : ''}`;
    btn.textContent = f.name;
    btn.onclick = () => {
      document.querySelectorAll('#scaffoldFilesTabs button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      codeBox.value = f.content;
    };
    tabsContainer.appendChild(btn);
  });

  if (files.length > 0) codeBox.value = files[0].content;
}

function downloadScaffoldBundle() {
  if (!state.activeScaffold) return;
  const files = state.activeScaffold.template.files;
  let bundleText = `=== TIA SOFTWARE FORGE GENERATED ARCHITECTURE ===\nProject: ${state.activeScaffold.projectName}\nStack: ${state.activeScaffold.template.stack}\n==================================================\n\n`;

  files.forEach(f => {
    bundleText += `\n--- [FILE: ${f.name}] ---\n${f.content}\n`;
  });

  const blob = new Blob([bundleText], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${state.activeScaffold.projectName}-architecture.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

async function runSoftwareDiagnostic() {
  const code = document.getElementById('fixInputCode').value;
  const language = document.getElementById('fixLanguage').value;
  const errorDescription = document.getElementById('fixErrorDescription').value;

  if (!code.trim()) return alert('Please enter code to diagnose.');

  try {
    const res = await fetch('/api/tools/diagnose-and-fix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language, errorDescription })
    });
    const result = await res.json();
    if (result.success) {
      document.getElementById('diagnosticResultsArea').style.display = 'block';
      document.getElementById('diagStatusBadge').textContent = result.diagnostics.status;
      document.getElementById('diagIssueCount').textContent = `${result.diagnostics.issueCount} Issues Repaired`;
      document.getElementById('diagExplanation').textContent = result.diagnostics.explanation;
      document.getElementById('diagCorrectedCode').value = result.diagnostics.correctedCode;
    }
  } catch (e) { console.warn(e); }
}

function loadSampleBuggyCode() {
  document.getElementById('fixInputCode').value = `function streamTelemetry(sensorId) {
    var rawValues = [24.5, 26.2, 28.9]
    var payload = { id: sensorId, data: rawValues }
    fetch('/api/telemetry', { method: 'POST', body: JSON.stringify(payload) })
    return payload
`;
  document.getElementById('fixLanguage').value = 'javascript';
  document.getElementById('fixErrorDescription').value = 'Missing bracket syntax and unhandled async fetch';
}

function copyFixedCode() {
  navigator.clipboard.writeText(document.getElementById('diagCorrectedCode').value).then(() => {
    showNotification('Corrected code copied to clipboard!');
  });
}

function sendFixedCodeToSandbox() {
  const code = document.getElementById('diagCorrectedCode').value;
  document.getElementById('sandboxCodeInput').value = `<div style="padding:20px; font-family:sans-serif; background:#0f172a; color:#ffffff; border-radius:10px; border:2px solid #2563eb;">
  <h3 style="color:#60a5fa;">TIA Verified Code</h3>
  <pre style="background:#020617; padding:12px; border-radius:6px; color:#34d399; font-size:12px; overflow-x:auto;">${escapeHtml(code)}</pre>
</div>`;
  executeSandboxCode();
  showNotification('Sent code to live preview sandbox!');
}

function initSandbox() {
  executeSandboxCode();
}

function executeSandboxCode() {
  const input = document.getElementById('sandboxCodeInput').value;
  const frame = document.getElementById('sandboxPreviewFrame');
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(input);
  doc.close();
}

// ===================================================================
// WEBSOCKET & HELPERS
// ===================================================================
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    state.ws = new WebSocket(wsUrl);
    state.ws.onopen = () => { sendPresencePing(true); };
    state.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'presence_updated') {
          const emp = data.payload.employee;
          const idx = state.employees.findIndex(e => e.id === emp.id);
          if (idx !== -1) {
            state.employees[idx] = emp;
          } else {
            state.employees.push(emp);
          }
          renderEmployeeGrid();
          renderChatStaffList();
          updatePresenceBadges();
        } else if (data.event === 'new_message') {
          const msg = data.payload;
          const isGeneral = msg.channel === 'general' || msg.channel === 'role_ceo';
          const isDmForMe = msg.channel.startsWith('dm_') && state.currentUser && msg.channel.includes(state.currentUser.id);
          const isMyActiveDm = isDmForMe && state.activeChannel === msg.channel;
          const isMyActiveGeneral = isGeneral && state.activeChannel === 'general';

          if (isMyActiveGeneral || isMyActiveDm || msg.channel === state.activeChannel) {
            if (!state.messages.some(m => m.id === msg.id)) {
              state.messages.push(msg);
              renderMessages();
            }
          } else if (isGeneral && state.activeChannel !== 'general') {
            showNotification(`📢 All-Hands (${msg.senderName}): "${msg.text ? msg.text.substring(0, 35) : 'Attachment'}"`);
          } else if (isDmForMe) {
            showNotification(`💬 Message from ${msg.senderName}: "${msg.text ? msg.text.substring(0, 35) : 'Attachment'}"`);
          }
        } else if (data.event === 'employee_updated' || data.event === 'employee_added') {
          const updated = data.payload.employee;
          const idx = state.employees.findIndex(e => e.id === updated.id);
          if (idx !== -1) {
            state.employees[idx] = updated;
          } else {
            state.employees.push(updated);
          }
          if (state.currentUser && state.currentUser.id === updated.id) {
            state.currentUser = { ...state.currentUser, ...updated };
            localStorage.setItem('tia_session', JSON.stringify(state.currentUser));
            updateAuthUI();
          }
          renderEmployeeGrid();
          renderChatStaffList();
        } else if (data.event === 'employee_deleted') {
          const { employeeId } = data.payload;
          state.employees = state.employees.filter(e => e.id !== employeeId);
          if (state.currentUser && state.currentUser.id === employeeId) {
            performLogout();
          }
          renderEmployeeGrid();
          renderChatStaffList();
        } else if (data.event === 'message_reaction') {
          const { messageId, reactions } = data.payload;
          const targetMsg = state.messages.find(m => m.id === messageId);
          if (targetMsg) {
            targetMsg.reactions = reactions;
            renderMessages();
          }
        } else if (data.event === 'attendance_clock_in' || data.event === 'attendance_clock_out') {
          loadAttendance();
          loadEmployees();
        } else if (data.event === 'attendance_cleared') {
          showNotification(`🧹 Attendance logs cleared by ${data.payload.clearedBy || 'Authorized Executive'}`);
          loadAttendance();
          loadEmployees();
          updateAuthUI();
        } else if (data.event === 'auto_eod_checkout') {
          showNotification(data.payload?.message || '🌙 10:00 PM IST: Automated Shift Checkout & Logout executed.');
          loadAttendance();
          loadEmployees();
          if (state.currentUser) {
            performLogout();
          }
        }
      } catch (e) {}
    };
    state.ws.onerror = () => {};
    state.ws.onclose = () => { setTimeout(initWebSocket, 3000); };
  } catch (e) {}
}

// Client-Side Automated 10:00 PM IST EOD Shift Check-Out & Logout
let clientAutoLogoutDate = '';
setInterval(() => {
  if (!state.currentUser) return;
  try {
    const now = new Date();
    const istParts = new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      hour: 'numeric',
      minute: 'numeric',
      hour12: false
    }).formatToParts(now);

    const hour = parseInt(istParts.find(p => p.type === 'hour')?.value || '0', 10);
    const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (hour >= 22 && clientAutoLogoutDate !== dateStr) {
      clientAutoLogoutDate = dateStr;
      showNotification('🌙 10:00 PM IST: Shift completed. Automated checkout & sign out complete.');
      performLogout();
      loadAttendance();
    }
  } catch (e) {}
}, 30000);

function sendPresencePing(isOnline) {
  if (state.ws && state.ws.readyState === WebSocket.OPEN && state.currentUser) {
    state.ws.send(JSON.stringify({
      event: 'presence',
      payload: { employeeId: state.currentUser.id, online: isOnline, status: isOnline ? 'online' : 'offline' }
    }));
  }
}

function setupPresenceTracking() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendPresencePing(true);
    } else {
      sendPresencePing(true);
    }
  });
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function openDownloadAppModal() {
  if (detectAppMode()) {
    showNotification('📱 You are already running the installed TIA Mobile App.');
    return;
  }
  openModal('modalDownloadApp');
  const targetUrl = window.location.origin.includes('localhost') 
    ? 'https://tia-tirupati-intellect-authority.onrender.com' 
    : window.location.origin;
  const qrImg = document.getElementById('qrCodeImg');
  if (qrImg) {
    qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(targetUrl)}`;
  }
  const display = document.getElementById('qrTargetUrlDisplay');
  if (display) {
    display.textContent = targetUrl;
  }
}

function showNotification(msg) {
  const banner = document.createElement('div');
  banner.textContent = msg;
  banner.style.cssText = `
    position: fixed;
    bottom: 24px;
    right: 24px;
    background: #0f172a;
    color: #ffffff;
    border: 1px solid #2563eb;
    box-shadow: 0 10px 30px rgba(0,0,0,0.6);
    padding: 12px 20px;
    border-radius: 10px;
    z-index: 9999;
    font-size: 0.86rem;
    font-weight: 700;
    animation: fadeIn 0.3s ease-out;
  `;
  document.body.appendChild(banner);
  setTimeout(() => {
    banner.style.opacity = '0';
    banner.style.transition = 'opacity 0.4s';
    setTimeout(() => banner.remove(), 400);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function escapeQuotes(str) {
  if (!str) return '';
  return str.replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function formatBytesJs(bytes) {
  if (!+bytes) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}


// ===================================================================
// TIA IDE STUDIO • ADVANCED WORKBENCH ENGINE (LOCAL IDE SOFTWARE)
// Lead Architect: M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)
// Tirupati Intellect Authority • GSTIN: 37EYLPM8018M1ZN
// ===================================================================

function initIdeStudio() {
  const editor = document.getElementById('ideCodeEditor');
  const gutter = document.getElementById('ideGutter');
  const termInput = document.getElementById('terminalInput');

  if (editor) {
    editor.addEventListener('input', () => {
      if (state.ide.activeTab) {
        const tab = state.ide.openTabs.find(t => t.path === state.ide.activeTab);
        if (tab) {
          tab.content = editor.value;
          tab.dirty = true;
          renderEditorTabs();
        }
      }
      syncGutter();
    });

    editor.addEventListener('scroll', () => {
      if (gutter) gutter.scrollTop = editor.scrollTop;
    });

    editor.addEventListener('click', syncGutter);
    editor.addEventListener('keyup', syncGutter);

    // Tab key support in code editor
    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 2;
        editor.dispatchEvent(new Event('input'));
      }
    });
  }

  // Terminal Input Handler
  if (termInput) {
    termInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = termInput.value.trim();
        if (cmd) {
          state.ide.cmdHistory.push(cmd);
          state.ide.cmdHistoryIndex = state.ide.cmdHistory.length;
          executeTerminalCommand(cmd);
          termInput.value = '';
        }
      } else if (e.key === 'ArrowUp') {
        if (state.ide.cmdHistoryIndex > 0) {
          state.ide.cmdHistoryIndex--;
          termInput.value = state.ide.cmdHistory[state.ide.cmdHistoryIndex] || '';
        }
      } else if (e.key === 'ArrowDown') {
        if (state.ide.cmdHistoryIndex < state.ide.cmdHistory.length - 1) {
          state.ide.cmdHistoryIndex++;
          termInput.value = state.ide.cmdHistory[state.ide.cmdHistoryIndex] || '';
        } else {
          state.ide.cmdHistoryIndex = state.ide.cmdHistory.length;
          termInput.value = '';
        }
      }
    });
  }

  // Global Keyboard Shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl+S / Cmd+S -> Save
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      saveActiveFile();
    }
    // F5 -> Run
    if (e.key === 'F5') {
      e.preventDefault();
      runActiveFile();
    }
    // Shift+Alt+F -> Format
    if (e.shiftKey && e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      formatActiveCode();
    }
    // Ctrl+` -> Toggle Terminal
    if ((e.ctrlKey || e.metaKey) && e.key === '`') {
      e.preventDefault();
      toggleBottomDock();
    }
    // Ctrl+B -> Toggle Primary Side Bar (Open & Closable)
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
      e.preventDefault();
      toggleSidebar();
    }
    // Ctrl+E -> Toggle between IDE Code Studio and Enterprise Portal Mode
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
      e.preventDefault();
      toggleEnterpriseView();
    }
    // Ctrl+= or Ctrl++ -> Smooth Zoom In
    if ((e.ctrlKey || e.metaKey) && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    }
    // Ctrl+- -> Smooth Zoom Out
    if ((e.ctrlKey || e.metaKey) && e.key === '-') {
      e.preventDefault();
      zoomOut();
    }
    // Ctrl+0 -> Reset Zoom (100%)
    if ((e.ctrlKey || e.metaKey) && e.key === '0') {
      e.preventDefault();
      resetZoom();
    }
  });

  // Initialize Smooth Zoom Controller for Mouse Wheel / Trackpad
  initSmoothZoom();

  // Initialize Draggable Sidebar Resizer (Not Fixed Width)
  initSidebarResizer();

  // Initialize Workspace Tree and Open Starter File asynchronously
  scheduleTask(async () => {
    try {
      await loadWorkspaceTree();
      await openFileInEditor('index.html');
    } catch (e) {
      console.warn(e);
    }
  });
}

// Starter virtual files for instant non-blocking workspace display
const STARTER_WORKSPACE_FILES = [
  { name: 'index.html', path: 'index.html', type: 'file', extension: '.html' },
  { name: 'style.css', path: 'style.css', type: 'file', extension: '.css' },
  { name: 'app.js', path: 'app.js', type: 'file', extension: '.js' },
  { name: 'cad_spur_gear.py', path: 'cad_spur_gear.py', type: 'file', extension: '.py' },
  { name: 'robot_arm.py', path: 'robot_arm.py', type: 'file', extension: '.py' },
  { name: 'README.md', path: 'README.md', type: 'file', extension: '.md' }
];

const STARTER_FILE_CONTENTS = {
  'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>TIA Mechatronics & AI App</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="card">
    <h1>Tirupati Intellect Authority</h1>
    <p>Empowering Tirupati with AI, Robotics & CAD Automation</p>
    <button id="btnAction">Execute Kinematics</button>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
  'style.css': `body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: #050811;
  color: #f8fafc;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
}
.card {
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(59, 130, 246, 0.3);
  padding: 32px 40px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 10px 30px rgba(0,0,0,0.5);
}
button {
  background: #2563eb;
  color: white;
  border: none;
  padding: 10px 20px;
  font-weight: 700;
  border-radius: 6px;
  cursor: pointer;
  margin-top: 14px;
}`,
  'app.js': `console.log('TIA Mechatronics & AI Engine Initialized.');
document.getElementById('btnAction')?.addEventListener('click', () => {
  alert('Inverse Kinematics Solved: Joint 1 = 48.35°, Joint 2 = 72.10°');
});`,
  'cad_spur_gear.py': `# TIA CAD Automation: Involute Spur Gear Generator
import math

class SpurGear:
    def __init__(self, module=2.0, teeth=24, pressure_angle_deg=20.0):
        self.module = module
        self.teeth = teeth
        self.pitch_dia = module * teeth
        self.addendum = module
        self.dedendum = 1.25 * module
        self.outer_dia = self.pitch_dia + (2 * self.addendum)
        self.root_dia = self.pitch_dia - (2 * self.dedendum)

print("Spur Gear Calculated: Pitch Dia =", 2.0 * 24, "mm")`,
  'robot_arm.py': `# TIA 2-DOF Mechatronic Arm Inverse Kinematics
import math

def solve_ik(x, y, L1=150.0, L2=120.0):
    r = math.hypot(x, y)
    cos_q2 = (r**2 - L1**2 - L2**2) / (2 * L1 * L2)
    q2 = math.acos(max(-1.0, min(1.0, cos_q2)))
    q1 = math.atan2(y, x) - math.atan2(L2 * math.sin(q2), L1 + L2 * math.cos(q2))
    return math.degrees(q1), math.degrees(q2)

print("Target (100, 150): Joint Angles =", solve_ik(100, 150))`,
  'README.md': `# TIA Enterprise Studio Workspace
Welcome to Tirupati Intellect Authority's High-Performance Web & Mechatronics Code Environment.
- Press **F5** to run the active code in Live Web Runner.
- Press **Ctrl+S** to save changes.
- Press **Ctrl+E** to switch between IDE Studio & Enterprise Portal.
`
};

// 1. WORKSPACE FILE EXPLORER
async function loadWorkspaceTree() {
  const container = document.getElementById('workspaceTreeContainer');
  if (!container) return;

  try {
    const res = await fetch('/api/ide/files');
    const data = await res.json();
    if (data.success && Array.isArray(data.tree) && data.tree.length > 0) {
      state.ide.files = data.tree;
      renderFileTree(data.tree, container);
    } else {
      state.ide.files = STARTER_WORKSPACE_FILES;
      renderFileTree(STARTER_WORKSPACE_FILES, container);
    }
  } catch (err) {
    console.warn('Falling back to starter workspace files:', err);
    state.ide.files = STARTER_WORKSPACE_FILES;
    renderFileTree(STARTER_WORKSPACE_FILES, container);
  }
}

function renderFileTree(nodes, container, depth = 0) {
  if (depth === 0) container.innerHTML = '';

  nodes.forEach(node => {
    const el = document.createElement('div');
    el.className = `tree-node ${state.ide.activeTab === node.path ? 'active' : ''}`;
    el.style.paddingLeft = `${14 + (depth * 14)}px`;

    let iconClass = 'ph-file';
    let iconTypeClass = '';
    const ext = node.extension || '';

    if (node.type === 'directory') {
      iconClass = 'ph-folder';
      iconTypeClass = 'icon-folder';
    } else if (ext === '.html') {
      iconClass = 'ph-file-html';
      iconTypeClass = 'icon-html';
    } else if (ext === '.css') {
      iconClass = 'ph-file-css';
      iconTypeClass = 'icon-css';
    } else if (ext === '.js') {
      iconClass = 'ph-file-js';
      iconTypeClass = 'icon-js';
    } else if (ext === '.py') {
      iconClass = 'ph-file-py';
      iconTypeClass = 'icon-py';
    } else if (ext === '.json') {
      iconClass = 'ph-file-code';
      iconTypeClass = 'icon-json';
    } else if (ext === '.ino' || ext === '.cpp') {
      iconClass = 'ph-cpu';
      iconTypeClass = 'icon-js';
    } else if (ext === '.md') {
      iconClass = 'ph-file-text';
      iconTypeClass = 'icon-md';
    }

    el.innerHTML = `
      <i class="ph ${iconClass} tree-node-icon ${iconTypeClass}"></i>
      <span style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${node.name}</span>
      ${node.type !== 'directory' ? `
        <span onclick="deleteWorkspaceItem('${node.path}', event)" style="opacity:0; padding:2px; font-size:0.75rem; color:#f87171;" class="node-hover-del" title="Delete File">
          <i class="ph ph-trash"></i>
        </span>
      ` : ''}
    `;

    el.onmouseenter = () => {
      const del = el.querySelector('.node-hover-del');
      if (del) del.style.opacity = '1';
    };
    el.onmouseleave = () => {
      const del = el.querySelector('.node-hover-del');
      if (del) del.style.opacity = '0';
    };

    if (node.type === 'directory') {
      const childrenWrapper = document.createElement('div');
      childrenWrapper.style.display = 'block';
      el.onclick = (e) => {
        e.stopPropagation();
        const isOpen = childrenWrapper.style.display !== 'none';
        childrenWrapper.style.display = isOpen ? 'none' : 'block';
        el.querySelector('i').className = `ph ph-folder${isOpen ? '' : '-open'} tree-node-icon icon-folder`;
      };
      container.appendChild(el);
      container.appendChild(childrenWrapper);
      if (node.children) {
        renderFileTree(node.children, childrenWrapper, depth + 1);
      }
    } else {
      el.onclick = (e) => {
        e.stopPropagation();
        openFileInEditor(node.path);
      };
      container.appendChild(el);
    }
  });
}

// 2. MULTI-TAB CODE EDITOR
async function openFileInEditor(relPath) {
  let existing = state.ide.openTabs.find(t => t.path === relPath);
  if (!existing) {
    try {
      const res = await fetch(`/api/ide/file?path=${encodeURIComponent(relPath)}`);
      const fileData = await res.json();
      if (fileData && fileData.success) {
        existing = {
          path: fileData.path,
          name: fileData.name,
          content: fileData.content,
          extension: fileData.extension,
          dirty: false
        };
        state.ide.openTabs.push(existing);
      } else {
        throw new Error(fileData?.error || 'File load failed');
      }
    } catch (err) {
      console.warn('Populating starter content for file:', relPath);
      const ext = relPath.substring(relPath.lastIndexOf('.'));
      const fallbackContent = STARTER_FILE_CONTENTS[relPath] || `// ${relPath}\n// Tirupati Intellect Authority Workspace`;
      existing = {
        path: relPath,
        name: relPath.split('/').pop(),
        content: fallbackContent,
        extension: ext,
        dirty: false
      };
      state.ide.openTabs.push(existing);
    }
  }

  selectTab(existing.path);
}

function selectTab(path) {
  const tab = state.ide.openTabs.find(t => t.path === path);
  if (!tab) return;

  state.ide.activeTab = tab.path;
  const editor = document.getElementById('ideCodeEditor');
  if (editor) {
    editor.value = tab.content;
  }

  const activeNameEl = document.getElementById('toolbarActiveFileName');
  if (activeNameEl) activeNameEl.textContent = tab.name;

  const urlBar = document.getElementById('previewUrlBar');
  if (urlBar) urlBar.textContent = `${window.location.origin}/workspace/${tab.path}`;

  renderEditorTabs();
  syncGutter();
  updateLanguageBadge(tab.extension);

  // Update tree active highlight
  document.querySelectorAll('.tree-node').forEach(node => {
    node.classList.remove('active');
  });
  const nodes = document.querySelectorAll('.tree-node');
  nodes.forEach(node => {
    if (node.textContent.includes(tab.name)) node.classList.add('active');
  });

  // Switch from enterprise view if open
  hideEnterpriseView();
}

function renderEditorTabs() {
  const tabsBar = document.getElementById('ideTabsBar');
  if (!tabsBar) return;

  tabsBar.innerHTML = state.ide.openTabs.map(t => {
    const isActive = state.ide.activeTab === t.path;
    return `
      <div class="editor-tab ${isActive ? 'active' : ''}" onclick="selectTab('${t.path}')">
        <span>${t.name}</span>
        ${t.dirty ? '<span class="tab-dirty" title="Unsaved changes"></span>' : ''}
        <span class="tab-close" onclick="closeTab('${t.path}', event)" title="Close tab">✕</span>
      </div>
    `;
  }).join('');
}

function closeTab(path, event) {
  if (event) event.stopPropagation();
  const index = state.ide.openTabs.findIndex(t => t.path === path);
  if (index === -1) return;

  const tab = state.ide.openTabs[index];
  if (tab.dirty && !confirm(`${tab.name} has unsaved changes. Close anyway?`)) {
    return;
  }

  state.ide.openTabs.splice(index, 1);
  if (state.ide.activeTab === path) {
    if (state.ide.openTabs.length > 0) {
      const next = state.ide.openTabs[Math.max(0, index - 1)];
      selectTab(next.path);
    } else {
      state.ide.activeTab = null;
      const editor = document.getElementById('ideCodeEditor');
      if (editor) editor.value = '';
      syncGutter();
      renderEditorTabs();
    }
  } else {
    renderEditorTabs();
  }
}

// 3. FILE SAVING & CREATION
async function saveActiveFile() {
  if (!state.ide.activeTab) return;
  const tab = state.ide.openTabs.find(t => t.path === state.ide.activeTab);
  if (!tab) return;

  const editor = document.getElementById('ideCodeEditor');
  const content = editor ? editor.value : tab.content;

  try {
    const res = await fetch('/api/ide/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: tab.path, content })
    });
    const result = await res.json();
    if (result.success) {
      tab.dirty = false;
      tab.content = content;
      renderEditorTabs();
      showNotification(`✓ Saved ${tab.name} (${formatBytesJs(result.size)})`);

      // If live preview is active, reload preview
      if (state.ide.isLivePreview) {
        reloadLivePreview();
      }
    } else {
      alert(result.error || 'Failed to save file.');
    }
  } catch (err) {
    console.warn('Save error:', err);
    alert('Save request failed.');
  }
}

async function promptNewFile() {
  const name = prompt('Enter new file name with extension (e.g. main.js, styles.css):');
  if (!name || !name.trim()) return;

  try {
    const res = await fetch('/api/ide/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name.trim(), type: 'file', content: '' })
    });
    const result = await res.json();
    if (result.success) {
      await loadWorkspaceTree();
      await openFileInEditor(result.path);
      showNotification(`Created file ${name.trim()}`);
    } else {
      alert(result.error || 'Failed to create file.');
    }
  } catch (err) {
    console.warn('Create file error:', err);
  }
}

async function promptNewFolder() {
  const name = prompt('Enter new folder name:');
  if (!name || !name.trim()) return;

  try {
    const res = await fetch('/api/ide/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: name.trim(), type: 'directory' })
    });
    const result = await res.json();
    if (result.success) {
      await loadWorkspaceTree();
      showNotification(`Created folder ${name.trim()}`);
    } else {
      alert(result.error || 'Failed to create folder.');
    }
  } catch (err) {
    console.warn('Create folder error:', err);
  }
}

async function deleteWorkspaceItem(relPath, event) {
  if (event) event.stopPropagation();
  if (!confirm(`Are you sure you want to delete ${relPath}?`)) return;

  try {
    const res = await fetch('/api/ide/delete', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: relPath })
    });
    const result = await res.json();
    if (result.success) {
      closeTab(relPath);
      await loadWorkspaceTree();
      showNotification(`Deleted ${relPath}`);
    } else {
      alert(result.error || 'Delete failed.');
    }
  } catch (err) {
    console.warn('Delete error:', err);
  }
}

// 4. CODE RUNNER (JS / Python / Shell)
async function runActiveFile() {
  if (!state.ide.activeTab) {
    showNotification('No active file open in editor to run.');
    return;
  }

  // Auto-save active file
  await saveActiveFile();

  const tab = state.ide.openTabs.find(t => t.path === state.ide.activeTab);
  if (!tab) return;

  const editor = document.getElementById('ideCodeEditor');
  const code = editor ? editor.value : tab.content;
  const ext = (tab.extension || '').toLowerCase();

  let lang = 'javascript';
  if (ext === '.py') lang = 'python';
  if (ext === '.html') {
    toggleLivePreview(true);
    const iframe = document.getElementById('previewIframe');
    if (iframe) {
      iframe.srcdoc = code;
    }
    const urlBar = document.getElementById('previewUrlBar');
    if (urlBar) urlBar.textContent = `${window.location.origin}/workspace/${tab.path}`;
    showNotification(`Rendered ${tab.name} in Live Web Runner (F5)`);
    return;
  }

  switchDockTab('output');
  const consoleEl = document.getElementById('outputConsole');
  if (consoleEl) {
    consoleEl.textContent = `[Running] Executing ${tab.name} (${lang.toUpperCase()})...\n------------------------------------------------------\n`;
  }

  try {
    const res = await fetch('/api/ide/run-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, language: lang, filename: tab.name })
    });
    const result = await res.json();

    if (consoleEl) {
      let output = `[Running: ${tab.name}]\n`;
      output += `Language: ${lang.toUpperCase()} | Duration: ${result.durationMs || 10}ms\n`;
      output += `------------------------------------------------------\n`;
      if (result.stdout) output += result.stdout + '\n';
      if (result.stderr) output += `[Stderr / Warning]:\n${result.stderr}\n`;
      output += `------------------------------------------------------\n`;
      output += `[Process Exited with Code ${result.exitCode}]`;
      consoleEl.textContent = output;
    }
    showNotification(`Execution finished (${result.durationMs || 10}ms)`);
  } catch (err) {
    console.warn('Run code error:', err);
    if (consoleEl) consoleEl.textContent += `\n[Fatal Runner Error]: ${err.message}`;
  }
}

// 5. LIVE WEB PREVIEW
function toggleLivePreview(forceOpen = false) {
  const preview = document.getElementById('ideSplitPreview');
  if (!preview) return;

  if (forceOpen) {
    preview.classList.add('visible');
    state.ide.isLivePreview = true;
  } else {
    preview.classList.toggle('visible');
    state.ide.isLivePreview = preview.classList.contains('visible');
  }

  if (state.ide.isLivePreview) {
    reloadLivePreview();
  }
}

function reloadLivePreview() {
  const iframe = document.getElementById('previewIframe');
  const tab = state.ide.openTabs.find(t => t.path === state.ide.activeTab);
  const targetFile = (tab && tab.extension === '.html') ? tab.path : 'index.html';
  const editor = document.getElementById('ideCodeEditor');
  if (iframe) {
    if (tab && tab.extension === '.html' && editor && editor.value) {
      iframe.srcdoc = editor.value;
    } else {
      iframe.src = `/workspace/${targetFile}?_t=${Date.now()}`;
    }
  }
  const urlBar = document.getElementById('previewUrlBar');
  if (urlBar) urlBar.textContent = `${window.location.origin}/workspace/${targetFile}`;
}

// 6. INTEGRATED TERMINAL
async function executeTerminalCommand(cmd) {
  const historyEl = document.getElementById('terminalHistory');
  if (!historyEl) return;

  if (cmd === 'cls' || cmd === 'clear') {
    clearTerminalHistory();
    return;
  }

  historyEl.textContent += `\nPS E:\\workspace> ${cmd}\n`;
  historyEl.scrollTop = historyEl.scrollHeight;

  try {
    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command: cmd })
    });
    const result = await res.json();
    if (result.stdout) historyEl.textContent += result.stdout;
    if (result.stderr) historyEl.textContent += `[Error]: ${result.stderr}\n`;
    historyEl.textContent += `[Exit Code: ${result.exitCode} in ${result.durationMs}ms]\n`;
  } catch (err) {
    historyEl.textContent += `[Execution failed]: ${err.message}\n`;
  }
  historyEl.scrollTop = historyEl.scrollHeight;
}

function runQuickCmd(cmd) {
  switchDockTab('terminal');
  executeTerminalCommand(cmd);
}

function clearTerminalHistory() {
  const historyEl = document.getElementById('terminalHistory');
  if (historyEl) {
    historyEl.textContent = `TIA IDE Studio Terminal [Version 2.0.0]\nWorkspace: E:\\TIA portal\\workspace\nLocal shell ready (PowerShell / Windows CMD).\n`;
  }
}

function focusTerminal() {
  switchDockTab('terminal');
  const input = document.getElementById('terminalInput');
  if (input) input.focus();
}

// 7. SOFTWARE FORGE DIRECT DEPLOY TO WORKSPACE
async function forgeToWorkspace(templateType) {
  const name = prompt('Project Name:', 'Enterprise Mechatronics Suite') || 'New Project';
  try {
    const res = await fetch('/api/tools/forge/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateType,
        name,
        deployToWorkspace: true
      })
    });
    const result = await res.json();
    if (result.success) {
      await loadWorkspaceTree();
      if (result.template && result.template.files && result.template.files[0]) {
        await openFileInEditor(result.template.files[0].name);
      }
      showNotification(`🚀 Generated ${result.template.title} in workspace/`);
      setSidebarTab('explorer');
    }
  } catch (err) {
    console.warn('Forge deploy error:', err);
  }
}

// 8. CODE DIAGNOSER & FORMATTER
function diagnoseActiveCode() {
  const editor = document.getElementById('ideCodeEditor');
  if (!editor || !editor.value) {
    showNotification('No active code to diagnose.');
    return;
  }

  const code = editor.value;
  const issues = [];
  const lines = code.split('\n');

  // Syntax and structural checks
  let openBraces = 0;
  let openParens = 0;
  let openTags = 0;

  lines.forEach((line, idx) => {
    const lineNum = idx + 1;
    // Unmatched braces
    openBraces += (line.match(/{/g) || []).length;
    openBraces -= (line.match(/}/g) || []).length;

    openParens += (line.match(/\(/g) || []).length;
    openParens -= (line.match(/\)/g) || []).length;

    // Checks for dangerous patterns or empty handlers
    if (line.includes('console.log') && line.includes('TODO')) {
      issues.push(`Line ${lineNum}: Unresolved TODO marker.`);
    }
    if (line.includes('eval(')) {
      issues.push(`Line ${lineNum}: Insecure eval() expression detected.`);
    }
  });

  if (openBraces !== 0) issues.push(`Brace mismatch: ${Math.abs(openBraces)} unclosed curly brace(s).`);
  if (openParens !== 0) issues.push(`Parenthesis mismatch: ${Math.abs(openParens)} unclosed parenthesis.`);

  const resContainer = document.getElementById('fixerResultsContainer');
  const probList = document.getElementById('diagnosticsList');

  if (issues.length === 0) {
    const cleanMsg = `<div style="color:var(--green-light); padding:8px 0;"><i class="ph ph-check-circle"></i> Clean code! No syntax errors detected.</div>`;
    if (resContainer) resContainer.innerHTML = cleanMsg;
    if (probList) probList.innerHTML = cleanMsg;
    showNotification('Code diagnostics: Zero errors detected ✓');
  } else {
    const issueHtml = issues.map(iss => `<div style="color:#f87171; padding:4px 0;"><i class="ph ph-warning"></i> ${iss}</div>`).join('');
    if (resContainer) resContainer.innerHTML = issueHtml;
    if (probList) probList.innerHTML = issueHtml;
    switchDockTab('problems');
    showNotification(`Found ${issues.length} diagnostic issue(s).`);
  }
}

function formatActiveCode() {
  const editor = document.getElementById('ideCodeEditor');
  if (!editor || !editor.value) return;

  const tab = state.ide.openTabs.find(t => t.path === state.ide.activeTab);
  const ext = tab ? (tab.extension || '').toLowerCase() : '';

  try {
    if (ext === '.json') {
      const parsed = JSON.parse(editor.value);
      editor.value = JSON.stringify(parsed, null, 2);
    } else {
      // Clean indentation
      const lines = editor.value.split('\n');
      let indent = 0;
      const formatted = lines.map(line => {
        const trimmed = line.trim();
        if (trimmed.startsWith('}') || trimmed.startsWith(']') || trimmed.startsWith('</')) {
          indent = Math.max(0, indent - 1);
        }
        const res = '  '.repeat(indent) + trimmed;
        if ((trimmed.endsWith('{') || trimmed.endsWith('[') || (trimmed.startsWith('<') && !trimmed.includes('</') && !trimmed.endsWith('/>'))) && !trimmed.endsWith('};')) {
          indent++;
        }
        return res;
      }).join('\n');
      editor.value = formatted;
    }
    editor.dispatchEvent(new Event('input'));
    showNotification('Code formatted successfully ✓');
  } catch (err) {
    showNotification('Cannot auto-format this file syntax.');
  }
}

function clearActiveEditor() {
  const editor = document.getElementById('ideCodeEditor');
  if (editor && confirm('Clear active file content?')) {
    editor.value = '';
    editor.dispatchEvent(new Event('input'));
  }
}

function selectAllCode() {
  const editor = document.getElementById('ideCodeEditor');
  if (editor) {
    editor.focus();
    editor.select();
  }
}

function exportProjectZip() {
  window.open('/api/ide/files', '_blank');
  showNotification('Workspace files index generated.');
}

// 9. GUTTER & STATUS BAR COORDINATE ENGINE
function syncGutter() {
  const editor = document.getElementById('ideCodeEditor');
  const gutter = document.getElementById('ideGutter');
  if (!editor || !gutter) return;

  const lineCount = editor.value.split('\n').length;
  let gutterHtml = '';
  for (let i = 1; i <= lineCount; i++) {
    gutterHtml += `<div class="ide-gutter-line">${i}</div>`;
  }
  gutter.innerHTML = gutterHtml;

  // Calculate Cursor Coordinates (Ln, Col)
  const selStart = editor.selectionStart || 0;
  const textBefore = editor.value.substring(0, selStart);
  const linesBefore = textBefore.split('\n');
  const lineNum = linesBefore.length;
  const colNum = linesBefore[linesBefore.length - 1].length + 1;

  const coordsEl = document.getElementById('statusCursorCoords');
  if (coordsEl) coordsEl.textContent = `Ln ${lineNum}, Col ${colNum}`;
}

function updateLanguageBadge(ext) {
  const langEl = document.getElementById('statusLanguage');
  if (!langEl) return;
  const map = {
    '.html': 'HTML5',
    '.css': 'CSS3',
    '.js': 'JavaScript',
    '.py': 'Python 3',
    '.json': 'JSON',
    '.ino': 'Arduino C++',
    '.md': 'Markdown'
  };
  langEl.textContent = map[ext] || 'Text';
}

// 10. LAYOUT & PRIMARY SIDEBAR (OPEN & CLOSABLE)
function toggleSidebar(forceState) {
  const sidebar = document.getElementById('ideSidebar');
  if (!sidebar) return;

  const isCurrentlyOpen = !sidebar.classList.contains('collapsed') && sidebar.style.display !== 'none';
  const shouldOpen = (forceState !== undefined) ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    sidebar.classList.remove('collapsed');
    sidebar.style.display = 'flex';
    // restore active indicator on activity bar
    const activeTab = state.ide.activeSidebar || 'explorer';
    const activeBtn = document.getElementById('actBtn' + activeTab.charAt(0).toUpperCase() + activeTab.slice(1));
    if (activeBtn) activeBtn.classList.add('active');

    // Ensure active panel is showing
    const panels = {
      explorer: document.getElementById('sidePanelExplorer'),
      forge: document.getElementById('sidePanelForge'),
      fixer: document.getElementById('sidePanelFixer'),
      enterprise: document.getElementById('sidePanelEnterprise')
    };
    Object.keys(panels).forEach(k => {
      if (panels[k]) panels[k].style.display = (k === activeTab) ? 'flex' : 'none';
    });

    updateSidebarToggleState(true);
  } else {
    sidebar.classList.add('collapsed');
    sidebar.style.display = 'none'; // Explicitly hide so it occupies zero space

    // remove active class from activity bar buttons
    ['actBtnExplorer', 'actBtnForge', 'actBtnFixer', 'actBtnEnterprise'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.classList.remove('active');
    });

    updateSidebarToggleState(false);
  }
}

function updateSidebarToggleState(isOpen) {
  const toggleBtn = document.getElementById('btnToggleSidebar');
  if (toggleBtn) {
    if (isOpen) {
      toggleBtn.classList.add('active');
      toggleBtn.title = 'Collapse Primary Side Bar (Ctrl+B)';
      toggleBtn.style.color = 'var(--blue-light)';
      toggleBtn.style.borderColor = 'var(--blue-primary)';
    } else {
      toggleBtn.classList.remove('active');
      toggleBtn.title = 'Open Primary Side Bar (Ctrl+B)';
      toggleBtn.style.color = 'var(--grey-medium)';
      toggleBtn.style.borderColor = 'var(--border-subtle)';
    }
  }

  const actToggle = document.getElementById('actBtnSidebarToggle');
  if (actToggle) {
    if (isOpen) {
      actToggle.classList.add('active');
    } else {
      actToggle.classList.remove('active');
    }
  }
}

// 11. DRAGGABLE SIDEBAR RESIZER (NOT FIXED WIDTH)
function initSidebarResizer() {
  const resizer = document.getElementById('sidebarResizer');
  const sidebar = document.getElementById('ideSidebar');
  if (!resizer || !sidebar) return;

  let isResizing = false;
  let startX = 0;
  let startWidth = 0;

  resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    startX = e.clientX;
    startWidth = sidebar.offsetWidth;
    resizer.classList.add('resizing');
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    const newWidth = Math.max(160, Math.min(650, startWidth + (e.clientX - startX)));
    sidebar.style.width = `${newWidth}px`;
    sidebar.style.minWidth = `${newWidth}px`;
  });

  window.addEventListener('mouseup', () => {
    if (isResizing) {
      isResizing = false;
      resizer.classList.remove('resizing');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  // Double-click resets back to default 280px
  resizer.addEventListener('dblclick', () => {
    sidebar.style.width = '280px';
    sidebar.style.minWidth = '240px';
  });
}

function setSidebarTab(tabName) {
  const sidebar = document.getElementById('ideSidebar');
  const isCurrentlyOpen = sidebar && !sidebar.classList.contains('collapsed') && sidebar.style.display !== 'none';

  // Toggle behavior: If user clicks the SAME active tab while sidebar is OPEN, collapse it!
  if (isCurrentlyOpen && state.ide.activeSidebar === tabName) {
    toggleSidebar(false);
    return;
  }

  // Otherwise, ensure open and switch to selected tab
  state.ide.activeSidebar = tabName;
  toggleSidebar(true);

  const panels = {
    explorer: document.getElementById('sidePanelExplorer'),
    forge: document.getElementById('sidePanelForge'),
    fixer: document.getElementById('sidePanelFixer'),
    enterprise: document.getElementById('sidePanelEnterprise')
  };

  Object.keys(panels).forEach(k => {
    if (panels[k]) panels[k].style.display = (k === tabName) ? 'flex' : 'none';
  });

  const buttons = {
    explorer: document.getElementById('actBtnExplorer'),
    forge: document.getElementById('actBtnForge'),
    fixer: document.getElementById('actBtnFixer'),
    enterprise: document.getElementById('actBtnEnterprise')
  };

  Object.keys(buttons).forEach(k => {
    if (buttons[k]) {
      if (k === tabName) buttons[k].classList.add('active');
      else buttons[k].classList.remove('active');
    }
  });

  updateSidebarToggleState(true);
}

// ===================================================================
// SMOOTH & SLOW ZOOM CONTROLLER
// Handles mouse wheel, trackpad pinch, and shortcuts smoothly
// ===================================================================
let currentEditorFontSize = 13.5;
const MIN_FONT_SIZE = 9;
const MAX_FONT_SIZE = 32;
let zoomToastTimer = null;

function setEditorZoom(newSize, showToast = true) {
  currentEditorFontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, Math.round(newSize * 10) / 10));
  const lineHeight = Math.round(currentEditorFontSize * 1.68);

  document.documentElement.style.setProperty('--editor-font-size', `${currentEditorFontSize}px`);
  document.documentElement.style.setProperty('--editor-line-height', `${lineHeight}px`);

  const gutter = document.getElementById('ideGutter');
  const editor = document.getElementById('ideCodeEditor');
  if (gutter && editor) {
    gutter.scrollTop = editor.scrollTop;
  }

  const zoomEl = document.getElementById('statusEditorZoom');
  const percent = Math.round((currentEditorFontSize / 13.5) * 100);
  if (zoomEl) {
    zoomEl.textContent = `${percent}%`;
  }

  if (showToast) {
    showZoomIndicator(`${percent}% (${currentEditorFontSize}px)`);
  }
}

function zoomIn() {
  setEditorZoom(currentEditorFontSize + 1.0, true);
}

function zoomOut() {
  setEditorZoom(currentEditorFontSize - 1.0, true);
}

function resetZoom() {
  setEditorZoom(13.5, true);
}

function showZoomIndicator(label) {
  let toast = document.getElementById('ideZoomToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'ideZoomToast';
    toast.className = 'ide-zoom-toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<i class="ph ph-magnifying-glass"></i> Zoom: ${label}`;
  toast.classList.add('visible');

  clearTimeout(zoomToastTimer);
  zoomToastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 1100);
}

function initSmoothZoom() {
  const workbench = document.querySelector('.ide-workbench') || document.body;
  if (!workbench) return;

  workbench.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault(); // Intercept harsh browser page-level zoom snap

      const rawDelta = e.deltaY;
      let step = 0;
      if (Math.abs(rawDelta) > 40) {
        // Discrete mouse wheel click: gentle 0.4px step
        step = rawDelta < 0 ? 0.4 : -0.4;
      } else {
        // Continuous trackpad pinch: ultra fine step
        step = -rawDelta * 0.025;
        if (Math.abs(step) > 0.5) step = Math.sign(step) * 0.5;
      }

      setEditorZoom(currentEditorFontSize + step, true);
    }
  }, { passive: false });
}

function showEditorView() {
  hideEnterpriseView();
  const editor = document.getElementById('ideCodeEditor');
  if (editor) editor.focus();
}

function toggleEnterpriseView() {
  const view = document.getElementById('ideEnterpriseView');
  if (!view) return;

  const isHidden = view.classList.contains('ide-hidden-mobile');
  const isActive = view.classList.contains('active');
  let isNowActive = false;

  if (window.innerWidth <= 768) {
    if (isHidden) {
      view.classList.remove('ide-hidden-mobile');
      view.classList.add('active');
      isNowActive = true;
    } else {
      view.classList.add('ide-hidden-mobile');
      view.classList.remove('active');
      isNowActive = false;
    }
  } else {
    if (isActive) {
      view.classList.remove('active');
      isNowActive = false;
    } else {
      view.classList.add('active');
      isNowActive = true;
    }
  }

  const btnText = document.getElementById('btnEnterpriseViewToggleText');
  if (btnText) btnText.textContent = isNowActive ? 'Code Studio' : 'Enterprise Hub';
}

function hideEnterpriseView() {
  const view = document.getElementById('ideEnterpriseView');
  if (view) {
    view.classList.remove('active');
    view.classList.add('ide-hidden-mobile');
  }
  const btnText = document.getElementById('btnEnterpriseViewToggleText');
  if (btnText) btnText.textContent = 'Enterprise Hub';
}

function openEnterpriseTab(tabName) {
  const view = document.getElementById('ideEnterpriseView');
  if (view) {
    view.classList.add('active');
    view.classList.remove('ide-hidden-mobile');
  }
  const btnText = document.getElementById('btnEnterpriseViewToggleText');
  if (btnText) btnText.textContent = 'Code Studio';
  switchTab(tabName);
}

function switchDockTab(tabName) {
  state.ide.activeDockTab = tabName;
  const panels = {
    terminal: document.getElementById('dockPanelTerminal'),
    output: document.getElementById('dockPanelOutput'),
    problems: document.getElementById('dockPanelProblems'),
    shift: document.getElementById('dockPanelShift')
  };

  Object.keys(panels).forEach(k => {
    if (panels[k]) {
      if (k === tabName) panels[k].classList.add('active');
      else panels[k].classList.remove('active');
    }
  });

  const buttons = {
    terminal: document.getElementById('dockBtnTerminal'),
    output: document.getElementById('dockBtnOutput'),
    problems: document.getElementById('dockBtnProblems'),
    shift: document.getElementById('dockBtnShift')
  };

  Object.keys(buttons).forEach(k => {
    if (buttons[k]) {
      if (k === tabName) buttons[k].classList.add('active');
      else buttons[k].classList.remove('active');
    }
  });

  // Ensure dock is visible
  const dock = document.getElementById('ideBottomDock');
  if (dock) dock.classList.remove('minimized');
}

function toggleBottomDock() {
  const dock = document.getElementById('ideBottomDock');
  if (dock) dock.classList.toggle('minimized');
}

function clearOutputConsole() {
  const consoleEl = document.getElementById('outputConsole');
  if (consoleEl) consoleEl.textContent = '[Console cleared. Ready for next run.]';
}

function showAboutModal() {
  alert(
    `TIA IDE STUDIO • Enterprise Development Software v2.0\n` +
    `------------------------------------------------------\n` +
    `Tirupati Intellect Authority - Empowering Tirupati with AI\n` +
    `Founder / CEO: M. Bhargav Rayudu (B.Tech Mechatronics • CAD Diploma)\n` +
    `Official GSTIN: 37EYLPM8018M1ZN\n` +
    `Color System: Sapphire Blue + Crisp Pure White + Emerald Green + Jet Black + Slate Grey\n` +
    `Workspace Directory: E:\\TIA portal\\workspace\n` +
    `Operating System: Local Windows Environment`
  );
}


// ===================================================================
// TIA MOBILE APP & PWA RUNTIME ENGINE
// Supports: Native Mobile App, PWA Installation, Mobile Navigation
// ===================================================================

let deferredPwaPrompt = null;

// Register Service Worker for Mobile PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        console.log('[TIA Mobile PWA] Service Worker registered:', reg.scope);
        if (reg.update) {
          reg.update();
        }
      })
      .catch((err) => {
        console.warn('[TIA Mobile PWA] Service Worker registration failed:', err);
      });
  });
}

// Mobile PWA Install Prompt Listener
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPwaPrompt = e;
  if (detectAppMode()) {
    // Already in installed app version - do not show banner or download buttons
    return;
  }
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'block';

  const btnHeader = document.getElementById('btnInstallAppHeader');
  if (btnHeader) btnHeader.style.display = 'inline-flex';

  const btnEnt = document.getElementById('btnEnterpriseInstallApp');
  if (btnEnt) btnEnt.style.display = 'inline-flex';
});

window.addEventListener('appinstalled', () => {
  console.log('[TIA Mobile] App was installed successfully');
  deferredPwaPrompt = null;
  dismissPwaBanner();
  showNotification('📱 TIA Mobile App installed on your device!');
});

function triggerPwaInstall() {
  if (deferredPwaPrompt) {
    deferredPwaPrompt.prompt();
    deferredPwaPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('[TIA Mobile] User accepted install prompt');
        dismissPwaBanner();
      }
      deferredPwaPrompt = null;
    });
  } else {
    // If browser doesn't support deferred prompt (e.g. iOS Safari)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
      alert('To install TIA Mobile on iOS:\n1. Tap the Share button (square with arrow up)\n2. Scroll down and tap "Add to Home Screen"\n3. Tap "Add"');
    } else {
      alert('To install TIA Mobile:\n1. Open your browser menu (⋮)\n2. Tap "Install app" or "Add to Home screen"');
    }
  }
}

function dismissPwaBanner() {
  const banner = document.getElementById('pwaInstallBanner');
  if (banner) banner.style.display = 'none';
}

// Mobile Bottom Navigation Switcher
function switchMobileTab(target) {
  // Update active state on mobile bottom nav
  const buttons = {
    dashboard: document.getElementById('mobNavDashboard'),
    communications: document.getElementById('mobNavMessages'),
    ide: document.getElementById('mobNavForge'),
    courses: document.getElementById('mobNavCourses'),
    payslips: document.getElementById('mobNavPayslips')
  };

  Object.keys(buttons).forEach(k => {
    if (buttons[k]) {
      if (k === target) buttons[k].classList.add('active');
      else buttons[k].classList.remove('active');
    }
  });

  if (target === 'ide') {
    // Show IDE Code Editor workstation
    hideEnterpriseView();
    showEditorView();
  } else {
    // Show Enterprise module tab (dashboard, communications, courses, payslips)
    openEnterpriseTab(target);
  }

  // Smooth scroll to top of view
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Mobile Auto-Detection & Startup
document.addEventListener('DOMContentLoaded', () => {
  // If user is accessing on a mobile screen (<= 768px) or in standalone PWA mode
  const isMobileScreen = window.innerWidth <= 768;
  const isStandalonePWA = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone;

  if (isMobileScreen || isStandalonePWA) {
    // Default immediately to the full mobile enterprise app
    const view = document.getElementById('ideEnterpriseView');
    if (view) {
      view.classList.remove('ide-hidden-mobile');
      view.classList.add('active');
    }
  }
});
