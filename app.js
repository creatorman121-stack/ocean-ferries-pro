/* ══════════════════════════════════════════════════════════════════════════
   Ocean Fast Ferries · V400 PRO — Application Logic (MAJOR UPGRADE)
   ══════════════════════════════════════════════════════════════════════════ */

// ── Database Init (with safe storage) ──
let DB = safeGetJSON(DB_KEY, {});
window.DB = DB;

(function migrateDB() {
  const storedVersion = DB._version || 0;
  const needsFullReset = storedVersion < DB_VERSION;
  if (needsFullReset) {
    const preserved = {};
    if (DB.comps && DB.comps.length) preserved.comps = DB.comps;
    if (DB.stats) preserved.stats = DB.stats;
    if (DB.aiSettings) preserved.aiSettings = DB.aiSettings;
    if (DB.darkMode !== undefined) preserved.darkMode = DB.darkMode;
    if (DB.creds) preserved.creds = DB.creds;
    if (DB.bookings && DB.bookings.length) preserved.bookings = DB.bookings;
    if (DB.currency) preserved.currency = DB.currency;
    if (DB.favorites && DB.favorites.length) preserved.favorites = DB.favorites;
    DB = JSON.parse(JSON.stringify(DEFAULT_DB));
    DB._version = DB_VERSION;
    for (const key of Object.keys(preserved)) DB[key] = preserved[key];
    applyConnectingPassengerFares();
    safeSetJSON(DB_KEY, DB);
  } else {
    for (let key of Object.keys(DEFAULT_DB)) {
      if (!(key in DB)) { DB[key] = JSON.parse(JSON.stringify(DEFAULT_DB[key])); continue; }
      if (typeof DEFAULT_DB[key] === 'object' && !Array.isArray(DEFAULT_DB[key])) {
        for (let subKey of Object.keys(DEFAULT_DB[key])) {
          if (!(subKey in DB[key])) DB[key][subKey] = JSON.parse(JSON.stringify(DEFAULT_DB[key][subKey]));
        }
      }
    }
  }
})();
if (!DB.aiSettings) DB.aiSettings = { apiKey:'', useAI:true, model:'auto', timeoutMs:20000, lastStatus:'Not tested yet' };
if (DB.darkMode === undefined) DB.darkMode = false;
if (!DB.currency) DB.currency = 'PHP';
if (!DB.bookings) DB.bookings = [];
if (!DB.favorites) DB.favorites = [];

const saveDB = () => safeSetJSON(DB_KEY, DB);
applyConnectingPassengerFares();

let currentRole = null, chatContext = [];
let lastReceiptText = '', lastTransaction = null;
let actionMenuOpen = false;
let notifications = [];
let weatherCache = { data:null, timestamp:0 };
let multiBagItems = [{description:'',weight:0}];

// ── Notification System ──
function addNotif(text, type='info') {
  notifications.unshift({ text, type, time: new Date().toISOString(), id: Date.now() });
  if (notifications.length > 50) notifications.pop();
  const dot = $('notifDot'); if(dot) dot.classList.add('show');
  renderNotifCenter();
}
function renderNotifCenter() {
  const body = $('notifBody'); if(!body) return;
  if (!notifications.length) { body.innerHTML = '<div class="notif-empty">No notifications yet</div>'; return; }
  body.innerHTML = notifications.slice(0,20).map(n =>
    `<div class="notif-item"><div>${n.text}</div><div class="notif-time">${new Date(n.time).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'})}</div></div>`
  ).join('');
}
function toggleNotifCenter() {
  const c = $('notifCenter');
  if(!c) return;
  const showing = c.style.display !== 'none';
  c.style.display = showing ? 'none' : 'block';
  if(!showing) { const dot=$('notifDot'); if(dot) dot.classList.remove('show'); }
}
document.addEventListener('click', e => {
  const c = $('notifCenter');
  const b = $('notifBtn');
  if(c && c.style.display !== 'none' && !c.contains(e.target) && !b?.contains(e.target)) c.style.display = 'none';
});

// ── Auth ──
function attemptAdminLogin() {
  const u = $('adminUser').value.trim(), p = $('adminPass').value.trim();
  if (!u || !p) return toast('Please enter credentials');
  const supervisor = DB.creds.supervisor;
  const cashier = DB.creds.cashier;
  if (u === supervisor.u && p === supervisor.p) { currentRole = 'supervisor'; postAdminLogin(); }
  else if (u === cashier.u && p === cashier.p) { currentRole = 'cashier'; postAdminLogin(); }
  else toast('Invalid username or password');
}
function postAdminLogin() {
  closeAdminModal();
  $('roleBadge').textContent = currentRole === 'supervisor' ? '👑 Supervisor' : '💼 Cashier';
  const btn = $('drawerAdminBtn');
  if(btn) { btn.textContent = '✅ ' + (currentRole === 'supervisor' ? 'Supervisor' : 'Cashier'); btn.classList.add('active-admin'); }
  const logoutBtn = $('drawerLogoutBtn');
  if(logoutBtn) logoutBtn.style.display = 'block';
  addNotif(`Logged in as ${currentRole}`, 'success');
  toast(`Admin mode: ${currentRole}`);
  buildDrawerMenu();
}
function logout() {
  currentRole = null; chatContext = [];
  $('roleBadge').textContent = '';
  const btn = $('drawerAdminBtn');
  if(btn) { btn.textContent = '🔒 Admin Mode'; btn.classList.remove('active-admin'); }
  const logoutBtn = $('drawerLogoutBtn');
  if(logoutBtn) logoutBtn.style.display = 'none';
  addNotif('Logged out of admin mode', 'info');
  toast('Logged out');
  buildDrawerMenu();
  if(document.querySelector('#view-admin.active')) navigate('dashboard');
}
function showAdminLogin() {
  if (currentRole) { logout(); return; }
  const m = $('adminModal');
  if(m) { m.style.display = 'flex'; setTimeout(()=>{const i=$('adminUser');if(i)i.focus();},100); }
}
function closeAdminModal() {
  const m = $('adminModal');
  if(m) m.style.display = 'none';
}

// ── Theme ──
function applyTheme() {
  document.body.classList.toggle('light-mode', !DB.darkMode);
  $('darkLightToggle').textContent = DB.darkMode ? '🌙' : '☀️';
}
function toggleTheme() { DB.darkMode = !DB.darkMode; saveDB(); applyTheme(); }

// ── Navigation ──
function buildDrawerMenu() {
  const items = [
    { view:'dashboard',  icon:'🏠', label:'Dashboard' },
    { view:'calculator', icon:'🧮', label:'Baggage Calc' },
    { view:'planner',    icon:'🧭', label:'Route Planner' },
    { view:'analytics',  icon:'📊', label:'Analytics' },
    { view:'map',        icon:'🗺️', label:'Live Map' },
    { view:'fares',      icon:'💰', label:'Fares & Slabs' },
    { view:'schedules',  icon:'🕐', label:'Schedules' },
    { view:'bookings',   icon:'🎫', label:'Bookings' },
    { view:'history',    icon:'📋', label:'History' },
    { view:'favorites',  icon:'⭐', label:'Favorites' }
  ];
  if (currentRole) items.push({ view:'admin', icon:'🔒', label:'Admin Panel' });
  $('drawerMenu').innerHTML = items.map(i =>
    `<div class="drawer-item" data-view="${i.view}" onclick="navigate('${i.view}')"><i>${i.icon}</i> ${i.label}</div>`
  ).join('');
}
function toggleDrawer() {
  $('sideDrawer').classList.toggle('open');
  $('overlay').classList.toggle('show');
  $('hamburger').classList.toggle('open');
}
function closeDrawer() {
  $('sideDrawer').classList.remove('open');
  $('overlay').classList.remove('show');
  $('hamburger').classList.remove('open');
}
function navigate(view) { closeDrawer(); showView(view); }
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  const viewEl = $(`view-${name}`);
  if (!viewEl) { console.warn('View not found:', name); return; }
  viewEl.classList.add('active');
  document.querySelectorAll('.drawer-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.drawer-item[data-view="${name}"]`);
  if (item) item.classList.add('active');
  document.querySelectorAll('.bnav-item').forEach(el => el.classList.remove('active'));
  const bnav = document.querySelector(`.bnav-item[data-view="${name}"]`);
  if (bnav) bnav.classList.add('active');
  switch(name) {
    case 'dashboard':  buildDashboard(); break;
    case 'calculator': buildCalculator(); break;
    case 'planner':    buildPlanner(); break;
    case 'analytics':  buildAnalytics(); break;
    case 'fares':      buildFares(); break;
    case 'schedules':  buildSchedules(); break;
    case 'history':    buildHistory(); break;
    case 'admin':      buildAdmin(); break;
    case 'map':        buildMap(); break;
    case 'bookings':   buildBookings(); break;
    case 'favorites':  buildFavorites(); break;
  }
  updateDrawerBadges();
  window.scrollTo(0,0);
}

// ── Unified Action Menu ──
function toggleActionMenu() {
  actionMenuOpen = !actionMenuOpen;
  const fab = $('actionMenuFab');
  const items = $('actionMenuItems');
  if (!fab || !items) return;
  fab.classList.toggle('open', actionMenuOpen);
  items.classList.toggle('show', actionMenuOpen);
  if (actionMenuOpen) {
    setTimeout(() => {
      document.addEventListener('click', closeActionMenuOutside, { once: true });
    }, 50);
  }
}
function closeActionMenuOutside(e) {
  if (e.target.closest('.action-menu-fab') || e.target.closest('.action-menu-items')) return;
  actionMenuOpen = false;
  $('actionMenuFab')?.classList.remove('open');
  $('actionMenuItems')?.classList.remove('show');
}

