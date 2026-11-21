/* Source2Pay – local-storage backed store, demo clock, audit trail, RBAC helpers */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const KEY = 'ph.db.v1', SKEY = 'ph.session.v1', VER = 11;

  // Resilient storage (falls back to memory when localStorage is blocked, e.g. private mode / Node tests)
  const mem = {};
  const ls = (() => {
    try { const s = g.localStorage; s.setItem('__t', '1'); s.removeItem('__t'); return s; } catch (e) {
      return { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; } };
    }
  })();
  PH.storageOK = ls === g.localStorage;

  const Store = (PH.Store = { db: null, actor: null });

  Store.load = function () {
    try {
      const raw = ls.getItem(KEY);
      if (raw) { const d = JSON.parse(raw); if (d && d.ver === VER) { Store.db = d; return d; } }
    } catch (e) { /* corrupt → reseed */ }
    Store.reseed();
    return Store.db;
  };
  Store.save = function () {
    try { ls.setItem(KEY, JSON.stringify(Store.db)); } catch (e) { PH.storageError = true; }
  };
  Store.reseed = function () {
    Store.db = { ver: VER, clock: { days: 0 }, seq: {}, sysDown: false };
    PH.Seed.build();
    Store.save();
  };
  Store.reset = function () { Store.reseed(); };
  Store.clearAll = function () { try { ls.removeItem(KEY); ls.removeItem(SKEY); } catch (e) { /* ignore */ } };
  Store.sizeKB = function () { try { return Math.round(JSON.stringify(Store.db).length / 1024); } catch (e) { return 0; } };

  PH.db = () => Store.db;
  PH.cfg = () => Store.db.cfg;
  PH.tx = (fn) => { try { return fn(); } finally { Store.save(); } };

  // ---------- demo clock (time-travel for dormancy / SLA / MSME demos) ----------
  PH.now = () => new Date(Date.now() + ((Store.db && Store.db.clock.days) || 0) * 864e5);
  PH.setClockDays = (d) => { Store.db.clock.days = d; Store.save(); };

  // ---------- ids ----------
  const SEQ0 = { onb: 0, rfq: 1000, po: 4500012000, grn: 5000004000, inv: 0, insp: 0, dsp: 0, tkt: 0, pay: 0, msg: 0, notif: 0, vendor: 100239, pan: 0, q: 0, doc: 0, ret: 0, rdy: 0, prc: 0, react: 0, chg: 0, mail: 0, advice: 0, rev: 0 };
  PH.nextId = (kind) => {
    const s = Store.db.seq; if (s[kind] == null) s[kind] = SEQ0[kind] || 0;
    s[kind] += 1; const n = s[kind];
    switch (kind) {
      case 'onb': return 'ONB-' + PH.U.pad(n);
      case 'rfq': return 'RFQ-' + n;
      case 'po': case 'grn': case 'vendor': return String(n);
      case 'inv': return 'PINV-' + PH.U.pad(n);
      case 'insp': return 'IR-' + PH.U.pad(n);
      case 'dsp': return 'DSP-' + PH.U.pad(n);
      case 'tkt': return 'TKT-' + PH.U.pad(n);
      case 'pay': return 'PAY-2026-' + PH.U.pad(n);
      case 'msg': return 'MSG-' + PH.U.pad(n, 6);
      case 'notif': return 'N-' + PH.U.pad(n, 5);
      case 'q': return 'Q-' + PH.U.pad(n);
      case 'rdy': return 'RDY-' + PH.U.pad(n);
      case 'react': return 'REA-' + PH.U.pad(n);
      case 'chg': return 'CHG-' + PH.U.pad(n);
      case 'prc': return 'PRC-' + PH.U.pad(n);
      case 'advice': return 'ADV-' + PH.U.pad(n);
      default: return kind + '-' + n;
    }
  };

  // ---------- session / actor ----------
  PH.session = {
    get: () => { try { return JSON.parse(ls.getItem(SKEY) || 'null'); } catch (e) { return null; } },
    set: (v) => { try { v ? ls.setItem(SKEY, JSON.stringify(v)) : ls.removeItem(SKEY); } catch (e) { /* ignore */ } },
  };
  PH.userById = (id) => (Store.db.users || []).find((u) => u.id === id) || null;
  PH.me = () => {
    if (Store.actor) return PH.userById(Store.actor);
    const s = PH.session.get(); return s ? PH.userById(s.userId) : null;
  };
  // Run fn as another user (used by seed + tests); restores previous actor afterwards
  PH.as = (userId, fn) => {
    const prev = Store.actor; Store.actor = userId;
    try { return fn ? fn() : undefined; } finally { if (fn) Store.actor = prev; }
  };
  PH.actAs = (userId) => { Store.actor = userId; };
  PH.system = (fn) => { const prev = Store.actor; Store.actor = '__system'; try { return fn(); } finally { Store.actor = prev; } };
  PH.actor = () => {
    if (Store.actor === '__system') return { id: '__system', name: 'System', role: 'system' };
    return PH.me() || { id: 'anon', name: 'Anonymous', role: 'anon' };
  };
  PH.requireRole = (...roles) => {
    const a = PH.actor();
    if (a.role === 'system') return a;
    PH.assert(roles.includes(a.role), 'Your role (' + ((PH.ROLES[a.role] || {}).label || a.role) + ') is not permitted to perform this action.', 'FORBIDDEN');
    return a;
  };
  PH.isInternal = (u) => !!(u && PH.ROLES[u.role] && PH.ROLES[u.role].internal);

  // ---------- audit trail ----------
  PH.audit = (entity, id, action, details) => {
    const a = PH.actor();
    const db = Store.db; db.audit = db.audit || [];
    db.audit.push({ at: PH.U.iso(PH.now()), user: a.name, role: a.role, entity, id, action, details: details || '' });
    if (db.audit.length > 3000) db.audit.splice(0, db.audit.length - 3000);
  };
  PH.auditFor = (entity, id) => (Store.db.audit || []).filter((x) => x.entity === entity && x.id === id).reverse();

  // helper finders
  PH.vendor = (id) => Store.db.vendors.find((v) => v.id === id);
  PH.byId = (coll, id) => (Store.db[coll] || []).find((x) => x.id === id);
  PH.label = (list, id) => { const x = (list || []).find((i) => i.id === id); return x ? (x.label || x.name) : id; };
})(typeof window !== 'undefined' ? window : globalThis);
