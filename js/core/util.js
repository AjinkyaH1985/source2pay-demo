/* Source2Pay – core utilities (no DOM access; runs in browser and Node) */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = (PH.U = {});

  // ---------- errors ----------
  class PHError extends Error {
    constructor(msg, code, fields) { super(msg); this.name = 'PHError'; this.code = code || 'VALIDATION'; this.fields = fields || null; }
  }
  PH.Err = PHError;
  PH.assert = (cond, msg, code, fields) => { if (!cond) throw new PHError(msg, code, fields); };
  PH.fail = (msg, code, fields) => { throw new PHError(msg, code, fields); };

  // ---------- strings & numbers ----------
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  U.num = (v) => { const n = parseFloat(String(v == null ? '' : v).replace(/,/g, '')); return isNaN(n) ? 0 : n; };
  U.round = (n, d = 2) => { const m = Math.pow(10, d); return Math.round((Number(n) + Number.EPSILON) * m) / m; };
  U.sum = (arr, f) => arr.reduce((a, x) => a + (f ? f(x) : x), 0);
  U.inr = (n, d = 0) => '₹ ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
  U.inrC = (n) => {
    n = Number(n || 0); const a = Math.abs(n);
    if (a >= 1e7) return '₹ ' + U.round(n / 1e7, 2) + ' Cr';
    if (a >= 1e5) return '₹ ' + U.round(n / 1e5, 2) + ' L';
    return U.inr(n);
  };
  U.pct = (n, d = 0) => U.round(n, d) + '%';
  U.initials = (name) => String(name || '?').split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  U.slug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  U.clone = (o) => JSON.parse(JSON.stringify(o));
  U.groupBy = (arr, f) => arr.reduce((m, x) => { const k = f(x); (m[k] = m[k] || []).push(x); return m; }, {});
  U.uniq = (arr) => Array.from(new Set(arr));
  U.pad = (n, w = 4) => String(n).padStart(w, '0');
  U.hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

  // ---------- dates (ISO strings everywhere; PH.now() is the demo clock) ----------
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  U.toDate = (v) => (v instanceof Date ? v : new Date(v));
  U.iso = (v) => U.toDate(v).toISOString();
  U.ymd = (v) => { const d = U.toDate(v); return d.getFullYear() + '-' + U.pad(d.getMonth() + 1, 2) + '-' + U.pad(d.getDate(), 2); };
  U.addDays = (v, n) => new Date(U.toDate(v).getTime() + n * 864e5);
  U.addMonths = (v, n) => { const d = new Date(U.toDate(v)); d.setMonth(d.getMonth() + n); return d; };
  U.diffDays = (a, b) => (U.toDate(b).getTime() - U.toDate(a).getTime()) / 864e5; // b - a
  U.d = (v) => { if (!v) return '—'; const d = U.toDate(v); if (isNaN(d)) return '—'; return d.getDate() + ' ' + MON[d.getMonth()] + ' ' + d.getFullYear(); };
  U.dt = (v) => { if (!v) return '—'; const d = U.toDate(v); if (isNaN(d)) return '—'; return U.d(d) + ', ' + U.pad(d.getHours(), 2) + ':' + U.pad(d.getMinutes(), 2); };
  U.ago = (v, now) => {
    if (!v) return '—';
    const m = Math.round((U.toDate(now || PH.now()).getTime() - U.toDate(v).getTime()) / 60000);
    if (m < 1) return 'just now'; if (m < 60) return m + ' min ago';
    const h = Math.round(m / 60); if (h < 24) return h + ' h ago';
    const d = Math.round(h / 24); if (d < 30) return d + ' d ago';
    return U.d(v);
  };
  U.fy = (v) => { const d = U.toDate(v || PH.now()); const y = d.getFullYear(); return d.getMonth() >= 3 ? y + '-' + String(y + 1).slice(2) : (y - 1) + '-' + String(y).slice(2); };
  U.isPast = (v, now) => U.toDate(v).getTime() < U.toDate(now || PH.now()).getTime();

  // ---------- validators (Indian statutory formats) ----------
  const STATES = { '01': 'Jammu & Kashmir', '03': 'Punjab', '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '19': 'West Bengal', '21': 'Odisha', '23': 'Madhya Pradesh', '24': 'Gujarat', '27': 'Maharashtra', '29': 'Karnataka', '32': 'Kerala', '33': 'Tamil Nadu', '36': 'Telangana', '37': 'Andhra Pradesh' };
  U.STATES = STATES;
  U.isPAN = (s) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(s || ''));
  U.isGST = (s) => /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(s || ''));
  U.isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(s || ''));
  U.isMobile = (s) => /^[6-9][0-9]{9}$/.test(String(s || ''));
  U.isIFSC = (s) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(s || ''));
  U.isAcct = (s) => /^[0-9]{9,18}$/.test(String(s || ''));
  // GST ⇄ PAN ⇄ State inter-relation: GSTIN = 2-digit state code + PAN + entity no + 'Z' + check digit
  U.gstPanState = (gst, pan, state) => {
    const errs = [];
    if (gst && !U.isGST(gst)) errs.push({ field: 'gst', msg: 'GST number format is invalid (expected 15 characters, e.g. 27AABCP1234F1Z5).' });
    if (pan && !U.isPAN(pan)) errs.push({ field: 'pan', msg: 'PAN format is invalid (expected AAAAA9999A).' });
    if (U.isGST(gst) && U.isPAN(pan) && gst.slice(2, 12) !== pan) errs.push({ field: 'gst', msg: 'GST number does not embed the entered PAN (characters 3–12 must equal PAN).' });
    if (U.isGST(gst) && state) {
      const code = gst.slice(0, 2);
      if (STATES[code] && STATES[code] !== state) errs.push({ field: 'state', msg: 'State "' + state + '" does not match GST state code ' + code + ' (' + STATES[code] + ').' });
      if (!STATES[code]) errs.push({ field: 'gst', msg: 'GST state code ' + code + ' is not recognised.' });
    }
    return errs;
  };

  // ---------- misc ----------
  U.textMatch = (obj, q) => !q || JSON.stringify(obj).toLowerCase().indexOf(String(q).toLowerCase()) >= 0;
  U.statusOf = (arr, f) => arr.filter(f).length;
  U.avg = (arr) => (arr.length ? U.sum(arr) / arr.length : 0);
  U.fileMeta = (name, sizeKb) => ({ name, sizeKb: sizeKb || 120 + (U.hash(name) % 900), at: PH.now ? U.iso(PH.now()) : U.iso(new Date()) });
})(typeof window !== 'undefined' ? window : globalThis);