// ── Weather Fetch (NEW V400) ──
async function fetchWeather() {
  const now = Date.now();
  if (weatherCache.data && (now - weatherCache.timestamp) < 600000) return weatherCache.data;
  try {
    // Use Open-Meteo free API (no key needed)
    const cebu = PORTS.cebu;
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${cebu[0]}&longitude=${cebu[1]}&current=weather_code,wind_speed_10m,temperature_2m&timezone=Asia/Manila`);
    if (!resp.ok) throw new Error('Weather API failed');
    const data = await resp.json();
    weatherCache = { data:data.current, timestamp:now };
    return data.current;
  } catch(e) {
    console.warn('Weather fetch failed:', e);
    return null;
  }
}

// ── Dashboard (V400: with weather, 7-day sparkline, currency) ──
function buildDashboard() {
  const s = DB.stats;
  const today = new Date().toISOString().slice(0,10);
  const todayTx = (DB.comps||[]).filter(c => c.time && c.time.slice(0,10) === today);
  const todayRev = todayTx.reduce((a,c) => a + Number(c.total||0), 0);
  const noteText = loadNote();
  const noteHtml = noteText
    ? `<div class="note-text">${noteText.replace(/</g,'<')}</div>`
    : `<div class="note-placeholder">Tap Edit to add shift notes, supervisor info, vessel changes...</div>`;

  const counts = {};
  todayTx.filter(c => c.route).forEach(c => { counts[c.route] = (counts[c.route]||0)+1; });
  const routeKeys = Object.keys(counts).sort((a,b) => counts[b]-counts[a]);
  const maxCount = routeKeys.length ? counts[routeKeys[0]] : 1;
  const routeHtml = routeKeys.length
    ? routeKeys.map(k => `<div class="route-row"><span class="route-name">${routeName(k)}</span><div class="route-bar"><div class="route-fill" style="width:${Math.round(counts[k]/maxCount*100)}%"></div></div><span class="route-count">${counts[k]}</span></div>`).join('')
    : '<div style="font-size:.72rem;color:#8fa3c8;padding:4px 0">No transactions yet today.</div>';

  // 7-day sparkline data
  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().slice(0,10);
    const dayRev = (DB.comps||[]).filter(c => c.time && c.time.slice(0,10) === ds).reduce((a,c) => a + Number(c.total||0), 0);
    days7.push({ date:ds, rev:dayRev, label:d.toLocaleDateString('en-PH',{weekday:'short'}) });
  }
  const maxRev = Math.max(...days7.map(d=>d.rev), 1);
  const sparkHtml = days7.map(d =>
    `<div class="spark-day"><div class="spark-label">${d.label}</div><div class="spark-bar-wrap"><div class="spark-bar" style="height:${Math.round(d.rev/maxRev*100)}%"></div></div><div class="spark-val">${d.rev > 0 ? fmtCurrency(d.rev, DB.currency) : '-'}</div></div>`
  ).join('');

  const nextDeps = getNextDepartures(3);
  const tickerText = nextDeps.length
    ? nextDeps.map(d => `⛴️ ${d.vessel} → ${d.route} departs ${d.dep}`).join('  ●  ')
    : 'No upcoming departures today  ●  Ocean Fast Ferries Pro — Safe. Fast. Reliable.';

  $('view-dashboard').innerHTML = `
    <div class="live-ticker">
      <div class="live-ticker-label"><span class="live-dot"></span> LIVE</div>
      <div class="ticker-content">${tickerText}</div>
    </div>

    <!-- Weather Card (NEW V400) -->
    <div class="card weather-card" id="weatherCard">
      <div class="card-header">🌤️ Sea Conditions</div>
      <div id="weatherContent"><div style="color:var(--text3);font-size:.78rem">Loading weather...</div></div>
    </div>

    <div class="grid2">
      <div class="neon-stat">
        <div class="neon-val" id="statTrans">${s.transactions}</div>
        <div class="neon-label">Transactions</div>
      </div>
      <div class="neon-stat">
        <div class="neon-val" id="statRev">${fmtCurrency(todayRev, DB.currency)}</div>
        <div class="neon-label">Today Revenue</div>
      </div>
    </div>
    <div class="grid2">
      <div class="neon-stat">
        <div class="neon-val" id="statKg">${s.totalKg}kg</div>
        <div class="neon-label">Total Weight</div>
      </div>
      <div class="neon-stat">
        <div class="neon-val" id="statTop">${s.topRoute || '--'}</div>
        <div class="neon-label">Top Route</div>
      </div>
    </div>

    <!-- Currency Selector (NEW V400) -->
    <div class="card" style="padding:10px 14px">
      <div style="display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:.72rem;font-weight:700;color:var(--text2)">💱 Display Currency</span>
        <select id="dashCurrency" style="width:auto;min-height:36px;padding:6px 30px 6px 10px;font-size:.78rem" onchange="changeCurrency(this.value)">
          ${Object.keys(EXCHANGE_RATES).map(c => `<option value="${c}" ${DB.currency===c?'selected':''}>${CURRENCY_SYMBOLS[c]} ${c}</option>`).join('')}
        </select>
      </div>
    </div>

    <!-- 7-Day Sparkline (NEW V400) -->
    <div class="card">
      <div class="card-header">📈 7-Day Revenue</div>
      <div class="sparkline">${sparkHtml}</div>
    </div>

    <div class="note-card" id="noteCard">
      <div class="note-head"><span class="note-title">📌 Shift Notes</span><span class="note-edit" onclick="editNote()">✎ Edit</span></div>
      ${noteHtml}
    </div>
    <div class="card" style="margin-top:10px">
      <div class="card-header">📊 Today's Route Activity</div>${routeHtml}
    </div>
    <div class="card" style="margin-top:10px">
      <div class="card-header">📈 Revenue Pulse</div>
      <div style="display:flex;justify-content:space-between;align-items:center">
        <div><span style="font-size:1.3rem;font-weight:900;color:#22d3ee">${fmtCurrency(todayRev, DB.currency)}</span><span style="font-size:.65rem;color:var(--text3);margin-left:6px">today</span></div>
        <div style="font-size:.68rem;color:var(--text2)">${todayTx.length} transactions</div>
      </div>
      <div style="height:6px;background:rgba(255,255,255,.07);border-radius:3px;margin-top:6px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100,todayRev/50000*100)}%;background:linear-gradient(90deg,#22d3ee,#a855f7);border-radius:3px"></div>
      </div>
    </div>
    <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
      <button class="accent block" style="flex:1;min-width:140px" onclick="navigate('analytics')">📊 Analytics →</button>
      <button class="accent block" style="flex:1;min-width:140px" onclick="navigate('calculator')">🧮 Calculator →</button>
      <button class="accent block" style="flex:1;min-width:140px" onclick="navigate('planner')">🧭 Route Planner →</button>
    </div>
  `;

  // Load weather async
  fetchWeather().then(weather => {
    const el = $('weatherContent');
    if (!el) return;
    if (!weather) { el.innerHTML = '<div style="color:var(--text3);font-size:.78rem">Weather unavailable</div>'; return; }
    const sea = getSeaCondition(weather.weather_code, weather.wind_speed_10m);
    const temp = weather.temperature_2m ? `${Math.round(weather.temperature_2m)}°C` : '--';
    const wind = weather.wind_speed_10m ? `${Math.round(weather.wind_speed_10m)} km/h` : '--';
    el.innerHTML = `
      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">
        <div style="font-size:2rem">${getWeatherIcon(weather.weather_code)}</div>
        <div style="flex:1">
          <div style="font-size:1.1rem;font-weight:800;color:${sea.color}">${sea.level} Seas ${sea.icon}</div>
          <div style="font-size:.78rem;color:var(--text2)">${temp} · Wind: ${wind}</div>
          <div style="font-size:.68rem;color:var(--text3);margin-top:4px">${sea.advisory}</div>
        </div>
      </div>`;
  });
}

function changeCurrency(c) {
  DB.currency = c;
  saveDB();
  buildDashboard();
  toast('💱 Currency: ' + CURRENCY_SYMBOLS[c] + ' ' + c);
}

// Helper: get next departures for live ticker
function getNextDepartures(count) {
  const now = new Date(); const nowMin = now.getHours()*60+now.getMinutes();
  const deps = [];
  Object.keys(DB.schedules||{}).forEach(k => {
    (DB.schedules[k].trips||[]).forEach(t => {
      const m = String(t.dep).trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i);
      if(!m) return;
      let h=+m[1],mn=+m[2],ap=(m[3]||'').toUpperCase();
      if(ap==='PM'&&h!==12)h+=12; if(ap==='AM'&&h===12)h=0;
      const depMin=h*60+mn; let eta=depMin-nowMin; if(eta<-45)eta+=1440;
      if(eta>0) deps.push({ vessel:t.vessel, route:routeName(k), dep:t.dep, eta, key:k });
    });
  });
  return deps.sort((a,b)=>a.eta-b.eta).slice(0,count);
}

// ── Shift Notes ──
const NOTE_KEY = 'off_note_v400';
function loadNote() { try { return localStorage.getItem(NOTE_KEY) || ''; } catch(e) { return ''; } }
function saveNote(t) { try { localStorage.setItem(NOTE_KEY, t); } catch(e) {} }
function editNote() {
  const card = $('noteCard'); if(!card) return;
  const text = loadNote();
  card.innerHTML = `<div class="note-head"><span class="note-title">📌 Shift Notes</span></div>
    <textarea class="note-input" id="noteInput" placeholder="Type operational notes here...">${text}</textarea>
    <div class="note-actions"><button class="note-save" onclick="saveNoteEdit()">✓ Save</button><button class="note-cancel" onclick="cancelNoteEdit()">Cancel</button></div>`;
  const inp = $('noteInput'); if(inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); }
}
function saveNoteEdit() {
  const inp = $('noteInput'); if(!inp) return;
  saveNote(inp.value.trim());
  toast('Note saved ✓');
  buildDashboard();
}
function cancelNoteEdit() { buildDashboard(); }

// ── Multi-Item Calculator (V400 UPGRADED) ──
function buildCalculator() {
  multiBagItems = [{description:'',weight:0}];
  $('view-calculator').innerHTML = `
    <div class="card glow">
      <div class="card-header">🧮 Baggage Calculator Pro</div>
      <div class="input-group"><label>Route</label>
        <div class="swap-wrap">
          <select id="calcRoute">${CEBU_BAGGAGE_ROUTES.map(k => `<option value="${k}">${routeName(k)}</option>`).join('')}</select>
          <button class="swap-btn" onclick="swapRoute()" title="Swap direction">⇄</button>
        </div>
      </div>
      <div class="input-group"><label>Mode</label><select id="calcMode" onchange="onModeChange()"><option value="normal">Normal</option><option value="fragile">Fragile</option></select></div>
      <div id="normalFields">
        <div class="grid2">
          <div class="input-group"><label>Class</label><select id="calcClass" onchange="updateAllowBar()"><option value="tourist">Tourist (10kg)</option><option value="business">Business (20kg)</option></select></div>
          <div class="input-group"><label>Passengers</label><input type="number" id="pax" value="1" min="1" onchange="updateAllowBar()" oninput="updateAllowBar()"></div>
        </div>
      </div>

      <!-- Multi-Item Section (NEW V400) -->
      <div style="margin:8px 0;padding:10px;background:rgba(34,211,238,0.06);border:1px solid rgba(34,211,238,0.2);border-radius:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-size:.78rem;font-weight:700;color:var(--neon-cyan)">📦 Baggage Items</span>
          <button class="sm" onclick="addBagItem()" style="color:var(--neon-cyan);border-color:var(--border-glow)">+ Add Item</button>
        </div>
        <div id="bagItemsList"></div>
        <div style="font-size:.68rem;color:var(--text3);margin-top:6px">Add multiple items for combined calculation</div>
      </div>

      <div class="input-group"><label>Total Weight (kg) — auto-calculated from items above</label><input type="number" id="weight" value="0" step="0.1" min="0" oninput="updateAllowBar();updateWeightSuggestion()" onchange="updateAllowBar();updateWeightSuggestion()"></div>
      <div class="weight-suggest" id="weightSuggest"></div>
      <div class="allow-bar ok" id="allowBar">
        <div class="allow-row"><span class="allow-label">Free Allowance</span><span class="allow-status">Enter weight above</span></div>
      </div>
      <div class="input-group"><label>Rounding</label><select id="rounding"><option value="exact">Exact</option><option value="floor">Floor E (whole kg)</option></select></div>
      <button class="primary block" onclick="compute()">💰 Compute Fee</button>
      <button class="accent block" style="margin-top:6px" onclick="cashierAdjust()">💵 Smart Adjustment</button>
      <button class="accent block" style="margin-top:6px" onclick="toggleFavoriteCalc()">⭐ Save as Favorite</button>
      <button class="reset-btn" onclick="resetCalc()">↺ Clear / Reset</button>
    </div>
    <div id="resultCard" class="card" style="display:none">
      <div class="result-banner"><div class="result-total" id="totalDisplay"></div><div id="perPaxDisplay" style="color:var(--text2);font-weight:600"></div></div>
      <div class="steps" id="stepsDisplay"></div>
      <!-- Currency Toggle on Result (NEW V400) -->
      <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
        <span style="font-size:.68rem;color:var(--text3)">Show in:</span>
        ${Object.keys(EXCHANGE_RATES).map(c => `<button class="sm" style="padding:4px 8px;font-size:.6rem" onclick="showResultCurrency('${c}')">${CURRENCY_SYMBOLS[c]}${c}</button>`).join('')}
      </div>
      <div id="currencyResult" style="margin-top:6px;font-size:.88rem;font-weight:700;color:var(--neon-cyan)"></div>
      <div class="change-box" id="changeBox" style="display:none">
        <div style="font-weight:700;font-size:.75rem;margin-bottom:5px">💵 Change Calculator</div>
        <div class="change-row"><input type="number" id="tenderedInput" placeholder="Amount tendered (₱)" oninput="calcChange()"></div>
        <div class="change-result" id="changeResult"></div>
      </div>
      <button class="share-fab" id="shareBtn" onclick="shareReceipt()" style="display:none">📤 Share Receipt</button>
    </div>
    <div class="receipt" id="receipt"></div>
  `;
  $('calcRoute').value = 'cebu_tagbilaran';
  onModeChange(); updateAllowBar(); renderBagItems();
}

function addBagItem() {
  multiBagItems.push({description:'',weight:0});
  renderBagItems();
}
function removeBagItem(idx) {
  if (multiBagItems.length <= 1) { toast('Need at least one item'); return; }
  multiBagItems.splice(idx, 1);
  renderBagItems();
  updateWeightFromItems();
}
function renderBagItems() {
  const el = $('bagItemsList');
  if (!el) return;
  el.innerHTML = multiBagItems.map((item, i) => `
    <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
      <input type="text" placeholder="Description (e.g. Suitcase)" value="${item.description||''}" oninput="multiBagItems[${i}].description=this.value" style="flex:1;min-height:40px;font-size:.78rem;padding:8px 10px">
      <input type="number" placeholder="kg" value="${item.weight||''}" oninput="multiBagItems[${i}].weight=Number(this.value)||0;updateWeightFromItems()" style="width:70px;min-height:40px;font-size:.78rem;padding:8px 10px">
      <button class="sm" onclick="removeBagItem(${i})" style="background:rgba(239,68,68,.1);color:#f87171;border-color:rgba(239,68,68,.3);min-height:40px;min-width:36px">✕</button>
    </div>
  `).join('');
}
function updateWeightFromItems() {
  const total = multiBagItems.reduce((s,i) => s + Number(i.weight||0), 0);
  if ($('weight')) $('weight').value = total;
  updateAllowBar(); updateWeightSuggestion();
}

function onModeChange() {
  const isFragile = $('calcMode')?.value === 'fragile';
  const grid = $('normalFields')?.querySelector('.grid2');
  if (grid) grid.style.display = isFragile ? 'none' : 'grid';
  updateAllowBar(); updateWeightSuggestion();
}

function updateAllowBar() {
  const bar = $('allowBar'); if(!bar) return;
  const mode = ($('calcMode')?.value) || 'normal';
  const cls = ($('calcClass')?.value) || 'tourist';
  const pax = Math.max(1, parseInt(($('pax')?.value)||1, 10));
  const weight = parseFloat(($('weight')?.value)||0) || 0;
  if (mode === 'fragile') {
    bar.className = 'allow-bar warn';
    bar.innerHTML = `<div class="allow-row"><span class="allow-label">Fragile Mode</span><span class="allow-status warn">Full weight charged</span></div><div class="allow-detail">No free allowance — fee applies to all ${weight.toFixed(1)}kg</div>`;
    return;
  }
  const freeTotal = (DB.freeAllowance[cls]||10) * pax;
  const pct = Math.min(100, Math.round((weight/Math.max(freeTotal,1))*100));
  const excess = Math.max(0, weight - freeTotal);
  const state = excess > 0 ? 'over' : pct >= 80 ? 'warn' : 'ok';
  const statusText = excess > 0 ? `+${excess.toFixed(1)}kg excess` : `${weight.toFixed(1)}kg / ${freeTotal}kg free`;
  bar.className = `allow-bar ${state}`;
  bar.innerHTML = `<div class="allow-row"><span class="allow-label">Free Allowance (${cls} ×${pax})</span><span class="allow-status ${state}">${statusText}</span></div>
    <div class="allow-track"><div class="allow-fill ${state}" style="width:${pct}%"></div></div>
    <div class="allow-detail">${freeTotal}kg free • ${excess > 0 ? excess.toFixed(1)+'kg will be charged' : 'within free allowance'}</div>`;
}

function swapRoute() {
  const routeSel = $('calcRoute'); if(!routeSel) return;
  const v = routeSel.value || '';
  const parts = v.split('_');
  if (parts.length < 2) { toast('No reverse route'); return; }
  const rev = parts[1] + '_' + parts[0];
  let found = false;
  for (let i = 0; i < routeSel.options.length; i++) {
    if (routeSel.options[i].value === rev) { routeSel.value = rev; found = true; break; }
  }
  if (!found) { toast('Reverse route not available'); return; }
  toast('Route swapped ⇄');
  if ($('resultCard')?.style.display !== 'none') compute();
  updateAllowBar();
}

function resetCalc() {
  multiBagItems = [{description:'',weight:0}];
  if($('pax')) $('pax').value = '1';
  if($('weight')) $('weight').value = '0';
  if($('calcMode')) $('calcMode').value = 'normal';
  if($('calcClass')) $('calcClass').value = 'tourist';
  const rc = $('resultCard'); if(rc) rc.style.display = 'none';
  const rcpt = $('receipt'); if(rcpt) { rcpt.innerHTML = ''; rcpt.style.display = 'none'; }
  const cb = $('changeBox'); if(cb) cb.style.display = 'none';
  const sb = $('shareBtn'); if(sb) sb.style.display = 'none';
  const cr = $('currencyResult'); if(cr) cr.innerHTML = '';
  onModeChange(); updateAllowBar(); renderBagItems();
  if($('weight')) $('weight').focus();
  toast('↺ Calculator cleared');
}

function getCalcParams() {
  return {
    route: $('calcRoute').value, mode: $('calcMode').value,
    cls: $('calcClass').value, pax: parseInt($('pax').value)||1,
    weight: parseFloat($('weight').value)||0, rounding: $('rounding').value
  };
}

function compute(override = null) {
  const p = override || getCalcParams();
  const {route, mode, cls, pax, weight, rounding} = p;
  if (!DB.slabs[route]?.[mode]) { toast('Slab rates not found for this route/mode'); return; }
  const free = mode === 'normal' ? DB.freeAllowance[cls] : 0;
  const freeTotal = free * pax;
  let excess = Math.max(0, weight - freeTotal);
  let E = mode === 'normal' ? excess / pax : weight;
  if (rounding === 'floor') E = Math.floor(E);
  const slab = slabCost(E, DB.slabs[route][mode]);
  const perPax = slab.total;
  const total = mode === 'normal' ? perPax * pax : perPax;

  const steps = [
    `Free: ${free}kg × ${pax}pax = ${freeTotal}kg`,
    `Excess: ${weight}kg → ${excess.toFixed(1)}kg`,
    `E/pax: ${excess.toFixed(1)} ÷ ${pax} = ${E.toFixed(2)}kg`
  ];
  if (slab.t1>0) steps.push(`Tier1: ${slab.t1.toFixed(1)}kg × ₱${DB.slabs[route][mode][0]} = ₱${slab.c1.toFixed(2)}`);
  if (slab.t2>0) steps.push(`Tier2: ${slab.t2.toFixed(1)}kg × ₱${DB.slabs[route][mode][1]} = ₱${slab.c2.toFixed(2)}`);
  if (slab.t3>0) steps.push(`Tier3: ${slab.t3.toFixed(1)}kg × ₱${DB.slabs[route][mode][2]} = ₱${slab.c3.toFixed(2)}`);
  steps.push(`Per pax: ₱${perPax.toFixed(2)}`);
  steps.push(`Total: ${fmtPHP(total)}`);

  // Multi-item breakdown
  if (multiBagItems.length > 1 || (multiBagItems.length === 1 && multiBagItems[0].description)) {
    steps.push('--- Items ---');
    multiBagItems.forEach(item => {
      if (item.weight > 0) steps.push(`  ${item.description || 'Item'}: ${item.weight}kg`);
    });
  }

  $('totalDisplay').textContent = fmtPHP(total);
  $('perPaxDisplay').textContent = mode==='normal' ? `₱${perPax.toFixed(2)} per passenger` : 'Fragile cargo';
  $('stepsDisplay').innerHTML = steps.map(s => `<div>• ${s}</div>`).join('');
  $('resultCard').style.display = 'block';
  $('currencyResult').innerHTML = '';

  const changeBox = $('changeBox'); if(changeBox) changeBox.style.display = 'block';
  const tendered = $('tenderedInput'); if(tendered) tendered.value = '';
  const changeResult = $('changeResult'); if(changeResult) changeResult.textContent = '';

  const shareBtn = $('shareBtn');
  if (shareBtn && navigator.share) shareBtn.style.display = 'block';
  else if (shareBtn) shareBtn.style.display = 'none';

  const receiptHtml = `
    <div style="text-align:center;font-weight:bold;font-size:1rem;margin-bottom:6px">⛴️ Ocean Fast Ferries Pro</div>
    <div style="text-align:center;font-size:.68rem;margin-bottom:8px">BAGGAGE FEE RECEIPT</div>
    <div>Route: <b>${routeName(route)}</b></div><div>Mode: <b>${mode.toUpperCase()}</b></div>
    <div>${mode==='normal'?`Class: <b>${cls}</b> | Pax: <b>${pax}</b>`:`Fragile Cargo`}</div>
    <div>Weight: <b>${weight} kg</b></div>
    <hr style="margin:6px 0">${steps.map(s => `<div>${s}</div>`).join('')}<hr style="margin:6px 0">
    <div style="text-align:center;font-weight:bold;font-size:1.1rem">💰 TOTAL: ${fmtPHP(total)}</div>
    <div class="receipt-qr" id="receiptQR"></div>
    <div style="font-size:.62rem;margin-top:6px;text-align:center">${new Date().toLocaleString()}</div>`;
  $('receipt').innerHTML = receiptHtml + `
    <div class="receipt-actions">
      <button class="primary-pdf" onclick="downloadReceiptPDF()">📄 Download PDF</button>
      <button onclick="downloadReceipt()">TXT</button>
      <button onclick="printReceiptPDF()">Print</button>
    </div>`;
  $('receipt').style.display = 'block';

  generateReceiptQR(total, route);

  lastReceiptText = ['Ocean Fast Ferries Pro','BAGGAGE FEE RECEIPT','Route: '+routeName(route),'Mode: '+mode.toUpperCase(),
    mode==='normal'?'Class: '+cls+' | Pax: '+pax:'Fragile Cargo','Weight: '+weight+' kg',
    '---',...steps,'---','TOTAL: '+fmtPHP(total),'Date: '+new Date().toLocaleString()].join('\n');

  if (!override) {
    lastTransaction = {route,mode,cls,pax,weight,total,time:new Date().toISOString(),items:multiBagItems.map(i=>({...i}))};
    DB.stats.transactions++; DB.stats.revenue += total; DB.stats.totalKg += weight;
    if (!DB.stats.routeCounts[route]) DB.stats.routeCounts[route] = 0;
    DB.stats.routeCounts[route]++;
    let top='',max=0;
    for (let [k,v] of Object.entries(DB.stats.routeCounts)) if(v>max){max=v;top=k;}
    DB.stats.topRoute = top;
    DB.comps.push({...lastTransaction});
    saveDB(); buildDashboard(); updateDrawerBadges();
    addNotif(`Transaction: ${routeName(route)} — ${fmtPHP(total)}`, 'transaction');
  }
}

function showResultCurrency(currency) {
  const totalText = $('totalDisplay')?.textContent || '₱0';
  const totalNum = parseFloat(totalText.replace(/[₱,]/g,'')) || 0;
  const cr = $('currencyResult');
  if (cr) cr.textContent = `≈ ${fmtCurrency(totalNum, currency)}`;
}

// ── Favorites (NEW V400) ──
function toggleFavoriteCalc() {
  const p = getCalcParams();
  const key = `${p.route}_${p.mode}_${p.cls}_${p.pax}pax`;
  const existing = DB.favorites.findIndex(f => f.key === key);
  if (existing >= 0) {
    DB.favorites.splice(existing, 1);
    toast('⭐ Removed from favorites');
  } else {
    DB.favorites.push({ key, route:p.route, mode:p.mode, cls:p.cls, pax:p.pax, label:`${routeName(p.route)} · ${p.mode} · ${p.cls} · ${p.pax}pax`, time:new Date().toISOString() });
    toast('⭐ Saved to favorites!');
  }
  saveDB();
}

function buildFavorites() {
  const favs = DB.favorites || [];
  $('view-favorites').innerHTML = `
    <div class="card glow">
      <div class="card-header">⭐ Saved Favorites</div>
      ${favs.length ? favs.map((f,i) => `
        <div class="fav-item" onclick="loadFavorite(${i})" style="display:flex;justify-content:space-between;align-items:center;padding:10px;border-bottom:1px solid var(--border);cursor:pointer">
          <div>
            <div style="font-weight:700;color:var(--accent)">${f.label}</div>
            <div style="font-size:.68rem;color:var(--text3)">${(f.time||'').slice(0,10)}</div>
          </div>
          <button class="sm" onclick="event.stopPropagation();removeFavorite(${i})" style="color:#f87171;border-color:rgba(239,68,68,.3)">✕</button>
        </div>
      `).join('') : '<div style="color:var(--text3);font-size:.78rem;padding:12px">No favorites yet. Save calculator presets with ⭐ button.</div>'}
    </div>`;
}
function loadFavorite(idx) {
  const f = DB.favorites[idx]; if(!f) return;
  navigate('calculator');
  setTimeout(()=>{
    if($('calcRoute')) $('calcRoute').value = f.route;
    if($('calcMode')) $('calcMode').value = f.mode;
    if($('calcClass')) $('calcClass').value = f.cls;
    if($('pax')) $('pax').value = f.pax;
    onModeChange(); updateAllowBar();
    toast('⭐ Favorite loaded');
  }, 150);
}
function removeFavorite(idx) {
  DB.favorites.splice(idx, 1);
  saveDB();
  buildFavorites();
  toast('Favorite removed');
}

// ── Route Planner (NEW V400) ──
function buildPlanner() {
  const allPorts = Object.keys(PORTS);
  const portLabels = { cebu:'Cebu', tagbilaran:'Tagbilaran', getafe:'Getafe', ormoc:'Ormoc', palompon:'Palompon', maasin:'Maasin', surigao:'Surigao', siquijor:'Siquijor', dumaguete:'Dumaguete', bacolod:'Bacolod', iloilo:'Iloilo', calapan:'Calapan', batangas:'Batangas' };
  $('view-planner').innerHTML = `
    <div class="card glow">
      <div class="card-header">🧭 Route Planner</div>
      <p style="font-size:.75rem;color:var(--text2);margin-bottom:10px">Plan your journey across all Ocean Fast Ferries routes with smart connections.</p>
      <div class="grid2">
        <div class="input-group"><label>From</label>
          <select id="planFrom">${allPorts.map(p => `<option value="${p}" ${p==='cebu'?'selected':''}>${portLabels[p]||titleCase(p)}</option>`).join('')}</select>
        </div>
        <div class="input-group"><label>To</label>
          <select id="planTo">${allPorts.map(p => `<option value="${p}" ${p==='tagbilaran'?'selected':''}>${portLabels[p]||titleCase(p)}</option>`).join('')}</select>
        </div>
      </div>
      <button class="primary block" onclick="executePlanRoute()">🔍 Find Route</button>
      <div id="planResult" style="margin-top:10px"></div>
    </div>`;
}
function executePlanRoute() {
  const from = $('planFrom')?.value, to = $('planTo')?.value;
  if (!from || !to || from === to) { toast('Select different ports'); return; }
  const plan = planRoute(from, to);
  const el = $('planResult'); if(!el) return;
  if (!plan) {
    el.innerHTML = '<div class="card" style="border-color:var(--neon-red)"><div style="font-weight:700;color:var(--neon-red)">No route found</div><div style="font-size:.78rem;color:var(--text3)">No direct or connecting route available for this pair.</div></div>';
    return;
  }
  const typeLabel = plan.type === 'direct' ? '🟢 Direct Route' : plan.type === 'connecting' ? '🟡 Connecting Route' : '🟠 Multi-Hop Route';
  let legsHtml = '';
  if (plan.legs) {
    legsHtml = plan.legs.map((leg, i) => {
      const sched = DB.schedules[leg];
      const fare = getPassengerFare(leg);
      const fareStr = fare ? `Tourist: ${fmtPHP(Number(fare['TC/OA']||0))} | Business: ${fmtPHP(Number(fare['BC']||0))}` : 'Fare not available';
      return `<div class="card" style="margin-top:6px">
        <div style="font-weight:700;color:var(--accent)">Leg ${i+1}: ${sched?.title || titleCase(leg)}</div>
        <div style="font-size:.72rem;color:var(--text2)">Travel: ${sched?.travel || '--'}</div>
        <div style="font-size:.72rem;color:var(--neon-cyan)">${fareStr}</div>
        <div style="font-size:.68rem;color:var(--text3);margin-top:4px">${(sched?.trips||[]).length} trips daily</div>
        <button class="sm" style="margin-top:4px" onclick="goCalcFromFare('${leg}')">Use in Calculator →</button>
      </div>`;
    }).join('');
  }
  el.innerHTML = `
    <div class="card" style="border-color:var(--neon-cyan)">
      <div style="font-size:1rem;font-weight:800;color:var(--neon-cyan)">${typeLabel}</div>
      ${plan.via ? `<div style="font-size:.78rem;color:var(--text2)">Via: ${plan.via}</div>` : ''}
    </div>
    ${legsHtml}`;
}

// ── Booking System (NEW V400) ──
function buildBookings() {
  const bookings = DB.bookings || [];
  $('view-bookings').innerHTML = `
    <div class="card glow">
      <div class="card-header">🎫 Bookings & Reservations</div>
      <div class="input-group"><label>Route</label>
        <select id="bookRoute">${CEBU_BAGGAGE_ROUTES.map(k => `<option value="${k}">${routeName(k)}</option>`).join('')}</select>
      </div>
      <div class="grid2">
        <div class="input-group"><label>Passenger Name</label><input id="bookName" placeholder="Full name"></div>
        <div class="input-group"><label>Class</label><select id="bookClass"><option value="TC/OA">Tourist/Open Air</option><option value="BC">Business Class</option><option value="ST">Student</option><option value="MI">Minor</option></select></div>
      </div>
      <div class="grid2">
        <div class="input-group"><label>Passengers</label><input type="number" id="bookPax" value="1" min="1"></div>
        <div class="input-group"><label>Trip</label><select id="bookTrip"><option value="">Select after route</option></select></div>
      </div>
      <div class="input-group"><label>Date</label><input type="date" id="bookDate" value="${new Date().toISOString().slice(0,10)}"></div>
      <button class="primary block" onclick="makeBooking()">🎫 Book Now</button>
    </div>
    <div class="card">
      <div class="card-header" style="justify-content:space-between"><span>📋 Your Bookings</span><span style="font-size:.68rem;color:var(--text3)">${bookings.length} total</span></div>
      <div id="bookList">${bookings.length ? bookings.slice().reverse().map((b,i) => `
        <div style="padding:10px;border-bottom:1px solid var(--border)">
          <div style="display:flex;justify-content:space-between"><span style="color:var(--accent);font-weight:700">${routeName(b.route)}</span><span style="font-weight:700">${fmtPHP(b.fare)}</span></div>
          <div style="font-size:.72rem;color:var(--text2)">${b.name} · ${b.cls} · ${b.pax}pax · ${b.date}</div>
          <div style="font-size:.68rem;color:var(--text3)">${b.trip || 'Any trip'} · Booked: ${(b.time||'').slice(0,10)}</div>
          <div style="margin-top:4px;display:flex;gap:6px">
            <button class="sm" onclick="viewBookingQR(${bookings.length-1-i})">📱 QR</button>
            <button class="sm" style="color:#f87171;border-color:rgba(239,68,68,.3)" onclick="cancelBooking(${bookings.length-1-i})">Cancel</button>
          </div>
        </div>
      `).join('') : '<div style="color:var(--text3);font-size:.78rem;padding:10px">No bookings yet.</div>'}</div>
    </div>`;
  // Populate trips when route changes
  const routeSel = $('bookRoute');
  if (routeSel) {
    routeSel.onchange = () => {
      const trips = DB.schedules[routeSel.value]?.trips || [];
      const tripSel = $('bookTrip');
      if (tripSel) tripSel.innerHTML = trips.map((t,i) => `<option value="${t.dep} - ${t.vessel}">${t.dep} (${t.vessel}) → ${t.arr||'--'}</option>`).join('') || '<option>No trips</option>';
    };
    routeSel.onchange();
  }
}
function makeBooking() {
  const route = $('bookRoute')?.value, name = $('bookName')?.value?.trim(), cls = $('bookClass')?.value;
  const pax = parseInt($('bookPax')?.value)||1, trip = $('bookTrip')?.value, date = $('bookDate')?.value;
  if (!name) { toast('Enter passenger name'); return; }
  const fare = getPassengerFare(route);
  if (!fare) { toast('Fare not available for this route'); return; }
  const totalFare = Number(fare[cls]||0) * pax;
  DB.bookings.push({ route, name, cls, pax, trip, date, fare:totalFare, time:new Date().toISOString(), ref:'OFF'+Date.now().toString(36).toUpperCase() });
  saveDB();
  addNotif(`Booking confirmed: ${routeName(route)} — ${fmtPHP(totalFare)}`, 'success');
  toast('🎫 Booking confirmed!');
  buildBookings();
}
function cancelBooking(idx) {
  if (!confirm('Cancel this booking?')) return;
  DB.bookings.splice(idx, 1);
  saveDB();
  toast('Booking cancelled');
  buildBookings();
}
function viewBookingQR(idx) {
  const b = DB.bookings[idx]; if(!b) return;
  const text = `OFF-BOOK|${b.ref}|${b.route}|${b.name}|${b.cls}|${b.pax}pax|${b.date}|${fmtPHP(b.fare)}`;
  if (navigator.share) { navigator.share({title:'Booking '+b.ref, text}).catch(()=>{}); }
  else { navigator.clipboard.writeText(text).then(()=>toast('Booking info copied')).catch(()=>toast('Share not supported')); }
}

// ── QR Code Generation ──
function generateReceiptQR(total, route) {
  const qrEl = $('receiptQR');
  if (!qrEl) return;
  if (typeof QRCode !== 'undefined') {
    try {
      new QRCode(qrEl, {
        text: `OFF|${route}|${total}|${Date.now()}`,
        width: 64, height: 64,
        colorDark: '#000000', colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.L
      });
    } catch(e) { qrEl.innerHTML = '<small style="color:#999">QR</small>'; }
  } else {
    qrEl.innerHTML = '<small style="color:#999">QR (offline)</small>';
  }
}

function calcChange() {
  const tendered = parseFloat($('tenderedInput')?.value) || 0;
  const totalText = $('totalDisplay')?.textContent || '₱0';
  const totalNum = parseFloat(totalText.replace(/[₱,]/g,'')) || 0;
  const result = $('changeResult'); if(!result) return;
  if (tendered <= 0) { result.textContent = ''; return; }
  const change = tendered - totalNum;
  result.textContent = change >= 0 ? `Change: ${fmtPHP(change)}` : `Short: ${fmtPHP(Math.abs(change))}`;
}

function shareReceipt() {
  if (!lastReceiptText) return;
  if (navigator.share) {
    navigator.share({ title:'Ocean Fast Ferries Pro Receipt', text:lastReceiptText }).catch(()=>{});
  } else {
    navigator.clipboard.writeText(lastReceiptText).then(()=>toast('Receipt copied to clipboard')).catch(()=>toast('Share not supported'));
  }
}

function undoLastTransaction() {
  if (!lastTransaction) { toast('Nothing to undo'); return; }
  if (!confirm('Undo last transaction?')) return;
  const t = DB.comps.pop();
  if (t) {
    DB.stats.transactions = Math.max(0, DB.stats.transactions-1);
    DB.stats.revenue = Math.max(0, DB.stats.revenue - t.total);
    DB.stats.totalKg = Math.max(0, DB.stats.totalKg - t.weight);
    if (DB.stats.routeCounts[t.route]) DB.stats.routeCounts[t.route] = Math.max(0, DB.stats.routeCounts[t.route]-1);
    saveDB(); buildDashboard(); updateDrawerBadges();
    addNotif('Transaction undone', 'warning');
    toast('Last transaction undone');
  }
  lastTransaction = null;
}

function downloadReceipt() {
  if (!lastReceiptText) return toast('Compute a receipt first');
  const blob = new Blob([lastReceiptText], {type:'text/plain;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ocean_receipt_${receiptFileStamp()}.txt`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}
function downloadReceiptPDF() {
  if (!lastReceiptText) return toast('Compute a receipt first');
  const pdf = buildReceiptPDF(lastReceiptText);
  const blob = new Blob([pdf], {type:'application/pdf'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
  a.download = `ocean_baggage_receipt_${receiptFileStamp()}.pdf`; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1200);
}
function printReceiptPDF() {
  const receipt = $('receipt'); if(!receipt||!lastReceiptText) return toast('Compute a receipt first');
  const win = window.open('','_blank','width=420,height=640');
  if (!win) return toast('Popup blocked. Use Download PDF instead.');
  win.document.write(`<!doctype html><html><head><title>Ocean Fast Ferries Pro Receipt</title><style>body{font-family:Courier New,monospace;padding:20px;color:#111}.receipt{border:1px solid #111;padding:16px;max-width:360px;margin:auto}.receipt-actions,.receipt-download-btn{display:none!important}@media print{button{display:none}}</style></head><body><div class="receipt">${receipt.innerHTML}</div><script>window.onload=function(){setTimeout(function(){window.print()},250)}<\/script></body></html>`);
  win.document.close();
}
function cashierAdjust() {
  const p = getCalcParams();
  if (p.mode==='fragile') {
    let w = p.weight; if(w<=0){toast('Enter weight first');return;}
    for (let testW=Math.floor(w)-1;testW>=0;testW--) {
      let slab=slabCost(testW,DB.slabs[p.route].fragile); let tot=slab.total;
      if(Math.abs(tot%1)<.001&&tot>0){$('weight').value=testW;compute();toast(`Adjusted to ${testW}kg → ${fmtPHP(tot)}`);return;}
    }
    toast('No whole-peso total found for Fragile'); return;
  }
  const free=DB.freeAllowance[p.cls]*p.pax; let excess=p.weight-free;
  if(excess<=0){toast('No excess to adjust');return;}
  for(let e=Math.floor(excess)-1;e>=0;e--){
    let testW=e+free; let E=e/p.pax; let slab=slabCost(E,DB.slabs[p.route].normal);
    let tot=slab.total*p.pax; if(Math.abs(tot%1)<.001){$('weight').value=testW;compute();toast(`Adjusted to ${testW}kg → ${fmtPHP(tot)}`);return;}
  }
  toast('No whole-peso total found');
}

function updateWeightSuggestion() {
  const el = $('weightSuggest'); if(!el) return;
  const weight = Number($('weight')?.value||0);
  const mode = $('calcMode')?.value||'normal';
  const s = suggestWeightCategory(weight,mode);
  if(!s||weight<=0){el.innerHTML='';el.style.display='none';return;}
  el.style.display='flex';
  el.innerHTML=`<span style="font-size:1.1rem">${s.icon}</span><div><b style="color:var(--accent2)">${s.label}</b><br><small style="color:var(--text3)">${s.tip}</small></div>`;
}

// ── Fares View ──
function buildFares() {
  $('view-fares').innerHTML = `<div class="card glow"><div class="card-header">💰 Passenger Fares</div>
    <select id="fareRoute" onchange="renderFareTable()">${CEBU_BAGGAGE_ROUTES.map(r=>`<option value="${r}">${routeName(r)}</option>`).join('')}</select>
    <div id="fareTable" style="margin-top:8px"></div>
    <div class="fare-ref-table" id="fareRefTable"></div>
  </div><div class="card"><div class="card-header">📦 Slab Rates (per kg)</div><div id="slabDisplay"></div></div>`;
  renderFareTable(); renderSlabDisplay();
}
function renderFareTable() {
  const key=$('fareRoute')?.value, data=getPassengerFare(key); if(!data) return;
  const rows=FARE_CLASSES.map(cls=>`<tr><td>${FARE_CLASS_LABELS[cls]||cls}</td><td style="text-align:right;font-weight:600">${data[cls]!=null?fmtPHP(Number(data[cls])):'—'}</td><td style="text-align:right;font-weight:600;color:var(--neon-cyan)">${data[cls]!=null?fmtCurrency(Number(data[cls]),DB.currency):'—'}</td></tr>`).join('');
  $('fareTable').innerHTML=`<table><tr><th>Class</th><th style="text-align:right">PHP</th><th style="text-align:right">${DB.currency}</th></tr>${rows}</table>${fareBreakdownHtml(key)}`;
  const refRows=CEBU_BAGGAGE_ROUTES.map(k=>{const f=getPassengerFare(k);return f?`<tr><td>${routeName(k)}</td><td style="text-align:right">${fmtPHP(Number(f['TC/OA']||0))}</td><td style="text-align:right">${fmtPHP(Number(f['BC']||0))}</td></tr>`:''}).join('');
  const refEl=$('fareRefTable');if(refEl)refEl.innerHTML=`<div style="margin-top:12px;font-weight:700;font-size:.82rem">All Routes Quick Reference</div><table style="margin-top:6px"><tr><th>Route</th><th style="text-align:right">Tourist</th><th style="text-align:right">Business</th></tr>${refRows}</table>`;
}
function renderSlabDisplay() {
  const el=$('slabDisplay');if(!el)return;
  el.innerHTML=CEBU_BAGGAGE_ROUTES.map(k=>{
    const n=DB.slabs[k]?.normal||[0,0,0],f=DB.slabs[k]?.fragile||[0,0,0];
    return `<div style="padding:6px 0;border-bottom:1px solid var(--border)"><b style="color:var(--accent)">${routeName(k)}</b>
      <div style="font-size:.75rem;color:var(--text2)">Normal: ₱${n[0]}/₱${n[1]}/₱${n[2]} per kg (Tiers 1/2/3)</div>
      <div style="font-size:.75rem;color:var(--text2)">Fragile: ₱${f[0]}/₱${f[1]}/₱${f[2]} per kg</div></div>`;
  }).join('');
}

// ── Schedules View ──
function buildSchedules() {
  const keys = Object.keys(DB.schedules||{});
  $('view-schedules').innerHTML = `
    <div class="search-bar"><input id="schedSearch" placeholder="Search route, vessel..." oninput="filterSchedules()"></div>
    <div id="schedList"></div>`;
  filterSchedules();
}
function filterSchedules() {
  const q = ($('schedSearch')?.value||'').toLowerCase();
  const keys = Object.keys(DB.schedules||{}).filter(k => !q || (DB.schedules[k].title||'').toLowerCase().includes(q) || k.includes(q));
  const list = $('schedList'); if(!list) return;
  list.innerHTML = keys.map(k => {
    const sc = DB.schedules[k];
    return `<div class="card"><div class="card-header">${sc.title}</div>
      <div style="font-size:.72rem;color:var(--text2);margin-bottom:8px">Travel: ${sc.travel}</div>
      <table><tr><th>Depart</th><th>Vessel</th><th>Arrive</th><th>Notes</th></tr>
      ${(sc.trips||[]).map(t=>`<tr><td>${t.dep}</td><td>${t.vessel}</td><td>${t.arr||'—'}</td><td style="font-size:.7rem;color:var(--text3)">${t.remarks||''}</td></tr>`).join('')}
      </table></div>`;
  }).join('');
}

// ── History View ──
function buildHistory() {
  $('view-history').innerHTML = `
    <div class="card">
      <div class="card-header" style="justify-content:space-between"><span>📋 Transaction History</span>
        <button class="sm" onclick="exportHistoryCSV()">📤 CSV</button>
      </div>
      <div class="search-bar"><input id="histSearch" placeholder="Search route, date, amount..." oninput="filterHistory()"></div>
      <div id="histList"></div>
      ${currentRole==='supervisor'?`<button class="danger block" style="margin-top:10px" onclick="clearHistory()">🗑️ Clear All History</button>`:''}
    </div>`;
  filterHistory();
}
function filterHistory() {
  const q = ($('histSearch')?.value||'').toLowerCase();
  const txs = (DB.comps||[]).slice().reverse().filter(c =>
    !q || (c.route||'').toLowerCase().includes(q) || (c.time||'').includes(q) || fmtPHP(c.total).includes(q) || String(c.mode).includes(q)
  );
  const list = $('histList'); if(!list) return;
  list.innerHTML = txs.length ? txs.map((c,i) => `
    <div style="padding:8px 0;border-bottom:1px solid var(--border);font-size:.8rem">
      <div style="display:flex;justify-content:space-between"><span style="color:var(--accent);font-weight:600">${routeName(c.route)}</span><b>${fmtPHP(c.total)}</b></div>
      <div style="color:var(--text3);font-size:.7rem">${c.mode} | ${c.pax||1}pax | ${c.weight}kg | ${(c.time||'').slice(0,16).replace('T',' ')}</div>
      ${c.items && c.items.length > 1 ? `<div style="font-size:.65rem;color:var(--neon-cyan)">${c.items.filter(it=>it.description).map(it=>it.description).join(', ')}</div>` : ''}
    </div>
  `).join('') : '<p style="color:var(--text3);padding:8px 0">No matching transactions</p>';
}
function exportHistoryCSV() {
  const rows = [['Date','Route','Mode','Class','Pax','Weight(kg)','Total(PHP)','Items']];
  (DB.comps||[]).forEach(c => {
    rows.push([(c.time||'').slice(0,16).replace('T',' '), routeName(c.route), c.mode, c.cls||'', c.pax||1, c.weight, c.total, (c.items||[]).filter(i=>i.description).map(i=>`${i.description}(${i.weight}kg)`).join('; ')]);
  });
  exportCSV(rows, `ocean_history_${receiptFileStamp()}.csv`);
  toast('CSV exported ✓');
}
function clearHistory() {
  if (!confirm('Clear ALL transaction history? This cannot be undone.')) return;
  DB.comps = []; DB.stats = {transactions:0,revenue:0,totalKg:0,topRoute:'',routeCounts:{}};
  saveDB(); buildHistory(); buildDashboard(); updateDrawerBadges();
  toast('History cleared');
}

// ── Analytics View ──
function buildAnalytics() {
  const today = new Date().toISOString().slice(0,10);
  const txs = DB.comps || [];
  const todayRev = txs.filter(c=>c.time&&c.time.slice(0,10)===today).reduce((a,c)=>a+Number(c.total||0),0);
  const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate()-7);
  const weekRev = txs.filter(c=>c.time&&new Date(c.time)>=weekAgo).reduce((a,c)=>a+Number(c.total||0),0);
  const monthAgo = new Date(); monthAgo.setDate(monthAgo.getDate()-30);
  const monthRev = txs.filter(c=>c.time&&new Date(c.time)>=monthAgo).reduce((a,c)=>a+Number(c.total||0),0);

  $('view-analytics').innerHTML = `
    <div class="card glow">
      <div class="card-header">📊 Revenue Analytics</div>
      <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-cyan)">${fmtCurrency(todayRev,DB.currency)}</div><div class="neon-label">Today</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-green)">${fmtCurrency(weekRev,DB.currency)}</div><div class="neon-label">This Week</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-purple)">${fmtCurrency(monthRev,DB.currency)}</div><div class="neon-label">This Month</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val">${txs.length}</div><div class="neon-label">Total Txns</div></div>
      </div>
      <div class="chart-card"><canvas id="chartRevenue"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header">🧩 Route Breakdown</div>
      <div class="chart-card"><canvas id="chartRoutes"></canvas></div>
    </div>
    <div class="card">
      <div class="card-header">⚖️ Weight Distribution</div>
      <div class="chart-card"><canvas id="chartWeight"></canvas></div>
    </div>
    <button class="accent block" onclick="exportAnalyticsCSV()">📤 Export Analytics CSV</button>`;
  setTimeout(() => renderAnalyticsCharts(txs, today), 100);
}

function renderAnalyticsCharts(txs, today) {
  if (typeof Chart === 'undefined') {
    const fallback = '<div style="color:var(--text3);font-size:.85rem;padding:20px;text-align:center">Charts require internet (Chart.js CDN). Data tracked locally.</div>';
    const c1=$('chartRevenue'); if(c1) c1.parentNode.innerHTML = fallback;
    return;
  }
  const neonColors = {
    cyan: '#22d3ee', purple: '#a855f7', green: '#22c55e', pink: '#f43f5e',
    orange: '#fb923c', yellow: '#eab308', blue: '#3b82f6', magenta: '#ec4899'
  };

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0,10));
  }
  const revByDay = days.map(d => txs.filter(c => c.time && c.time.slice(0,10) === d).reduce((a,c) => a + Number(c.total||0), 0));
  const dayLabels = days.map(d => { const dt = new Date(d); return dt.toLocaleDateString('en-PH',{weekday:'short',day:'numeric'}); });

  const commonOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#9da4c0', font: { size: 11 } } } },
    scales: { x: { ticks: { color: '#5d6380' }, grid: { color: 'rgba(255,255,255,0.05)' } }, y: { ticks: { color: '#5d6380' }, grid: { color: 'rgba(255,255,255,0.05)' } } }
  };

  const ctx1 = $('chartRevenue')?.getContext('2d');
  if (ctx1) new Chart(ctx1, {
    type: 'line',
    data: { labels: dayLabels, datasets: [{ label: 'Revenue (₱)', data: revByDay, borderColor: neonColors.cyan, backgroundColor: 'rgba(34,211,238,0.15)', fill: true, tension: 0.3, pointBackgroundColor: neonColors.cyan, pointBorderColor: '#fff', pointRadius: 4 }] },
    options: { ...commonOpts, plugins: { ...commonOpts.plugins, legend: { display: false } } }
  });

  const routeCounts = {};
  txs.forEach(c => { if(c.route) routeCounts[c.route] = (routeCounts[c.route]||0) + 1; });
  const routeLabels = Object.keys(routeCounts).map(k => routeName(k));
  const routeData = Object.values(routeCounts);
  const pieColors = [neonColors.pink, neonColors.orange, neonColors.cyan, neonColors.purple, neonColors.green, neonColors.yellow, neonColors.blue, neonColors.magenta];

  const ctx2 = $('chartRoutes')?.getContext('2d');
  if (ctx2) new Chart(ctx2, {
    type: 'doughnut',
    data: { labels: routeLabels, datasets: [{ data: routeData, backgroundColor: pieColors.slice(0,routeLabels.length), borderColor: '#0c1023', borderWidth: 2 }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { color: '#9da4c0', font: { size: 10 }, padding: 12 } } } }
  });

  const weightBuckets = { '0-10kg':0, '11-20kg':0, '21-40kg':0, '41+kg':0 };
  txs.forEach(c => {
    const w = Number(c.weight||0);
    if (w <= 10) weightBuckets['0-10kg']++;
    else if (w <= 20) weightBuckets['11-20kg']++;
    else if (w <= 40) weightBuckets['21-40kg']++;
    else weightBuckets['41+kg']++;
  });

  const ctx3 = $('chartWeight')?.getContext('2d');
  if (ctx3) new Chart(ctx3, {
    type: 'bar',
    data: { labels: Object.keys(weightBuckets), datasets: [{ label: 'Transactions', data: Object.values(weightBuckets), backgroundColor: [neonColors.green, neonColors.yellow, neonColors.orange, neonColors.pink], borderRadius: 6 }] },
    options: { ...commonOpts, plugins: { ...commonOpts.plugins, legend: { display: false } } }
  });
}

