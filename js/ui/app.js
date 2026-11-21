/* Source2Pay – app shell: router, auth, role-aware navigation, popovers, demo menu, per-module tour */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U, UI = PH.UI, S = PH.S, esc = U.esc;
  const App = (PH.App = {});
  const routes = [];
  const INTERNAL = ['buyer', 'quality', 'design', 'finance', 'ops', 'approver', 'leader', 'admin'];
  PH.INTERNAL = INTERNAL;
  PH.route = (path, fn, roles) => { const keys = []; const re = new RegExp('^' + path.replace(/:[a-zA-Z]+/g, (m) => { keys.push(m.slice(1)); return '([^/]+)'; }) + '$'); routes.push({ path, re, keys, fn, roles }); };

  // ---------- auth ----------
  const Auth = (PH.Auth = {});
  Auth.loginAs = (id) => { const u = PH.userById(id); PH.assert(u, 'Unknown user'); PH.session.set({ userId: id }); const v = u.vendorId && PH.vendor(u.vendorId); if (v && v.status === 'active') S.Gov.recordActivity(v.id); PH.Store.save(); return u; };
  Auth.logout = () => { PH.session.set(null); UI.state.pop = null; location.hash = '#/'; App.render(); };

  // ---------- navigation ----------
  const mk = (id, ico, label, href, roles, badge) => ({ id, ico, label, href, roles, badge });
  const nav = (u) => {
    const v = u.role === 'vendor', onb = v && u.onbId && !u.vendorId; const db = PH.db();
    const sec = [
      ['', [mk('dashboard', '▦', 'Dashboard', '#/dashboard', '*'), mk('approvals', '✔', 'Approvals', '#/approvals', ['approver', 'leader'], () => S.Dash.pendingApprovals().length)]],
      ['Vendors', [mk('onboarding', '🧾', 'Onboarding', '#/onboarding', INTERNAL, () => db.onboarding.filter((o) => S.Onb.isOpen(o)).length), onb ? mk('myreg', '📝', 'My registration', '#/onboarding/' + u.onbId, ['vendor']) : null, mk('vendors', '👥', 'Vendor master', '#/vendors', INTERNAL), v && !onb ? mk('profile', '🏢', 'My profile', '#/profile', ['vendor']) : null]],
      ['Sourcing', [mk('rfq', '📨', 'RFQs', '#/rfq', ['buyer', 'design', 'quality', 'finance', 'approver', 'leader', 'admin', 'vendor'].filter((r) => !(r === 'vendor' && onb))), mk('pan', '⚖', 'Price approval', '#/pan', ['buyer', 'finance', 'approver', 'leader', 'admin'])]],
      ['Orders', [mk('po', '📦', 'Purchase orders', '#/po', ['buyer', 'quality', 'finance', 'approver', 'leader', 'admin', 'vendor', 'ops', 'design']), mk('quality', '🔍', v ? 'Dispatch & inspection' : 'Quality', '#/quality', ['buyer', 'quality', 'vendor', 'leader', 'admin', 'ops']), mk('grn', '📥', 'Goods receipt', '#/grn', ['buyer', 'quality', 'finance', 'vendor', 'leader', 'admin', 'ops'])]],
      ['Finance', [mk('invoices', '🧮', 'Invoices', '#/invoices', ['buyer', 'finance', 'vendor', 'leader', 'admin', 'approver']), mk('payments', '💳', 'Payments', '#/payments', ['buyer', 'finance', 'vendor', 'leader', 'admin', 'approver'])]],
      ['Insights', [mk('performance', '📈', v ? 'My scorecard' : 'Performance', '#/performance', ['buyer', 'quality', 'finance', 'leader', 'admin', 'vendor', 'approver', 'design', 'ops'].filter((r) => !(r === 'vendor' && onb))), mk('reports', '📊', 'Reports', '#/reports', ['buyer', 'leader', 'admin', 'finance', 'quality', 'approver']), mk('tickets', '🎫', 'Tickets', '#/tickets', ['buyer', 'design', 'finance', 'quality', 'vendor', 'leader', 'admin', 'ops', 'approver'], () => Math.min(99, db.tickets.filter((t) => !['resolved', 'closed'].includes(t.status) && (v ? t.vendorId === u.vendorId : true)).length))]],
      ['Admin', [mk('admin', '⚙', 'Configuration', '#/admin', ['admin']), mk('audit', '🛡', 'Audit trail', '#/audit', ['admin', 'leader', 'finance'])]],
    ];
    return sec.map(([t, items]) => [t, items.filter((i) => i && (i.roles === '*' || i.roles.includes(u.role)))]).filter(([, items]) => items.length);
  };

  // ---------- routing ----------
  const parse = () => { const h = (location.hash || '#/').replace(/^#/, ''); return h.split('?')[0] || '/'; };
  const match = (p) => { for (const r of routes) { const m = r.re.exec(p); if (m) { const params = {}; r.keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]); }); return { r, params }; } } return null; };
  const navId = () => parse().split('/')[1] || 'dashboard';

  App.render = function () {
    const root = document.getElementById('app'); const u = PH.me(); const y = window.scrollY;
    if (!u) { root.innerHTML = PH.Pages.login(); window.scrollTo(0, 0); document.title = 'Source2Pay'; return; }
    const p = parse(); if (p === '/' || p === '') { location.hash = '#/dashboard'; return; }
    const m = match(p); let body;
    if (!m) body = UI.pageHead({ title: 'Page not found' }) + UI.card({ body: UI.empty('🧭', 'Page not found', '<a href="#/dashboard">Go to dashboard</a>') });
    else if (m.r.roles && !m.r.roles.includes(u.role)) body = UI.pageHead({ title: 'Access denied' }) + UI.card({ cls: 'err', body: UI.banner('err', '⛔', 'Your role (' + esc(PH.ROLES[u.role].label) + ') cannot open this page.') });
    else {
      const v = u.vendorId && PH.vendor(u.vendorId);
      if (v && v.status === 'dormant' && !['/dashboard', '/profile', '/tickets', '/notifications', '/performance'].some((x) => p === x || p.startsWith(x + '/'))) body = UI.pageHead({ title: 'Account dormant' }) + UI.card({ cls: 'warn', body: UI.banner('warn', '⏸', 'Your account is dormant. <a href="#/profile">Request reactivation</a>.') });
      else { try { const out = m.r.fn(m.params, u); body = typeof out === 'string' ? out : out.html; } catch (e) { console.error(e); body = UI.pageHead({ title: 'Something went wrong' }) + UI.card({ cls: 'err', body: UI.banner('err', '⚠', '<b>' + esc(e.message) + '</b>') }); } }
    }
    root.innerHTML = shell(u, body); document.title = (App.title || 'Source2Pay') + ' · Source2Pay'; App.title = null;
    if (UI.state.pop) App.popover(UI.state.pop);
    window.scrollTo(0, App._keepScroll ? y : 0); App._keepScroll = false;
  };
  App.refresh = () => { App._keepScroll = true; App.render(); };
  window.addEventListener('hashchange', () => { UI.state.pop = null; Tour.end(); App.render(); });
  document.addEventListener('click', (e) => { const sb = document.getElementById('sidebar'); if (sb && sb.classList.contains('open') && !e.target.closest('#sidebar') && !e.target.closest('.menu-btn')) sb.classList.remove('open'); });

  // ---------- shell ----------
  function shell(u, body) {
    const cur = navId(); const unread = PH.Notify.unread(u);
    const side = nav(u).map(([t, items]) => (t ? '<h5>' + esc(t) + '</h5>' : '') + items.map((i) => { const n = i.badge ? i.badge() : 0; const on = cur === i.id || (i.id === 'myreg' && cur === 'onboarding'); return '<a href="' + i.href + '" class="' + (on ? 'on' : '') + '"><span class="ni">' + i.ico + '</span>' + esc(i.label) + (n ? '<span class="nb ' + (i.id === 'approvals' ? '' : 'soft') + '">' + n + '</span>' : '') + '</a>'; }).join('')).join('');
    const off = PH.db().clock.days;
    return '<div class="shell"><aside class="sidebar" id="sidebar"><div class="brand"><div class="logo">S</div><div><b>Source2Pay</b><small>by Ajinkya Hatekar</small></div></div><nav class="nav" aria-label="Main">' + side + '</nav></aside>' +
      '<div class="main"><header class="topbar no-print"><button class="iconbtn menu-btn" data-act="toggleNav" aria-label="Menu">☰</button><div class="crumbs"><b>' + esc(PH.ROLES[u.role].label) + '</b>' + (u.role === 'vendor' ? ' · ' + esc(u.name) : '') + (off ? ' · <span class="chip amber nodot">' + U.d(PH.now()) + '</span>' : '') + '</div>' +
      (Tour.has() ? '<button class="btn sm" id="btn-tour" data-act="startTour" title="Walk through this module">Tour</button>' : '') +
      '<div class="pop-anchor" style="position:relative"><button class="iconbtn" id="btn-demo" data-act="pop" data-p="demo" title="Demo menu" aria-label="Demo menu">⋯</button></div>' +
      '<button class="iconbtn" data-act="toggleTheme" title="Light / dark" aria-label="Toggle theme">◐</button>' +
      '<div class="pop-anchor" style="position:relative"><button class="iconbtn" id="btn-bell" data-act="pop" data-p="bell" aria-label="Notifications">🔔' + (unread ? '<span class="bdg">' + Math.min(unread, 99) + '</span>' : '') + '</button></div>' +
      '<div class="pop-anchor" style="position:relative"><button class="userbtn" id="btn-user" data-act="pop" data-p="user">' + UI.avatar(u.name, 'sm') + '<div><div class="un">' + esc(PH.ROLES[u.role].label) + '</div><div class="ur">Switch module</div></div></button></div></header>' +
      '<main class="content" id="main">' + body + '</main></div></div>';
  }
  PH.act.toggleNav = (el, e) => { if (e) e.stopPropagation(); document.getElementById('sidebar').classList.toggle('open'); };
  PH.act.toggleTheme = () => { const d = document.documentElement; const dark = d.getAttribute('data-theme') === 'dark'; d.setAttribute('data-theme', dark ? 'light' : 'dark'); try { localStorage.setItem('ph.theme', dark ? 'light' : 'dark'); } catch (e) { /* ignore */ } };
  PH.act.logout = () => Auth.logout();

  // ---------- popovers ----------
  PH.act.pop = (el, e) => { e.stopPropagation(); const p = el.dataset.p; const open = UI.state.pop === p; document.querySelectorAll('.pop').forEach((x) => x.remove()); if (open) { UI.state.pop = null; return; } UI.state.pop = p; App.popover(p); };
  App.popover = (p) => {
    const u = PH.me(); document.querySelectorAll('.pop').forEach((x) => x.remove()); let html = '', anchor = null;
    if (p === 'bell') {
      anchor = document.getElementById('btn-bell').parentNode; const list = PH.Notify.visible(u).slice(0, 10);
      html = '<div class="pop wide"><div class="pop-h"><span>Notifications</span><button class="btn xs" data-act="readAll">Mark all read</button></div><div class="pop-b">' + (list.length ? list.map((n) => '<a class="pop-i ' + (n.readBy.includes(u.id) ? '' : 'un') + '" href="' + esc(n.link || '#/notifications') + '" data-act="readOne" data-id="' + n.id + '"><div class="pt">' + esc(n.title) + '</div><div class="ps">' + esc(n.body).slice(0, 100) + ' · ' + U.ago(n.at) + '</div></a>').join('') : '<div class="empty">No notifications</div>') + '</div><a class="pop-i center" href="#/notifications">View all</a></div>';
    } else if (p === 'user') {
      anchor = document.getElementById('btn-user').parentNode;
      const users = PH.db().users.filter((x) => PH.Pages.personaMeta[x.id]);
      html = '<div class="pop wide"><div class="pop-b">' + users.map((x) => '<a class="pop-i persona-item" href="#" data-act="switchUser" data-id="' + x.id + '">' + UI.avatar(PH.Pages.personaMeta[x.id].label) + '<div><div class="pt">' + esc(PH.Pages.personaMeta[x.id].label) + (x.id === u.id ? ' ✓' : '') + '</div></div></a>').join('') + '</div><a class="pop-i" href="#" data-act="logout"><b>Sign out</b></a></div>';
    } else if (p === 'demo') {
      anchor = document.getElementById('btn-demo').parentNode; const d = PH.db().clock.days;
      html = '<div class="pop"><div class="pop-b"><div class="pop-i static"><div class="pt">Fast-forward time</div><div class="ps">Triggers dormancy, MSME expiry, overdue approvals and payments.</div><div class="row wrap gap-sm mt">' + [7, 30, 90].map((n) => '<button class="btn xs" data-act="travel" data-d="' + n + '">+' + n + ' d</button>').join('') + (d ? '<button class="btn xs ghost" data-act="travel" data-d="reset">Today</button>' : '') + '</div></div><a class="pop-i" href="#" data-act="resetData"><div class="pt">Reset demo data</div><div class="ps">Restore the original sample data.</div></a></div></div>';
    }
    if (anchor) anchor.insertAdjacentHTML('beforeend', html);
  };
  PH.act.readAll = () => { PH.Notify.markRead(PH.me()); UI.state.pop = null; App.refresh(); };
  PH.act.readOne = (el) => { PH.Notify.markRead(PH.me(), el.dataset.id); UI.state.pop = null; };
  PH.act.switchUser = (el, e) => { if (e) e.preventDefault(); UI.state.pop = null; Auth.loginAs(el.dataset.id); location.hash = '#/dashboard'; App.render(); };
  PH.act.travel = (el) => {
    UI.state.pop = null;
    if (el.dataset.d === 'reset') { PH.setClockDays(0); App.refresh(); return; }
    PH.setClockDays(PH.db().clock.days + Number(el.dataset.d)); const o = S.Gov.tick();
    const bits = [['dormant', 'vendor(s) went dormant'], ['closed', 'account(s) closed'], ['msmeLapsed', 'vendor(s) lost MSME status'], ['rfqClosed', 'RFQ(s) closed'], ['escalated', 'approval(s) escalated'], ['paid', 'payment(s) released']].filter(([k]) => o[k]).map(([k, t]) => o[k] + ' ' + t);
    UI.toast('Now ' + U.d(PH.now()), 'ok', bits.join(' · ')); App.refresh();
  };
  PH.act.resetData = (el, e) => { if (e) e.preventDefault(); UI.state.pop = null; UI.confirm({ title: 'Reset demo data?', text: 'All changes are discarded and the original sample data is restored.', ok: 'Reset', danger: true }, () => { const s = PH.session.get(); PH.Store.reset(); if (s) PH.session.set(s); location.hash = '#/dashboard'; App.render(); }); };

  // ---------- per-module tour (spotlight; steps are filtered to elements present on the page) ----------
  const Tour = (PH.Tour = {});
  const T = (sel, t, d) => ({ sel, t, d });
  const STEPS = {
    dashboard: [T('.kpi', 'Key figures', 'Each tile counts live records. Tiles with a link open the matching list.'), T('.card .vopt', 'Needs your attention', 'Items waiting for your action.'), T('#btn-user', 'Switch module', 'Change role any time to see the process from another seat.')],
    approvals: [T('#appr', 'Approval queue', 'Everything waiting for a decision, with the level it is pending at.'), T('[data-act="decide"]', 'Decide', 'Approve, reject or return with remarks. Levels follow the approval matrix.')],
    onboarding: [T('.pillbtn', 'Stages', 'Filter requests by where they are in the pipeline.'), T('#onbt', 'Pipeline', 'Each request moves from screening to an active vendor. Open one for the next step.'), T('[data-act="newOnb"]', 'Recommend a vendor', 'Starts a request and checks the vendor master for duplicates.')],
    'onboarding:detail': [T('.stepper', 'Lifecycle', 'Screening, invitation, registration, review, audit, approval and activation.'), T('.card.accent', 'Next step', 'Only the action available to your role at this stage is shown.'), T('.tabs', 'Details', 'Registration data, self-assessment, reviews, queries and activity.')],
    vendors: [T('.pillbtn', 'Status filter', 'Active, dormant, closed, blocked or blacklisted.'), T('#vt', 'Vendor master', 'Status, MSME, performance score and last activity per vendor.')],
    'vendors:detail': [T('.tabs', 'Views', 'Overview, lifecycle history and transactions.'), T('.page-h .actions', 'Governance actions', 'Re-evaluate, change categories or propose a blacklist.'), T('.kv', 'Compliance', 'MSME validity, payment terms and dormancy countdown.')],
    profile: [T('.kv', 'Your compliance', 'Status, MSME validity and payment terms.'), T('[data-act="msmeUpload"]', 'Renew MSME', 'Upload the renewed certificate before the annual deadline.'), T('[data-act="reqChange"]', 'Change bank / GST / PAN', 'Goes to Finance for approval.')],
    rfq: [T('.pillbtn', 'Status filter', 'Draft, published, closed or awarded.'), T('#rfqt', 'RFQs', 'Responses received, deadline and status.'), T('[data-act="newRfq"]', 'New RFQ', 'Create an RFQ from a released purchase requisition.')],
    'rfq:detail': [T('.stepper', 'Progress', 'Draft to awarded.'), T('.tabs', 'Tabs', 'Overview, vendors & responses, access log and activity.'), T('form[data-form="publishRfq"]', 'Select vendors', 'Eligibility flags show blocked, low-performing or non-compliant vendors.'), T('form[data-calc]', 'Quotation', 'Totals update as rates are entered. Negotiation rounds appear here.')],
    pan: [T('#pant', 'Price approval notes', 'Recommended vendor, value, savings and approval level.')],
    'pan:detail': [T('.pan-head', 'Procurement context', 'RFQ, PR, WBS, project and owner.'), T('.kpi', 'Savings', 'Budget, system value, selected value and savings.'), T('.cmp', 'Comparison', 'Final offers side by side. L1 is the lowest total evaluated value.'), T('form[data-form="savePan"]', 'Recommendation', 'Justifications appear when needed (non-L1, price increase, fewer quotes).'), T('.chain-i', 'Approval chain', 'Routed by value, advance and payment terms; locked after final approval.')],
    po: [T('.pillbtn', 'Status', 'Awaiting acceptance, accepted or in revision.'), T('#pot', 'Purchase orders', 'Value, delivery progress and open discussions.')],
    'po:detail': [T('.stepper', 'Order progress', 'From release to goods received.'), T('.page-h .actions', 'Actions', 'Accept, raise a query, download or revise.'), T('table.tbl', 'Lines', 'Ready, approved, dispatched and received quantities per line.')],
    quality: [T('#irt', 'Inspection requests', 'Every request with its cycle count and status.'), T('.pillbtn', 'Filter', 'Awaiting inspection, rework or approved.')],
    'quality:detail': [T('.tl', 'Inspection history', 'Each cycle is time-stamped.'), T('.page-h .actions', 'Inspect', 'Run the checklist and approve, partially approve or reject.')],
    grn: [T('#pendrec', 'Pending receipt', 'Dispatched material waiting to be received.'), T('#grnt', 'Receipts', 'Short, excess, rejected and damaged quantities per GRN.')],
    'grn:detail': [T('table.tbl', 'Receipt lines', 'Ordered, dispatched, received and exceptions per line.')],
    invoices: [T('.kpi', 'Invoice counts', 'Submitted, under processing, approved and rejected.'), T('#invt', 'Invoices', 'Status and due date per invoice.')],
    'invoices:detail': [T('.stepper', 'Invoice status', 'Submitted to paid.'), T('.page-h .actions', 'Finance actions', 'Approve, hold or reject.'), T('.kv', 'Details', 'Amounts, match result and payment schedule.')],
    payments: [T('.tabs', 'Views', 'Schedule, released payments and TDS / payment advice.'), T('.tbl', 'Payments', 'Due, delayed and processed payments.')],
    'payments:detail': [T('.tbl', 'Deductions', 'Gross, deductions and net paid.'), T('[data-act="print"]', 'Advice', 'Print the payment advice.')],
    performance: [T('#prf', 'Ranking', 'Weighted score per vendor, with trend against the previous quarter.')],
    'performance:detail': [T('.kpi', 'Score', 'Current vs previous quarter.'), T('table.tbl', 'Parameters', 'Delivery, quality, commercial, participation, responsiveness, compliance and engagement.')],
    tickets: [T('.pillbtn', 'Status', 'Open, in progress, waiting on vendor, resolved or closed.'), T('#tkt', 'Tickets', 'Priority, category and owner.')],
    'tickets:detail': [T('.msg', 'Conversation', 'Full history is kept; internal comments are hidden from vendors.'), T('.page-h .actions', 'Status', 'Only the buyer and category owner can change status; only the buyer closes.')],
    reports: [T('.tabs', 'Reports', 'Vendors by category, onboarding, savings, cycle time and tickets.')],
    admin: [T('.tabs', 'Configuration areas', 'Masters, questionnaire, checklists, approval matrix, rules, users, notifications and templates.'), T('.card', 'Live settings', 'Changes apply immediately across the app.')],
    audit: [T('#audt', 'Audit trail', 'Every change with actor, role and time.')],
    notifications: [T('#main .card', 'Alerts', 'In-app notifications for your role.')],
  };
  Tour.key = () => { const p = parse().split('/').filter(Boolean); const id = p[0] || 'dashboard'; return p.length > 1 && STEPS[id + ':detail'] ? id + ':detail' : id; };
  Tour.has = () => { const u = PH.me(); if (u && u.role === 'vendor' && !u.vendorId && /^(profile|performance)/.test(Tour.key())) return false; return !!STEPS[Tour.key()]; };
  Tour.start = () => {
    Tour.end(); let steps = (STEPS[Tour.key()] || []).filter((s) => document.querySelector(s.sel)); if (!steps.length) steps = (STEPS[Tour.key().split(':')[0] + ':detail'] || []).filter((s) => document.querySelector(s.sel)); if (!steps.length) { UI.toast('No tour for this screen'); return; }
    let i = 0; const mask = document.createElement('div'); mask.className = 'tour-mask'; const spot = document.createElement('div'); spot.className = 'tour-spot'; const pop = document.createElement('div'); pop.className = 'tour-pop'; document.body.append(mask, spot, pop); Tour.els = [mask, spot, pop];
    const show = () => {
      const s = steps[i]; const el = document.querySelector(s.sel); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); const pad = 6;
      Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: Math.min(r.height, innerHeight - 40) + pad * 2 + 'px' });
      pop.innerHTML = '<h3>' + esc(s.t) + '</h3><p class="text2">' + esc(s.d) + '</p><div class="row between mt"><span class="muted small">' + (i + 1) + ' / ' + steps.length + '</span><div class="row gap-sm"><button class="btn sm ghost" data-t="skip">Close</button>' + (i ? '<button class="btn sm" data-t="back">Back</button>' : '') + '<button class="btn sm primary" data-t="next">' + (i === steps.length - 1 ? 'Done' : 'Next') + '</button></div></div>';
      const pw = 340; let left = r.left, top = r.bottom + 14; if (top + 190 > innerHeight) top = Math.max(12, r.top - 200); if (left + pw > innerWidth - 12) left = innerWidth - pw - 12; Object.assign(pop.style, { left: Math.max(12, left) + 'px', top: Math.max(12, top) + 'px' });
    };
    pop.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; const a = b.dataset.t; if (a === 'skip') Tour.end(); else if (a === 'back') { i--; show(); } else if (i === steps.length - 1) Tour.end(); else { i++; show(); } });
    mask.addEventListener('click', Tour.end); show();
  };
  Tour.end = () => { (Tour.els || []).forEach((e) => e.remove()); Tour.els = null; };
  PH.act.startTour = () => Tour.start();

  // ---------- boot ----------
  App.boot = function () {
    try { const th = localStorage.getItem('ph.theme'); if (th) document.documentElement.setAttribute('data-theme', th); } catch (e) { /* ignore */ }
    PH.Store.load();
    if (!PH.me() && PH.session.get()) PH.session.set(null);
    App.render();
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  };
})(typeof window !== 'undefined' ? window : globalThis);
