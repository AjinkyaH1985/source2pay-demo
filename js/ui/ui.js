/* Source2Pay – UI component helpers (string templates + event delegation; no framework, no build step) */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U, esc = U.esc;
  const UI = (PH.UI = { state: { tab: {}, pop: null, filter: {} } });
  PH.act = {}; // delegated action handlers: data-act="name"

  // ---------- status → chip tone ----------
  const TONE = {
    green: ['active', 'approved', 'paid', 'complete', 'accepted', 'resolved', 'closed_ok', 'awarded', 'qualify', 'pass', 'recommend', 'ok', 'final', 'received', 'satisfactory', 'matched', 'posted', 'synced', 'done', 'released_ok', 'answered', 'compliant'],
    amber: ['pending', 'draft', 'in_approval', 'screening', 'invite', 'registration', 'review', 'audit_decision', 'third_party', 'consolidation', 'released', 'requested', 'reinspect', 'rework', 'partial', 'dormant', 'in_progress', 'waiting_vendor', 'invited', 'viewed', 'submitted', 'payment scheduled', 'in transit', 'parked (grn awaited)', 'received', 'conditional', 'returned', 'open', 'setup', 'low', 'medium'],
    red: ['rejected', 'blacklisted', 'blocked', 'cancelled', 'fail', 'not_recommend', 'not_awarded', 'no_response', 'regret', 'unsatisfactory', 'error', 'urgent', 'high', 'not_qualify', 'closed', 'expired', 'lapsed', 'major'],
    blue: ['published', 'approval', 'negotiation', 'revision_pending', 'inspected', 'audit', 'in_review', 'reopened', 'draft_saved'],
    violet: ['negotiation', 'final'], teal: ['awarded'],
  };
  const LABEL = { in_approval: 'In approval', audit_decision: 'Audit decision', third_party: 'Third-party', revision_pending: 'Revision pending', waiting_vendor: 'Waiting on vendor', in_progress: 'In progress', no_response: 'No response', not_awarded: 'Not awarded', not_recommend: 'Not recommended', not_qualify: 'Not recommended', setup: 'Vendor ID creation', invite: 'Invitation', registration: 'Registration', consolidation: 'Consolidation', approval: 'Executive approval', screening: 'Screening', review: 'Internal review', audit: 'Physical audit', active: 'Active', reinspect: 'Re-inspection', rework: 'Rework', pending_buyer: 'Pending buyer', pending_head: 'Pending Head of Procurement', reopen_requested: 'Reopen requested' };
  UI.tone = (s) => { const k = String(s).toLowerCase(); if (TONE.violet.includes(k) && k === 'negotiation') return 'violet'; for (const t of ['green', 'red', 'amber', 'blue']) if (TONE[t].includes(k)) return t; return 'gray'; };
  UI.status = (s, label) => { if (s == null || s === '') return ''; const k = String(s); return '<span class="chip ' + UI.tone(k) + '">' + esc(label || LABEL[k] || (k.charAt(0).toUpperCase() + k.slice(1).replace(/_/g, ' '))) + '</span>'; };
  UI.chip = (text, tone) => '<span class="chip ' + (tone || '') + '">' + esc(text) + '</span>';
  UI.erp = (ref) => '<span class="ref">' + esc(ref) + '</span>'; // plain reference tag
  UI.score = (n) => '<span class="score ' + (n >= 75 ? 'hi' : n >= PH.cfg().rules.lowPerformerBelow ? 'mid' : 'lo') + '">' + U.round(n, 1) + '</span>';
  UI.avatar = (name, cls) => '<span class="avatar ' + (cls || '') + '" style="background:hsl(' + (U.hash(name) % 360) + ',48%,42%)">' + esc(U.initials(name)) + '</span>';
  UI.kpi = ({ label, value, sub, tone, href }) => (href ? '<a class="kpi' : '<div class="kpi') + (tone ? ' t-' + tone : '') + '"' + (href ? ' href="' + esc(href) + '"' : '') + '><div class="k-l">' + esc(label) + '</div><div class="k-v">' + value + '</div>' + (sub ? '<div class="k-s">' + sub + '</div>' : '') + (href ? '</a>' : '</div>');
  UI.card = ({ title, sub, actions, body, flush, cls, foot }) => '<section class="card ' + (cls || '') + '">' + (title ? '<div class="card-h"><div><h3>' + title + '</h3>' + (sub ? '<div class="small muted">' + sub + '</div>' : '') + '</div><div class="row gap-sm">' + (actions || '') + '</div></div>' : '') + '<div class="card-b' + (flush ? ' flush' : '') + '">' + body + '</div>' + (foot ? '<div class="card-f">' + foot + '</div>' : '') + '</section>';
  UI.btn = (label, act, o) => { o = o || {}; return '<button type="button" class="btn ' + (o.cls || '') + '" data-act="' + act + '"' + Object.keys(o.data || {}).map((k) => ' data-' + k + '="' + esc(o.data[k]) + '"').join('') + (o.title ? ' title="' + esc(o.title) + '"' : '') + (o.disabled ? ' disabled' : '') + '>' + label + '</button>'; };
  UI.link = (label, href, cls) => '<a class="btn ' + (cls || '') + '" href="' + esc(href) + '">' + label + '</a>';
  UI.empty = (icon, title, text) => '<div class="empty"><div class="ico">' + icon + '</div><b>' + esc(title) + '</b><div>' + (text || '') + '</div></div>';
  UI.banner = (tone, icon, html) => '<div class="banner ' + tone + '"><div class="b-ico">' + icon + '</div><div class="grow">' + html + '</div></div>';
  UI.pageHead = ({ title, sub, actions, back }) => '<div class="page-h"><div>' + (back ? '<a class="back" href="' + back[1] + '">← ' + esc(back[0]) + '</a>' : '') + '<h1>' + title + '</h1>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div><div class="actions no-print">' + (actions || '') + '</div></div>';
  UI.kv = (pairs, cls) => '<dl class="kv ' + (cls || '') + '">' + pairs.filter((p) => p).map(([k, v]) => '<dt>' + esc(k) + '</dt><dd>' + (v == null || v === '' ? '<span class="muted">—</span>' : v) + '</dd>').join('') + '</dl>';
  UI.tabs = (key, items, cur) => { cur = cur || UI.state.tab[key] || items[0].id; return '<div class="tabs" role="tablist">' + items.map((i) => '<button class="tab ' + (cur === i.id ? 'on' : '') + '" role="tab" data-act="tab" data-k="' + key + '" data-v="' + i.id + '">' + esc(i.label) + (i.n != null ? '<span class="n">' + i.n + '</span>' : '') + '</button>').join('') + '</div>'; };
  UI.curTab = (key, def) => UI.state.tab[key] || def;
  PH.act.tab = (el) => { UI.state.tab[el.dataset.k] = el.dataset.v; PH.App.refresh(); };
  UI.pills = (key, items, cur) => '<div class="tabbar-mini">' + items.map((i) => '<button class="pillbtn ' + (cur === i.id ? 'on' : '') + '" data-act="tab" data-k="' + key + '" data-v="' + i.id + '">' + esc(i.label) + (i.n != null ? '<span class="n">' + i.n + '</span>' : '') + '</button>').join('') + '</div>';
  UI.stepper = (steps, curIdx, opts) => { opts = opts || {}; return '<div class="stepper">' + steps.map((s, i) => '<div class="step ' + ((opts.skip || []).includes(i) ? 'skip ' : '') + (opts.bad === i ? 'bad ' : i < curIdx ? 'done ' : i === curIdx ? 'cur' : '') + '"><div class="bub">' + (i < curIdx && opts.bad !== i && !(opts.skip || []).includes(i) ? '✓' : opts.bad === i ? '✕' : i + 1) + '</div>' + esc(s.l || s) + '</div>').join('') + '</div>'; };
  UI.timeline = (items) => '<div class="tl">' + items.map((i) => '<div class="tl-i ' + (i.tone || '') + '"><div class="t">' + i.title + '</div>' + (i.date ? '<div class="d">' + esc(i.date) + '</div>' : '') + (i.text ? '<div class="r">' + i.text + '</div>' : '') + '</div>').join('') + '</div>';
  UI.hint = () => '';
  PH.act.hideHint = (el) => { try { const h = JSON.parse(localStorage.getItem('ph.hints') || '{}'); h[el.dataset.k] = 1; localStorage.setItem('ph.hints', JSON.stringify(h)); } catch (e) { /* ignore */ } PH.App.refresh(); };

  // ---------- tables ----------
  UI.table = ({ id, cols, rows, href, empty, search, tools, compact, rowCls, attrs }) => {
    id = id || 't' + Math.random().toString(36).slice(2, 7);
    const head = '<tr>' + cols.map((c) => '<th class="' + (c.cls || '') + '">' + (c.h || '') + '</th>').join('') + '</tr>';
    const body = rows.map((r, i) => { const h = href ? href(r) : null; return '<tr data-row ' + (h ? 'class="click ' + (rowCls ? rowCls(r) : '') + '" data-href="' + esc(h) + '"' : 'class="' + (rowCls ? rowCls(r) : '') + '"') + '>' + cols.map((c) => '<td class="' + (c.cls || '') + '" data-label="' + esc(String(c.h || '').replace(/<[^>]+>/g, '')) + '">' + (c.r ? c.r(r, i) : esc(r[c.k])) + '</td>').join('') + '</tr>'; }).join('');
    const toolbar = search || tools ? '<div class="table-tools no-print">' + (search ? '<div class="search"><input class="input" style="width:260px" placeholder="' + esc(search === true ? 'Search…' : search) + '" data-filter="' + id + '" aria-label="Search table"></div>' : '') + (tools || '') + '</div>' : '';
    return toolbar + '<div class="tbl-wrap"><table class="tbl stack ' + (compact ? 'compact' : '') + '" id="' + id + '" ' + (attrs || '') + '><thead>' + head + '</thead><tbody>' + (rows.length ? body : '<tr><td colspan="' + cols.length + '">' + (empty || UI.empty('📭', 'Nothing here yet', 'Records will appear here.')) + '</td></tr>') + '</tbody></table></div>';
  };

  // ---------- forms ----------
  UI.opts = (list, val, blank) => (blank ? '<option value="">' + esc(blank) + '</option>' : '') + list.map((o) => { const v = typeof o === 'object' ? (o.v != null ? o.v : o.id) : o; const l = typeof o === 'object' ? (o.l || o.label || o.name) : o; return '<option value="' + esc(v) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + esc(l) + '</option>'; }).join('');
  UI.field = (o) => {
    const t = o.type || 'text', v = o.value == null ? '' : o.value, nm = esc(o.name), a = o.attrs || '';
    let inp;
    if (t === 'select') inp = '<select class="select" name="' + nm + '" ' + a + (o.change ? ' data-change="' + o.change + '"' : '') + '>' + UI.opts(o.options, v, o.blank) + '</select>';
    else if (t === 'textarea') inp = '<textarea class="textarea" name="' + nm + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.placeholder || '') + '" ' + a + '>' + esc(v) + '</textarea>';
    else if (t === 'checkbox') return '<label class="check ' + (o.cls || '') + '"><input type="checkbox" name="' + nm + '" ' + (v ? 'checked' : '') + ' ' + a + '><span>' + o.label + (o.required ? '<span class="req">*</span>' : '') + '</span></label>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '');
    else if (t === 'radio') inp = '<div class="radio-row">' + o.options.map((x) => '<label><input type="radio" name="' + nm + '" value="' + esc(x.v) + '" ' + (String(v) === String(x.v) ? 'checked' : '') + '>' + esc(x.l) + '</label>').join('') + '</div>';
    else if (t === 'file') return UI.fileField(o);
    else inp = '<input class="input" type="' + t + '" name="' + nm + '" value="' + esc(v) + '" placeholder="' + esc(o.placeholder || '') + '" ' + (o.min != null ? 'min="' + o.min + '" ' : '') + (o.max != null ? 'max="' + o.max + '" ' : '') + (o.step ? 'step="' + o.step + '" ' : '') + (o.readonly ? 'readonly ' : '') + (o.maxlength ? 'maxlength="' + o.maxlength + '" ' : '') + (o.upper ? 'style="text-transform:uppercase" ' : '') + a + '>';
    return '<div class="field ' + (o.cls || '') + '">' + (o.label ? '<label>' + o.label + (o.required ? '<span class="req">*</span>' : '') + '</label>' : '') + inp + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '<div class="errmsg" data-err="' + nm + '"></div></div>';
  };
  UI.fileField = (o) => '<div class="field ' + (o.cls || '') + '">' + (o.label ? '<label>' + o.label + (o.required ? '<span class="req">*</span>' : '') + '</label>' : '') + '<div class="fileline"><span class="fn ' + (o.value ? '' : 'muted') + '" data-fn="' + esc(o.name) + '">' + esc(o.value || 'No file chosen') + '</span><input type="hidden" name="' + esc(o.name) + '" value="' + esc(o.value || '') + '"><input type="file" hidden data-file-for="' + esc(o.name) + '"><button type="button" class="btn xs" data-act="pickFile">Choose</button><button type="button" class="btn xs ghost" data-act="sampleFile" data-sample="' + esc(o.sample || (o.name.split('.').pop() + '_sample.pdf')) + '" title="Attach a sample file (demo)">Use sample</button></div>' + (o.hint ? '<div class="hint">' + o.hint + '</div>' : '') + '<div class="errmsg" data-err="' + esc(o.name) + '"></div></div>';
  PH.act.pickFile = (el) => { el.closest('.fileline').querySelector('input[type=file]').click(); };
  PH.act.sampleFile = (el) => { const w = el.closest('.fileline'); const nm = el.dataset.sample.replace(/[^A-Za-z0-9._-]+/g, '_'); w.querySelector('input[type=hidden]').value = nm; const fn = w.querySelector('.fn'); fn.textContent = nm; fn.classList.remove('muted'); };
  document.addEventListener('change', (e) => { const f = e.target.closest && e.target.closest('input[type=file][data-file-for]'); if (f && f.files[0]) { const w = f.closest('.fileline'); w.querySelector('input[type=hidden]').value = f.files[0].name; const fn = w.querySelector('.fn'); fn.textContent = f.files[0].name + ' (' + Math.round(f.files[0].size / 1024) + ' KB)'; fn.classList.remove('muted'); } });
  // flat form → object; dotted names are nested; checkboxes → boolean (or array when data-array)
  UI.formFlat = (form) => {
    const o = {}; form.querySelectorAll('[name]').forEach((el) => {
      if (el.disabled) return; const n = el.name;
      if (el.type === 'checkbox') { if (el.hasAttribute('data-array')) { if (el.checked) (o[n] = o[n] || []).push(el.value); else o[n] = o[n] || []; } else o[n] = el.checked; }
      else if (el.type === 'radio') { if (el.checked) o[n] = el.value; else if (!(n in o)) o[n] = ''; }
      else o[n] = el.value;
    }); return o;
  };
  UI.nest = (flat) => { const o = {}; Object.keys(flat).forEach((k) => { const p = k.split('.'); let c = o; p.forEach((s, i) => { if (i === p.length - 1) c[s] = flat[k]; else c = c[s] = c[s] || {}; }); }); return o; };
  UI.formObj = (form) => UI.nest(UI.formFlat(form));
  UI.clearErrors = (root) => { root.querySelectorAll('.err').forEach((e) => e.classList.remove('err')); root.querySelectorAll('[data-err]').forEach((e) => { e.textContent = ''; }); const b = root.querySelector('.form-errors'); if (b) b.innerHTML = ''; };
  UI.setErrors = (root, fields) => {
    UI.clearErrors(root); const left = [];
    Object.keys(fields || {}).forEach((k) => { const el = root.querySelector('[name="' + CSS.escape(k) + '"]'); const m = root.querySelector('[data-err="' + CSS.escape(k) + '"]'); if (el) el.classList.add('err'); if (m) m.textContent = fields[k]; else left.push(fields[k]); if (!el && !m) return; });
    const first = root.querySelector('.err') || root.querySelector('.errmsg:not(:empty)'); if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const b = root.querySelector('.form-errors'); if (b && left.length) b.innerHTML = UI.banner('err', '⚠', left.map(esc).join('<br>'));
  };
  UI.errBox = () => '<div class="form-errors"></div>';

  // ---------- run service calls with toasts ----------
  UI.run = function (fn, o) {
    o = o || {};
    try { const r = fn(); PH.Store.save(); if (o.ok) UI.toast(typeof o.ok === 'function' ? o.ok(r) : o.ok, o.tone || 'ok'); if (o.after) o.after(r); if (o.refresh !== false) PH.App.refresh(); return { ok: true, value: r }; }
    catch (e) {
      if (e instanceof PH.Err) { if (o.form && e.fields) UI.setErrors(o.form, e.fields); UI.toast(e.message, 'err', e.fields && !o.form ? Object.values(e.fields).slice(0, 3).join(' • ') : ''); return { ok: false, error: e }; }
      console.error(e); UI.toast('Unexpected error: ' + e.message, 'err'); return { ok: false, error: e };
    }
  };

  // ---------- toast / modal / drawer ----------
  UI.toast = (msg, tone, sub) => { let c = document.querySelector('.toasts'); if (!c) { c = document.createElement('div'); c.className = 'toasts'; c.setAttribute('role', 'status'); c.setAttribute('aria-live', 'polite'); document.body.appendChild(c); } const t = document.createElement('div'); t.className = 'toast ' + (tone || ''); t.innerHTML = '<div><div class="tt">' + esc(msg) + '</div>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>'; c.appendChild(t); setTimeout(() => t.remove(), tone === 'err' ? 7000 : 3800); };
  UI.modal = function ({ title, body, size, buttons, onOpen, noClose }) {
    const ov = document.createElement('div'); ov.className = 'overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="modal ' + (size || '') + '"><div class="modal-h"><h2>' + title + '</h2>' + (noClose ? '' : '<button class="btn ghost icon sm" data-close aria-label="Close">✕</button>') + '</div><div class="modal-b">' + body + '</div>' + ((buttons || []).length ? '<div class="modal-f">' + buttons.map((b, i) => '<button type="button" class="btn ' + (b.cls || '') + '" data-mb="' + i + '">' + b.label + '</button>').join('') + '</div>' : '') + '</div>';
    const close = () => { ov.remove(); document.removeEventListener('keydown', esc_); }; const esc_ = (e) => { if (e.key === 'Escape' && !noClose) close(); };
    document.addEventListener('keydown', esc_); ov.addEventListener('mousedown', (e) => { if (e.target === ov && !noClose) close(); });
    ov.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    (buttons || []).forEach((b, i) => ov.querySelector('[data-mb="' + i + '"]').addEventListener('click', () => { if (b.fn) { const r = b.fn(ov, close); if (r === false) return; } if (b.close !== false) close(); }));
    document.body.appendChild(ov); const f = ov.querySelector('input:not([type=hidden]),textarea,select'); if (f) f.focus(); if (onOpen) onOpen(ov, close); ov.close = close; return ov;
  };
  UI.drawer = function ({ title, body }) { const ov = document.createElement('div'); ov.className = 'overlay'; ov.style.padding = '0'; ov.style.justifyContent = 'flex-end'; ov.innerHTML = '<div class="drawer"><div class="modal-h"><h2>' + title + '</h2><button class="btn ghost icon sm" data-close>✕</button></div><div class="modal-b">' + body + '</div></div>'; ov.addEventListener('mousedown', (e) => { if (e.target === ov) ov.remove(); }); ov.querySelector('[data-close]').addEventListener('click', () => ov.remove()); document.body.appendChild(ov); return ov; };
  UI.confirm = ({ title, text, ok, danger, size }, cb) => UI.modal({ title: title || 'Please confirm', size: size || 'sm', body: '<p>' + text + '</p>', buttons: [{ label: 'Cancel' }, { label: ok || 'Confirm', cls: danger ? 'danger' : 'primary', fn: () => { cb(); } }] });
  // remarks prompt – mandatory text for reject / return / cancel actions
  UI.ask = ({ title, label, placeholder, ok, danger, min, intro, rows, extra }, cb) => {
    const m = UI.modal({ title, size: 'sm', body: (intro ? '<p class="text2">' + intro + '</p>' : '') + (extra || '') + '<form class="col" onsubmit="return false">' + UI.field({ name: 'remarks', type: 'textarea', label: label || 'Remarks', placeholder: placeholder || '', required: !!min, rows: rows || 3 }) + '</form>', buttons: [{ label: 'Cancel' }, { label: ok || 'Submit', cls: danger ? 'danger' : 'primary', fn: (ov) => { const v = ov.querySelector('[name=remarks]').value.trim(); if (min && v.length < min) { ov.querySelector('[data-err=remarks]').textContent = 'Please enter at least ' + min + ' characters.'; ov.querySelector('[name=remarks]').classList.add('err'); return false; } cb(v, ov); } }] }); return m;
  };
  // form-in-modal helper: body is a <form>; on submit button calls fn(data, form, ov) and keeps modal open on validation errors
  UI.formModal = ({ title, fields, size, ok, intro, onSubmit, danger }) => {
    const m = UI.modal({ title, size: size || '', body: (intro ? '<p class="text2">' + intro + '</p>' : '') + '<form class="col" onsubmit="return false">' + UI.errBox() + fields + '</form>', buttons: [{ label: 'Cancel' }, { label: ok || 'Save', cls: danger ? 'danger' : 'primary', fn: (ov) => { const f = ov.querySelector('form'); const r = onSubmit(UI.formObj(f), f, ov); return r === false ? false : undefined; } }] }); return m;
  };

  // document viewer (view-only, watermarked; downloads / right-click disabled)
  UI.docViewer = ({ title, sub, user }) => {
    const wm = esc((user && user.name) || 'Viewer') + '<br>' + U.dt(PH.now()) + '<br>VIEW ONLY – CONFIDENTIAL';
    const m = UI.modal({ title: '📄 ' + esc(title), size: 'lg', body: '<div class="docview" oncontextmenu="return false"><div style="text-align:center;padding:40px"><div style="font-size:54px">📐</div><b>' + esc(title) + '</b><div class="muted">' + esc(sub || 'Protected document – preview only') + '</div><div class="muted small" style="margin-top:14px">Printing, saving and copying are disabled for protected RFQ documents.</div></div><div class="wm">' + wm + '</div></div>', buttons: [{ label: 'Close' }] });
    m.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['s', 'p', 'c'].includes(e.key.toLowerCase())) e.preventDefault(); }); return m;
  };

  // generic delegated behaviour
  document.addEventListener('click', (e) => {
    const row = e.target.closest && e.target.closest('tr[data-href]'); if (row && !e.target.closest('a,button,input,select,label')) { location.hash = row.dataset.href.replace(/^#/, ''); return; }
    const el = e.target.closest && e.target.closest('[data-act]'); if (el) { const f = PH.act[el.dataset.act]; if (f) { if (el.tagName === 'A' && !el.getAttribute('href')) e.preventDefault(); f(el, e); } return; }
    if (UI.state.pop && !e.target.closest('.pop,.pop-anchor')) { UI.state.pop = null; const p = document.querySelector('.pop'); if (p) p.remove(); }
  });
  document.addEventListener('submit', (e) => { const f = e.target.closest && e.target.closest('form[data-form]'); if (f) { e.preventDefault(); const fn = PH.act[f.dataset.form]; if (fn) fn(f, e); } });
  document.addEventListener('input', (e) => {
    const i = e.target.closest && e.target.closest('[data-filter]'); if (!i) return; const q = i.value.toLowerCase(); UI.state.filter[i.dataset.filter] = i.value;
    document.querySelectorAll('#' + i.dataset.filter + ' tbody tr[data-row]').forEach((tr) => { tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none'; });
  });
  document.addEventListener('change', (e) => { const el = e.target.closest && e.target.closest('[data-change]'); if (el && PH.act[el.dataset.change]) PH.act[el.dataset.change](el, e); });

  // ---------- charts (pure SVG / CSS) ----------
  const Charts = (PH.Charts = {});
  const PAL = ['#2257d6', '#13a37f', '#e0a100', '#c8372d', '#6b46c1', '#0b7f86', '#8895ab'];
  Charts.pal = PAL;
  Charts.donut = (parts, centre, sub) => {
    const tot = U.sum(parts, (p) => p.v) || 1; let off = 0; const R = 46, C = 2 * Math.PI * R;
    const arcs = parts.map((p, i) => { const len = (p.v / tot) * C; const s = '<circle r="' + R + '" cx="60" cy="60" fill="none" stroke="' + (p.c || PAL[i % PAL.length]) + '" stroke-width="16" stroke-dasharray="' + len + ' ' + (C - len) + '" stroke-dashoffset="' + -off + '" transform="rotate(-90 60 60)"/>'; off += len; return s; }).join('');
    return '<div class="row gap-lg"><div class="donut"><svg viewBox="0 0 120 120" width="120" height="120"><circle r="' + R + '" cx="60" cy="60" fill="none" stroke="var(--bg-sunken)" stroke-width="16"/>' + arcs + '</svg><div class="c">' + centre + (sub ? '<small>' + sub + '</small>' : '') + '</div></div><div class="legend">' + parts.map((p, i) => '<div><i style="background:' + (p.c || PAL[i % PAL.length]) + '"></i>' + esc(p.l) + ' <b>' + p.v + '</b></div>').join('') + '</div></div>';
  };
  Charts.hbars = (items, max, fmt) => { max = max || Math.max(1, ...items.map((i) => i.v)); return items.map((i) => '<div class="hbar"><span title="' + esc(i.l) + '" style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(i.l) + '</span><div class="bar ' + (i.tone || '') + '"><i style="width:' + Math.min(100, (i.v / max) * 100) + '%;' + (i.c ? 'background:' + i.c : '') + '"></i></div><b class="right">' + (fmt ? fmt(i.v) : i.v) + '</b></div>').join(''); };
  Charts.spark = (vals) => { const m = Math.max(1, ...vals); return '<div class="spark">' + vals.map((v) => '<i style="height:' + Math.max(8, (v / m) * 100) + '%" title="' + v + '"></i>').join('') + '</div>'; };
  Charts.trend = (cur, prev) => { const d = U.round(cur - prev, 1); return d === 0 ? '<span class="muted">▬ 0</span>' : d > 0 ? '<span class="delta-dn" style="color:var(--ok)">▲ ' + d + '</span>' : '<span class="delta-up">▼ ' + Math.abs(d) + '</span>'; };
})(typeof window !== 'undefined' ? window : globalThis);