function exportAnalyticsCSV() {
  const txs = DB.comps || [];
  const rows = [['Date','Route','Mode','Class','Pax','Weight(kg)','Total(PHP)','Hour']];
  txs.forEach(c => {
    const hour = c.time ? new Date(c.time).getHours() : '';
    rows.push([(c.time||'').slice(0,10), routeName(c.route), c.mode, c.cls||'', c.pax||1, c.weight, c.total, hour]);
  });
  exportCSV(rows, `ocean_analytics_${receiptFileStamp()}.csv`);
  toast('Analytics CSV exported ✓');
}

// ── Admin View (V400: with rate editor, enhanced) ──
function buildAdmin() {
  if (!currentRole) {
    $('view-admin').innerHTML = `<div class="card glow" style="text-align:center;padding:40px 20px">
      <div style="font-size:3rem;margin-bottom:12px">🔒</div>
      <div style="font-size:1.1rem;font-weight:700;margin-bottom:8px">Admin Mode Required</div>
      <div style="color:var(--text3);font-size:.85rem;margin-bottom:20px">Login to access admin tools and real-time monitoring</div>
      <button class="primary" onclick="showAdminLogin()">🔓 Enter Admin Mode</button>
    </div>`;
    return;
  }
  const txs = DB.comps||[];
  const today = new Date().toISOString().slice(0,10);
  const todayTxs = txs.filter(c=>c.time&&c.time.slice(0,10)===today);
  const todayRev = todayTxs.reduce((a,c)=>a+Number(c.total||0),0);
  const todayKg = todayTxs.reduce((a,c)=>a+Number(c.weight||0),0);
  const dbSize = Math.round(JSON.stringify(DB).length/1024);
  const isSuper = currentRole==='supervisor';

  const storageUsed = Math.round(JSON.stringify(localStorage).length/1024);
  const storageMax = 5120;
  const storagePct = Math.min(100, Math.round(storageUsed/storageMax*100));
  const uptime = loadShiftState()?.startTime ? hms(Math.floor((Date.now()-loadShiftState().startTime)/1000)) : 'Not started';

  const allTimeDays = txs.length ? Math.max(1, Math.ceil((Date.now() - new Date(txs[0]?.time||Date.now()).getTime()) / 86400000)) : 1;
  const avgDaily = txs.reduce((a,c)=>a+Number(c.total||0),0) / allTimeDays;
  const monthProj = Math.round(avgDaily * 30);

  // Rate editor options
  const rateEditorHtml = CEBU_BAGGAGE_ROUTES.map(k => {
    const n = DB.slabs[k]?.normal||[0,0,0], f = DB.slabs[k]?.fragile||[0,0,0];
    return `<div style="padding:8px 0;border-bottom:1px solid var(--border)">
      <div style="font-weight:700;color:var(--accent);margin-bottom:4px">${routeName(k)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:4px;font-size:.72rem">
        <div><label style="color:var(--text3)">N T1</label><input type="number" id="rate_${k}_n0" value="${n[0]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
        <div><label style="color:var(--text3)">N T2</label><input type="number" id="rate_${k}_n1" value="${n[1]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
        <div><label style="color:var(--text3)">N T3</label><input type="number" id="rate_${k}_n2" value="${n[2]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
        <div><label style="color:var(--text3)">F T1</label><input type="number" id="rate_${k}_f0" value="${f[0]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
        <div><label style="color:var(--text3)">F T2</label><input type="number" id="rate_${k}_f1" value="${f[1]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
        <div><label style="color:var(--text3)">F T3</label><input type="number" id="rate_${k}_f2" value="${f[2]}" style="padding:6px;min-height:34px;font-size:.72rem"></div>
      </div>
    </div>`;
  }).join('');

  $('view-admin').innerHTML = `
    <div class="card glow">
      <div class="card-header" style="justify-content:space-between"><span>🛡️ Admin Command Center</span>
        <button class="sm danger" onclick="logout()">Logout</button>
      </div>
      <div style="font-size:.8rem;color:var(--text2);margin-bottom:12px">Role: <b style="color:var(--neon-cyan)">${currentRole}</b></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-cyan)">${todayTxs.length}</div><div class="neon-label">Today Txns</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-green)">${fmtPHP(todayRev)}</div><div class="neon-label">Today Rev</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-purple)">${todayKg}kg</div><div class="neon-label">Today Weight</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">💓 System Health</div>
      <div style="margin-bottom:8px">
        <div style="display:flex;justify-content:space-between;font-size:.78rem;margin-bottom:4px"><span>Storage</span><span style="color:var(--neon-cyan)">${storageUsed}KB / ${storageMax}KB</span></div>
        <div style="background:var(--border);border-radius:4px;height:8px;overflow:hidden">
          <div style="background:linear-gradient(90deg,var(--neon-cyan),var(--neon-purple));height:100%;width:${storagePct}%;border-radius:4px;transition:width .5s"></div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:.75rem">
        <div style="color:var(--text2)">DB Size: <b>${dbSize}KB</b></div>
        <div style="color:var(--text2)">Total Txns: <b>${txs.length}</b></div>
        <div style="color:var(--text2)">Shift: <b style="color:var(--neon-green)">${uptime}</b></div>
        <div style="color:var(--text2)">Online: <b style="color:${navigator.onLine?'var(--neon-green)':'var(--neon-pink)'}">${navigator.onLine?'Yes':'Offline'}</b></div>
        <div style="color:var(--text2)">Version: <b>V400 Pro</b></div>
        <div style="color:var(--text2)">SW: <b style="color:var(--neon-cyan)">${'serviceWorker' in navigator?'Active':'N/A'}</b></div>
      </div>
    </div>

    <div class="card">
      <div class="card-header">📈 Revenue Projections</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-green);font-size:1rem">${fmtPHP(avgDaily)}</div><div class="neon-label">Avg Daily</div></div>
        <div class="neon-stat" style="flex:1;min-width:100px"><div class="neon-val" style="color:var(--neon-cyan);font-size:1rem">${fmtPHP(monthProj)}</div><div class="neon-label">Month Proj</div></div>
      </div>
    </div>

    ${isSuper ? `
    <!-- Rate Editor (NEW V400) -->
    <div class="card">
      <div class="card-header">✏️ Slab Rate Editor</div>
      ${rateEditorHtml}
      <button class="primary block" style="margin-top:10px" onclick="saveRateEdits()">💾 Save All Rates</button>
    </div>

    <!-- Credential Management -->
    <div class="card">
      <div class="card-header">🔑 Credential Management</div>
      <div class="input-group"><label>Cashier Username</label><input id="adminCashierU" value="${DB.creds.cashier.u}"></div>
      <div class="input-group"><label>Cashier Password</label><input id="adminCashierP" value="${DB.creds.cashier.p}" type="password"></div>
      <button class="primary block" onclick="saveCreds()">Save Credentials</button>
    </div>

    <!-- AI Settings -->
    <div class="card">
      <div class="card-header">🤖 AI Configuration</div>
      <div class="input-group"><label>Gemini API Key</label><input id="adminApiKey" value="${DB.aiSettings.apiKey||''}" placeholder="Enter Gemini API key"></div>
      <div class="input-group"><label>Model</label>
        <select id="adminAiModel">
          <option value="gemini-2.0-flash" ${(DB.aiSettings.model||'gemini-2.0-flash')==='gemini-2.0-flash'?'selected':''}>Gemini 2.0 Flash</option>
          <option value="gemini-1.5-flash" ${DB.aiSettings.model==='gemini-1.5-flash'?'selected':''}>Gemini 1.5 Flash</option>
          <option value="gemini-1.5-pro" ${DB.aiSettings.model==='gemini-1.5-pro'?'selected':''}>Gemini 1.5 Pro</option>
        </select>
      </div>
      <button class="accent block" onclick="saveApiKey()">Save AI Settings</button>
    </div>
    ` : '<div style="color:var(--text3);font-size:.82rem;padding:8px">Supervisor access required for settings.</div>'}

    <div class="card">
      <div class="card-header">⚡ Bulk Operations</div>
      <div class="grid2">
        <button class="accent block" onclick="exportDatabase()">📤 Export JSON</button>
        <button class="accent block" onclick="importDatabasePrompt()">📥 Import JSON</button>
      </div>
      ${isSuper ? `
      <div style="margin-top:8px">
        <button class="accent block" onclick="purgeOldData()">🧹 Purge Old Data (>30d)</button>
        <button class="accent block" style="margin-top:6px" onclick="forceCacheClear()">🔄 Force Cache Clear</button>
      </div>` : ''}
      <div style="margin-top:8px;font-size:.72rem;color:var(--text3)">Transactions: ${txs.length} | Bookings: ${DB.bookings?.length||0} | DB: ${dbSize}KB</div>
    </div>

    <div class="card">
      <div class="card-header">📜 Audit Log</div>
      <div id="auditLog" style="max-height:200px;overflow-y:auto;font-size:.72rem;color:var(--text2)">
        ${buildAuditLog(txs)}
      </div>
    </div>`;
}

function saveRateEdits() {
  CEBU_BAGGAGE_ROUTES.forEach(k => {
    if (!DB.slabs[k]) DB.slabs[k] = {};
    const n0 = $(`rate_${k}_n0`)?.value, n1 = $(`rate_${k}_n1`)?.value, n2 = $(`rate_${k}_n2`)?.value;
    const f0 = $(`rate_${k}_f0`)?.value, f1 = $(`rate_${k}_f1`)?.value, f2 = $(`rate_${k}_f2`)?.value;
    DB.slabs[k].normal = [Number(n0)||0, Number(n1)||0, Number(n2)||0];
    DB.slabs[k].fragile = [Number(f0)||0, Number(f1)||0, Number(f2)||0];
    // Also update reverse route
    const rev = k.split('_').reverse().join('_');
    if (DB.slabs[rev]) { DB.slabs[rev].normal = [...DB.slabs[k].normal]; DB.slabs[rev].fragile = [...DB.slabs[k].fragile]; }
  });
  saveDB(); addNotif('Slab rates updated','success'); toast('Rates saved ✓');
}
function saveCreds() {
  const u=$('adminCashierU')?.value?.trim(), p=$('adminCashierP')?.value?.trim();
  if(u) DB.creds.cashier.u=u; if(p) DB.creds.cashier.p=p;
  saveDB(); addNotif('Credentials updated','success'); toast('Credentials saved ✓');
}
function saveApiKey() {
  const k=$('adminApiKey')?.value?.trim();
  const m=$('adminAiModel')?.value||'gemini-2.0-flash';
  DB.aiSettings.apiKey=k||''; DB.aiSettings.model=m;
  saveDB(); addNotif('AI settings updated','success'); toast('API key saved ✓');
}
function exportDatabase() {
  const blob=new Blob([JSON.stringify(DB,null,2)],{type:'application/json'});
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`ocean_db_backup_${receiptFileStamp()}.json`;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1200);addNotif('Database exported','info');toast('Database exported ✓');
}
function importDatabasePrompt() {
  const input=document.createElement('input');input.type='file';input.accept='.json';
  input.onchange=e=>{
    const f=e.target.files[0];if(!f)return;
    const r=new FileReader();r.onload=ev=>{
      try{const data=JSON.parse(ev.target.result);Object.assign(DB,data);saveDB();addNotif('Database imported','success');toast('Database imported ✓');buildAdmin();}
      catch(err){toast('Invalid JSON file');}
    };r.readAsText(f);
  };input.click();
}
function purgeOldData() {
  if(!confirm('Delete transactions older than 30 days?')) return;
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate()-30);
  const before = DB.comps.length;
  DB.comps = (DB.comps||[]).filter(c => new Date(c.time) >= cutoff);
  const removed = before - DB.comps.length;
  saveDB(); addNotif(`Purged ${removed} old records`,'warning'); toast(`Removed ${removed} old records`); buildAdmin();
}
function forceCacheClear() {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({type:'FORCE_CLEAR_CACHE'});
  }
  localStorage.removeItem('off_baggage_v14'); localStorage.removeItem('off_baggage_v13');
  addNotif('Cache clear requested','warning'); toast('Cache clear sent ✓');
}
function buildAuditLog(txs) {
  const recent = (txs||[]).slice(-20).reverse();
  if (!recent.length) return '<div style="color:var(--text3)">No recent activity</div>';
  return recent.map(c => `<div style="padding:3px 0;border-bottom:1px solid var(--border)">
    <span style="color:var(--neon-cyan)">${(c.time||'').slice(0,16).replace('T',' ')}</span>
    <span style="color:var(--accent)">${routeName(c.route)}</span>
    <span style="color:var(--neon-green)">${fmtPHP(c.total)}</span>
    <span style="color:var(--text3)">${c.mode} ${c.weight}kg</span>
  </div>`).join('');
}

// ── Tally Counter ──
const TALLY_KEY = 'off_tally_v400';
let tallyCount = 0;
try { const s = localStorage.getItem(TALLY_KEY); if(s) tallyCount = JSON.parse(s).count||0; } catch(e) {}
function saveTally() { try { localStorage.setItem(TALLY_KEY, JSON.stringify({count:tallyCount,date:new Date().toISOString().slice(0,10)})); } catch(e) {} }
function showTally() {
  if ($('tallyOverlay')) return;
  const today = new Date().toLocaleDateString('en-PH',{weekday:'short',month:'short',day:'numeric'});
  const ov = document.createElement('div'); ov.id='tallyOverlay'; ov.className='tally-overlay';
  ov.innerHTML = `<div class="tally-title">🚃 Passenger Tally</div><div class="tally-vessel">${today} • Tap + to count</div>
    <div class="tally-num" id="tallyNum">${String(tallyCount).padStart(3,'0')}</div>
    <div class="tally-btns"><button class="tally-btn minus" id="tallyMinus">−</button><button class="tally-btn plus" id="tallyPlus">+</button></div>
    <div class="tally-actions"><button onclick="closeTally()">← Close</button><button class="tally-reset" onclick="resetTally()">Reset to 0</button></div>`;
  document.body.appendChild(ov);
  $('tallyPlus').onclick = () => { tallyCount++; saveTally(); const n=$('tallyNum'); if(n){n.textContent=String(tallyCount).padStart(3,'0');n.classList.add('bump');setTimeout(()=>n.classList.remove('bump'),80);} haptic([8]); };
  $('tallyMinus').onclick = () => { if(tallyCount<=0)return; tallyCount--; saveTally(); const n=$('tallyNum'); if(n)n.textContent=String(tallyCount).padStart(3,'0'); haptic([5]); };
  ov.addEventListener('click', e => { if(e.target===ov) ov.remove(); });
}
function closeTally() { const o=$('tallyOverlay'); if(o)o.remove(); }
function resetTally() { tallyCount=0; saveTally(); const n=$('tallyNum'); if(n)n.textContent='000'; toast('Tally reset'); haptic([15]); }

// ── Fare Lookup Panel ──
function openFarePanel() {
  if ($('farePanel')) return;
  const ov = document.createElement('div'); ov.className='fare-panel'; ov.id='farePanel';
  ov.innerHTML = `<div class="fare-title">💰 Quick Fare Lookup</div>
    <div class="fare-header"><input class="fare-search" id="fareSearchInput" placeholder="🔍 Search route..." oninput="filterFareItems(this.value)"><button class="fare-close" onclick="closeFarePanel()">✕</button></div>
    <div class="fare-grid" id="fareGrid">${buildFareItems('')}</div>`;
  document.body.appendChild(ov);
  setTimeout(()=>{const s=$('fareSearchInput');if(s)s.focus();},150);
}
function closeFarePanel() { const p=$('farePanel'); if(p)p.remove(); }
function filterFareItems(v) { const g=$('fareGrid'); if(g)g.innerHTML=buildFareItems(v); }
function buildFareItems(search) {
  const term=(search||'').toLowerCase();
  return CEBU_BAGGAGE_ROUTES.filter(k=>!term||routeName(k).toLowerCase().includes(term)||k.includes(term)).map(k=>{
    const f=getPassengerFare(k)||{};
    return `<div class="fare-item"><div class="fare-item-route">${routeName(k)}</div>
      <div class="fare-item-prices">${['TC/OA','BC','ST','MI'].map((c,i)=>`<div class="fare-item-cell"><div class="v">${fmtPHP(Number(f[c]||0))}</div><div class="k">${['Tourist','Biz','Student','Minor'][i]}</div></div>`).join('')}</div>
      <button class="fare-calc-btn" onclick="goCalcFromFare('${k}')">Use in Calculator →</button></div>`;
  }).join('') || '<div style="color:#8fa3c8;font-size:.78rem;padding:10px">No routes found</div>';
}
function goCalcFromFare(route) {
  closeFarePanel(); navigate('calculator');
  setTimeout(()=>{if($('calcRoute'))$('calcRoute').value=route;updateAllowBar();toast('Route set: '+routeName(route));},120);
}

// ── Shift Timer ──
const SHIFT_KEY = 'off_shift_v400';
function loadShiftState() { try { const s=localStorage.getItem(SHIFT_KEY); return s?JSON.parse(s):null; } catch(e) { return null; } }
function saveShiftState(state) { try { localStorage.setItem(SHIFT_KEY,JSON.stringify(state)); } catch(e) {} }
function getShiftElapsed() { const state=loadShiftState(); if(!state||!state.startTime) return 0; return Math.floor((Date.now()-state.startTime)/1000); }
function hms(sec) { const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),s=sec%60; return String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }

function showShiftTimer() {
  if ($('timerOverlay')) return;
  const state=loadShiftState(), running=!!(state&&state.startTime);
  const todayTx=(DB.comps||[]).filter(c=>c.time&&c.time.slice(0,10)===new Date().toISOString().slice(0,10));
  const rev=todayTx.reduce((a,c)=>a+Number(c.total||0),0);
  const elapsed=running?getShiftElapsed():0;
  const startStr=running?new Date(state.startTime).toLocaleTimeString('en-PH',{hour:'2-digit',minute:'2-digit'}):'--:--';
  const ov=document.createElement('div'); ov.id='timerOverlay'; ov.className='timer-overlay';
  ov.innerHTML=`<div class="timer-card"><div class="timer-label">${running?'● Live Shift Timer':'Shift Timer'}</div>
    <div class="timer-hms" id="shiftHMS">${running?hms(elapsed):'00:00:00'}</div>
    <div class="timer-meta"><b>Started:</b> ${startStr}<br><b>Transactions:</b> ${todayTx.length} today<br><b>Revenue:</b> ${fmtPHP(rev)} today</div>
    <div class="timer-actions">${running
      ?'<button class="timer-stop" onclick="stopShift()">⏹ End Shift</button>'
      :'<button class="timer-start" onclick="startShift()">▶ Start Shift</button>'}
      <button class="timer-close" onclick="this.closest(\'.timer-overlay\').remove()">← Close</button></div></div>`;
  ov.addEventListener('click',e=>{if(e.target===ov)ov.remove();});
  document.body.appendChild(ov);
}
window.startShift=()=>{saveShiftState({startTime:Date.now()});const o=$('timerOverlay');if(o)o.remove();addNotif('Shift started','success');toast('▶ Shift started!');haptic([15]);};
window.stopShift=()=>{const elapsed=getShiftElapsed();saveShiftState(null);const o=$('timerOverlay');if(o)o.remove();addNotif('Shift ended: '+hms(elapsed),'warning');toast('⏹ Shift ended — '+hms(elapsed)+' on duty');haptic([20]);};

// ── Header Clock ──
function tickHeaderClock() {
  const clk=$('headerClock'); if(!clk) return;
  const d=new Date(); const h=d.getHours(),m=d.getMinutes(),s=d.getSeconds();
  const ap=h>=12?'PM':'AM'; const hh=h%12||12;
  const state=loadShiftState();
  if(state&&state.startTime){
    const elapsed=Math.floor((Date.now()-state.startTime)/1000);
    clk.textContent=hms(elapsed)+' ●';clk.classList.add('shift-active');
  } else {
    clk.textContent=String(hh).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0')+' '+ap;
    clk.classList.remove('shift-active');
  }
  const disp=$('shiftHMS');
  if(disp&&state&&state.startTime){disp.textContent=hms(Math.floor((Date.now()-state.startTime)/1000));}
}

// ── Offline Status ──
function updateOfflineStatus() {
  const badge=$('offlineBadge'); if(!badge) return;
  badge.classList.toggle('show', !navigator.onLine);
  if(!navigator.onLine) addNotif('You are offline — data saved locally','warning');
}
window.addEventListener('online', () => { updateOfflineStatus(); addNotif('Back online!','success'); });
window.addEventListener('offline', updateOfflineStatus);

// ── Departure Alerts ──
let _alertDismissed=false, _lastAlertKey='';
function checkDepartures() {
  const now=new Date(); const nowMin=now.getHours()*60+now.getMinutes();
  const alerts=[];
  Object.keys(DB.schedules||{}).forEach(k=>{
    if(!/^cebu_/.test(k)) return;
    (DB.schedules[k].trips||[]).forEach(t=>{
      const m=String(t.dep).trim().match(/(\d{1,2}):(\d{2})\s*([AP]M)?/i); if(!m)return;
      let h=+m[1],mn=+m[2],ap=(m[3]||'').toUpperCase();
      if(ap==='PM'&&h!==12)h+=12; if(ap==='AM'&&h===12)h=0;
      const depMin=h*60+mn; let eta=depMin-nowMin; if(eta<-45)eta+=1440;
      if(eta>0&&eta<=20) alerts.push({vessel:t.vessel||'Vessel',route:routeName(k),eta,dep:t.dep});
    });
  });
  const badge=$('alertBadge'); if(!badge) return;
  if(!alerts.length){badge.classList.remove('show');_alertDismissed=false;return;}
  const top=alerts.sort((a,b)=>a.eta-b.eta)[0];
  const key=top.vessel+top.dep;
  if(key===_lastAlertKey&&_alertDismissed)return;
  if(key!==_lastAlertKey){_alertDismissed=false;_lastAlertKey=key;addNotif(`⚠️ ${top.vessel} departs in ${top.eta}m`,'warning');}
  badge.querySelector('.alert-text').textContent=`⚠️ ${top.vessel} → ${top.route} departs in ${top.eta}m`;
  badge.classList.add('show');
}

// ── Dynamic Background ──
function updateDynamicBackground() {
  const h=new Date().getHours(); let bg='#070b19';
  if(h>=5&&h<8) bg='#1a0f2e'; else if(h>=8&&h<17) bg='#0a1f3a'; else if(h>=17&&h<19) bg='#2e1a0f';
  document.documentElement.style.setProperty('--bg-base',bg);
}

// ── Touch Swipe for Drawer ──
let touchStartX=0;
document.addEventListener('touchstart',e=>{touchStartX=e.touches[0].clientX},{passive:true});
document.addEventListener('touchend',e=>{
  const diff=e.changedTouches[0].clientX-touchStartX;
  if(touchStartX<50&&diff>80)toggleDrawer();
  if(touchStartX>200&&diff<-80)closeDrawer();
},{passive:true});

// ── Keyboard Shortcuts ──
document.addEventListener('keydown',e=>{
  if(e.ctrlKey&&e.shiftKey&&e.key==='E') exportDatabase();
  if(e.ctrlKey&&e.shiftKey&&e.key==='I'){e.preventDefault();importDatabasePrompt();}
  if(e.ctrlKey&&e.shiftKey&&e.key==='A'){e.preventDefault();showAdminLogin();}
  if(e.ctrlKey&&e.shiftKey&&e.key==='T'){e.preventDefault();showTally();}
  if(e.ctrlKey&&e.shiftKey&&e.key==='S'){e.preventDefault();showShiftTimer();}
});

// ── Haptic Feedback ──
function haptic(pattern=[10]) {
  if(navigator.vibrate) navigator.vibrate(pattern);
}
document.addEventListener('click',e=>{
  const btn=e.target.closest('button,.drawer-item,.tally-btn,.hamburger,.bnav-item');
  if(btn) haptic(btn.classList.contains('primary')?[18]:[8]);
},{passive:true});

// ── AI Chat ──
function toggleChat() {
  const panel=$('chatPanel');
  if(!panel)return;
  panel.classList.toggle('open');
  if(panel.classList.contains('open')&&$('chatInput'))$('chatInput').focus();
}
function sendAIChat() {
  const input=$('chatInput'); if(!input)return;
  const msg=input.value.trim(); if(!msg)return;
  input.value='';
  const body=$('chatBody');
  body.innerHTML+=`<div class="chat-bubble user">${msg.replace(/</g,'<')}</div>`;
  body.innerHTML+=`<div class="loading-dot" id="chatLoading"><span></span><span></span><span></span></div>`;
  body.scrollTop=body.scrollHeight;

  chatContext.push({role:'user',parts:[{text:msg}]});
  if(chatContext.length>12) chatContext=chatContext.slice(-12);

  const apiKey=DB.aiSettings?.apiKey;
  if(!apiKey){
    setTimeout(()=>{
      const ld=$('chatLoading');if(ld)ld.remove();
      body.innerHTML+=`<div class="chat-bubble bot">I need a Gemini API key to respond. Ask your supervisor to add one in Admin panel. For now, I can help with built-in info about Ocean Fast Ferries routes, fares, and schedules.</div>`;
      body.scrollTop=body.scrollHeight;
    },500);
    return;
  }
  const model=DB.aiSettings.model||'gemini-2.0-flash';
  fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({contents:chatContext,systemInstruction:{parts:[{text:'You are the Ocean Fast Ferries Pro AI assistant. Help with baggage fees, routes, schedules, fares, bookings, weather, sea conditions, and operational questions. Be concise and professional. Routes: Cebu-Tagbilaran, Cebu-Ormoc, Cebu-Getafe, Cebu-Palompon, Cebu-Maasin, Cebu-Dumaguete (via Tagbilaran), Cebu-Surigao (via Maasin), Cebu-Siquijor (via Tagbilaran). Slab rates apply for excess baggage. V400 Pro features: multi-item calculator, route planner, booking system, multi-currency, weather overlay, favorites.'}]}})
  }).then(r=>r.json()).then(data=>{
    const ld=$('chatLoading');if(ld)ld.remove();
    const text=data?.candidates?.[0]?.content?.parts?.[0]?.text||'Sorry, I could not generate a response.';
    body.innerHTML+=`<div class="chat-bubble bot">${text.replace(/</g,'<')}</div>`;
    chatContext.push({role:'model',parts:[{text}]});
    body.scrollTop=body.scrollHeight;
  }).catch(err=>{
    const ld=$('chatLoading');if(ld)ld.remove();
    body.innerHTML+=`<div class="chat-bubble bot">Connection error. Please try again.</div>`;
    body.scrollTop=body.scrollHeight;
  });
}

// ── Voice Commands ──
function startVoice() {
  if(!('webkitSpeechRecognition' in window)&&!('SpeechRecognition' in window)) return toast('Voice not supported');
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const recognition=new Recognition(); recognition.lang='en-US'; recognition.interimResults=false;
  recognition.onresult=e=>{
    const transcript=e.results[0][0].transcript.toLowerCase().trim();
    const routes=['tagbilaran','ormoc','getafe','palompon','maasin','dumaguete','surigao','siquijor'];
    const routeMatch=routes.find(r=>transcript.includes(r));
    if(routeMatch&&$('calcRoute')){$('calcRoute').value='cebu_'+routeMatch;updateAllowBar();haptic([20]);toast('🎤 Route set: '+titleCase(routeMatch));return;}
    const weightMatch=transcript.match(/(\d+)\s*(kg|kilo|kilograms?)/);
    if(weightMatch&&$('weight')){$('weight').value=weightMatch[1];updateAllowBar();updateWeightSuggestion();haptic([20]);toast('🎤 Weight set: '+weightMatch[1]+'kg');return;}
    const paxMatch=transcript.match(/(\d+)\s*(pax|passengers?|people)/);
    if(paxMatch&&$('pax')){$('pax').value=paxMatch[1];updateAllowBar();haptic([20]);toast('🎤 Passengers set: '+paxMatch[1]);return;}
    if(transcript.includes('compute')||transcript.includes('calculate')){compute();haptic([25]);return;}
    if($('chatInput')){$('chatInput').value=transcript;sendAIChat();}
  };
  recognition.onerror=()=>toast('Voice recognition failed');
  recognition.start(); toast('🎤 Listening...'); haptic([10]);
}

// ── Update Drawer Badges ──
function updateDrawerBadges() {
  const txs = DB.comps || [];
  const today = new Date().toISOString().slice(0,10);
  const todayTx = txs.filter(c => c.time && c.time.slice(0,10) === today);
  const histItem = document.querySelector('.drawer-item[data-view="history"]');
  if (histItem) {
    let badge = histItem.querySelector('.txn-badge');
    if (!badge && todayTx.length > 0) {
      badge = document.createElement('span'); badge.className = 'txn-badge';
      histItem.style.position = 'relative'; histItem.appendChild(badge);
    }
    if (badge) {
      badge.textContent = todayTx.length > 99 ? '99+' : todayTx.length;
      badge.classList.toggle('show', todayTx.length > 0);
    }
  }
  const bookItem = document.querySelector('.drawer-item[data-view="bookings"]');
  if (bookItem && DB.bookings?.length) {
    let badge = bookItem.querySelector('.txn-badge');
    if (!badge) { badge = document.createElement('span'); badge.className = 'txn-badge'; bookItem.style.position = 'relative'; bookItem.appendChild(badge); }
    badge.textContent = DB.bookings.length;
    badge.classList.add('show');
  }
}

// ── Initialization ──
function initApp() {
  applyTheme();
  buildDrawerMenu();
  showView('dashboard');
  setInterval(tickHeaderClock, 1000);
  tickHeaderClock();
  setTimeout(updateOfflineStatus, 1000);
  setInterval(checkDepartures, 60000);
  setTimeout(checkDepartures, 2000);
  updateDynamicBackground();
  setInterval(updateDynamicBackground, 60000);
  updateDrawerBadges();
  renderNotifCenter();
  addNotif('Welcome to Ocean Fast Ferries V400 Pro! 🚀', 'info');
  console.log('⛴️ Ocean Fast Ferries V400 Pro initialized');
}

// Start the app
initApp();
