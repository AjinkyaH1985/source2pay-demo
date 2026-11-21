/* Source2Pay – Governance (dormancy, MSME, blacklist, reactivation, profile changes), Performance, Tickets, time-based engine */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  PH.S = PH.S || {};
  const S = PH.S;
  const now = () => U.iso(PH.now());
  const vhist = (v, text, by) => v.history.push({ at: now(), text, by: by || PH.actor().name });

  // ================= Performance =================
  const Perf = (S.Perf = {});
  const METRICS = ['delivery', 'quality', 'commercial', 'participation', 'responsiveness', 'compliance', 'engagement'];
  Perf.METRICS = METRICS;
  Perf.LABEL = { delivery: 'Delivery performance', quality: 'Quality performance', commercial: 'Commercial performance', participation: 'RFQ participation', responsiveness: 'RFQ responsiveness', compliance: 'Compliance', engagement: 'Portal engagement' };
  Perf.SOURCE = { delivery: 'Receipts', quality: 'Inspection', commercial: 'Sourcing', participation: 'Sourcing', responsiveness: 'Sourcing', compliance: 'Compliance', engagement: 'Portal' };
  const weighted = (m) => { const w = PH.cfg().perfWeights; const t = U.sum(Object.values(w)); return U.round(U.sum(METRICS, (k) => (m[k] || 0) * w[k]) / t, 1); };
  Perf.overall = (v) => weighted(v.perf.cur);
  Perf.previous = (v) => weighted(v.perf.prev);
  Perf.event = (vendorId, metric, delta) => { const v = PH.vendor(vendorId); if (!v || !v.perf) return; v.perf.cur[metric] = Math.max(0, Math.min(100, U.round((v.perf.cur[metric] || 0) + delta, 1))); };
  Perf.isLow = (v) => Perf.overall(v) < PH.cfg().rules.lowPerformerBelow;
  Perf.ranking = () => PH.db().vendors.filter((v) => ['active', 'dormant'].includes(v.status)).map((v) => ({ v, score: Perf.overall(v), prev: Perf.previous(v) })).sort((a, b) => b.score - a.score);
  Perf.recomputeFromTransactions = function () {
    const db = PH.db(); let n = 0;
    db.vendors.filter((v) => v.status === 'active').forEach((v) => {
      const irs = db.inspections.filter((i) => i.vendorId === v.id); const req = U.sum(irs, (i) => U.sum(i.lines, (l) => l.qty)); const ok = U.sum(irs, (i) => U.sum(i.lines, (l) => l.approved));
      if (req > 0) v.perf.cur.quality = U.round(0.5 * v.perf.cur.quality + 0.5 * (ok / req) * 100, 1);
      const grns = db.grns.filter((x) => x.vendorId === v.id); if (grns.length) v.perf.cur.delivery = U.round(0.5 * v.perf.cur.delivery + 0.5 * (grns.filter((x) => x.status !== 'Received with exceptions').length / grns.length) * 100, 1);
      const inv = db.rfqs.filter((r) => r.vendors.some((x) => x.vendorId === v.id)); if (inv.length) { const sub = inv.filter((r) => ['submitted', 'negotiation', 'final', 'awarded', 'not_awarded'].includes(r.vendors.find((x) => x.vendorId === v.id).status)).length; v.perf.cur.participation = U.round(0.5 * v.perf.cur.participation + 0.5 * (sub / inv.length) * 100, 1); }
      n++;
    });
    return n;
  };
  Perf.scorecard = (vendorId) => { const v = PH.vendor(vendorId); return { vendor: v, rows: METRICS.map((k) => ({ k, label: Perf.LABEL[k], source: Perf.SOURCE[k], weight: PH.cfg().perfWeights[k], cur: v.perf.cur[k], prev: v.perf.prev[k] })), overall: Perf.overall(v), previous: Perf.previous(v), low: Perf.isLow(v) }; };
  const avgDays = (pairs) => { const d = pairs.filter((p) => p[0] && p[1]).map((p) => U.diffDays(p[0], p[1])).filter((x) => x >= 0); return { avg: d.length ? U.round(U.avg(d), 1) : null, n: d.length }; };
  Perf.tat = function () {
    const db = PH.db(); const first = (arr) => arr.filter(Boolean).sort()[0];
    const k = [
      ['KPI-TAT-001', 'PR creation → RFQ release', avgDays(db.rfqs.map((r) => [r.prCreatedAt, r.publishedAt]))],
      ['KPI-TAT-002', 'RFQ release → vendor response', avgDays(db.quotes.filter((q) => q.submittedAt).map((q) => [PH.byId('rfqs', q.rfqId).publishedAt, q.submittedAt]))],
      ['KPI-TAT-003', 'Vendor response → vendor selection', avgDays(db.pans.filter((p) => p.approvedAt).map((p) => [first(db.quotes.filter((q) => q.rfqId === p.rfqId).map((q) => q.submittedAt)), p.approvedAt]))],
      ['KPI-TAT-004', 'Vendor selection → PO acceptance', avgDays(db.pos.filter((p) => p.acceptedAt).map((p) => [(PH.byId('pans', p.panId) || {}).approvedAt, p.acceptedAt]))],
      ['KPI-TAT-005', 'PO release → inspection', avgDays(db.inspections.map((i) => [PH.byId('pos', i.poId).date, i.cycles[0].at]))],
      ['KPI-TAT-006', 'Inspection → dispatch', avgDays(db.dispatches.filter((d) => d.irId).map((d) => [(PH.byId('inspections', d.irId) || { cycles: [{}] }).cycles.filter((c) => c.result).map((c) => c.at)[0], d.at]))],
      ['KPI-TAT-007', 'Dispatch → GRN', avgDays(db.grns.map((x) => [first(db.dispatches.filter((d) => d.poId === x.poId).map((d) => d.at)), x.date]))],
    ];
    return k.map(([id, label, r]) => ({ id, label, avg: r.avg, n: r.n }));
  };

  // ================= Governance =================
  const Gov = (S.Gov = {});
  Gov.STATUS_LABEL = { active: 'Active', dormant: 'Dormant', closed: 'Closed', blacklisted: 'Blacklisted', blocked: 'Blocked' };
  Gov.setStatus = function (v, status, reason, by) {
    if (v.status === status) return;
    const prev = v.status; v.status = status; vhist(v, 'Status ' + prev + ' → ' + status + (reason ? ' (' + reason + ')' : ''), by || 'System'); PH.audit('vendor', v.id, 'status', prev + '→' + status);
    PH.Sys.send('VENDOR_STATUS', { vendorCode: v.code, status, effectiveDate: now(), reason }, v.code);
    PH.Notify.push({ type: 'dormant_alert', ref: v.name, to: { roles: ['buyer', 'leader'], vendorId: v.id }, title: v.name + ' is now ' + Gov.STATUS_LABEL[status], body: reason || 'Vendor status changed.', link: '#/vendors/' + v.id });
  };
  Gov.msmeDeadline = (d) => { const r = PH.cfg().rules; const dt = U.toDate(d || PH.now()); const thisYear = new Date(dt.getFullYear(), r.msmeDeadlineMonth - 1, r.msmeDeadlineDay, 23, 59, 59); return dt > thisYear ? thisYear : new Date(dt.getFullYear() - 1, r.msmeDeadlineMonth - 1, r.msmeDeadlineDay, 23, 59, 59); };
  Gov.nextMsmeDeadline = (d) => { const r = PH.cfg().rules; const dt = U.toDate(d || PH.now()); const t = new Date(dt.getFullYear(), r.msmeDeadlineMonth - 1, r.msmeDeadlineDay, 23, 59, 59); return dt > t ? new Date(dt.getFullYear() + 1, r.msmeDeadlineMonth - 1, r.msmeDeadlineDay, 23, 59, 59) : t; };
  // qualifying activity (portal login, RFQ participation, PO activity) resets the dormancy clock
  Gov.recordActivity = function (vendorId) { const v = PH.vendor(vendorId); if (v && ['active', 'dormant'].includes(v.status)) { v.lastActivityAt = now(); } return v; };
  Gov.checkRepeatedHigh = function (v) {
    const lim = PH.cfg().rules.consecutiveHighRfqBlock;
    if (v.consecutiveHigh >= lim && !['blacklisted', 'blocked'].includes(v.status)) Gov.setStatus(v, 'blocked', 'Quoted higher rates in ' + v.consecutiveHigh + ' consecutive RFQs (limit ' + lim + ')', 'System');
  };
  const once = (obj, key, fn) => { obj.alerts = obj.alerts || {}; if (obj.alerts[key]) return false; obj.alerts[key] = now(); fn(); return true; };

  // Time-based rules – idempotent; run on load, after "time travel" and from the Governance page
  Gov.tick = function () {
    const db = PH.db(); const c = PH.cfg(), r = c.rules; const t = PH.now(); const out = { dormant: 0, closed: 0, msmeNotice: 0, msmeLapsed: 0, rfqClosed: 0, escalated: 0, reminders: 0, paid: 0 };
    PH.system(() => {
      db.vendors.forEach((v) => {
        if (['blacklisted', 'blocked'].includes(v.status)) return;
        const months = U.diffDays(v.lastActivityAt, t) / 30.4375;
        if (months >= r.closedMonths && v.status !== 'closed') { Gov.setStatus(v, 'closed', 'No activity for ' + r.closedMonths + ' months – portal access disabled'); out.closed++; }
        else if (months >= r.dormantMonths && v.status === 'active') { Gov.setStatus(v, 'dormant', 'No activity for ' + r.dormantMonths + ' months'); out.dormant++; }
        if (v.msme && v.msme.is && v.msme.validTill) {
          const days = U.diffDays(t, v.msme.validTill);
          if (days <= r.msmeExpiryNoticeDays) { if (once(v, 'msmeNotice:' + v.msme.validTill, () => PH.Notify.push({ type: 'msme_expiry', ref: v.name, to: { vendorId: v.id, roles: ['buyer', 'finance'] }, title: 'MSME certificate ' + (days < 0 ? 'expired' : 'expires soon') + ' – ' + v.name, body: 'Valid till ' + U.d(v.msme.validTill) + '. Upload a renewed certificate before ' + U.d(Gov.nextMsmeDeadline(t)) + ' to retain MSME benefits.', link: '#/vendors/' + v.id }))) out.msmeNotice++; }
          if (U.toDate(v.msme.validTill) < Gov.msmeDeadline(t)) { // missed the annual deadline → Non-MSME, terms 30 → 60 days
            v.msme.is = false; v.msme.lapsedAt = now(); v.paymentTerms = 'PT' + r.msmeTermsNonCompliant; vhist(v, 'MSME certificate not renewed by ' + U.d(Gov.msmeDeadline(t)) + ' – marked Non-MSME; payment terms ' + r.msmeTermsCompliant + ' → ' + r.msmeTermsNonCompliant + ' days', 'System');
            PH.Sys.send('VENDOR_PAYTERMS', { vendorCode: v.code, paymentTerms: 'PT' + r.msmeTermsNonCompliant, msme: false, certificateValidity: v.msme.validTill }, v.code); S.Perf.event(v.id, 'compliance', -25);
            PH.Notify.push({ type: 'compliance_failure', ref: v.name, to: { vendorId: v.id, roles: ['buyer', 'finance'] }, title: 'MSME non-compliance – ' + v.name, body: 'Payment terms moved from ' + r.msmeTermsCompliant + ' to ' + r.msmeTermsNonCompliant + ' days.', link: '#/vendors/' + v.id }); out.msmeLapsed++;
          }
        }
      });
      db.rfqs.filter((x) => x.status === 'published').forEach((x) => {
        if (U.isPast(x.deadline, t)) { S.Rfq._closeNonResponders(x); x.status = 'closed'; x.closedAt = now(); x.log.push({ at: now(), by: 'System', text: 'Auto-closed after response deadline' }); out.rfqClosed++; }
        else if (U.diffDays(t, x.deadline) <= 2 && x.vendors.some((v) => ['invited', 'viewed', 'draft'].includes(v.status))) once(x, 'noResp', () => PH.Notify.push({ type: 'rfq_no_response_alert', ref: x.id, to: { roles: ['buyer'] }, title: 'Responses pending on ' + x.id, body: x.vendors.filter((v) => ['invited', 'viewed', 'draft'].includes(v.status)).map((v) => PH.vendor(v.vendorId).name).join(', ') + ' have not responded; deadline ' + U.dt(x.deadline), link: '#/rfq/' + x.id }));
      });
      out.escalated = S.Pan.escalateOverdue();
      db.pos.forEach((p) => {
        if (p.status === 'released' && U.diffDays(p.date, t) > 3) if (once(p, 'accRem:' + p.rev, () => PH.Notify.push({ type: 'pending_po_acceptance', ref: p.id, to: { vendorId: p.vendorId, roles: ['buyer'] }, title: 'PO ' + p.id + ' still awaiting acceptance', body: 'Released ' + U.d(p.date) + '. Please review and accept.', link: '#/po/' + p.id }))) out.reminders++;
        if (p.status === 'accepted') p.lines.forEach((l) => { if (l.qty > l.dispatchedQty && U.diffDays(t, l.deliveryDate) <= r.deliveryDueDays) if (once(p, 'due:' + l.no, () => PH.Notify.push({ type: 'delivery_due', ref: p.id, to: { vendorId: p.vendorId, roles: ['buyer'] }, title: 'Delivery due – PO ' + p.id + ' line ' + l.no, body: U.d(l.deliveryDate) + ': ' + (l.qty - l.dispatchedQty) + ' ' + l.uom + ' still to dispatch.', link: '#/po/' + p.id }))) out.reminders++; });
      });
      db.tickets.filter((x) => ['open', 'reopened'].includes(x.status)).forEach((x) => { const last = x.messages[x.messages.length - 1]; if (last && last.role === 'vendor' && U.diffDays(last.at, t) > r.ticketSlaDays) once(x, 'sla:' + x.messages.length, () => PH.Notify.push({ type: 'ticket_response', ref: x.id, to: { roles: ['buyer'] }, title: 'Ticket ' + x.id + ' awaiting response', body: 'Vendor message unanswered for over ' + r.ticketSlaDays + ' days.', link: '#/tickets/' + x.id })); });
      if (c.flowMode === 'auto' && !db.sysDown) out.paid = PH.Sys.payAllDue();
    });
    PH.Store.save(); return out;
  };

  // ----- blacklist (buyer proposes → SCM Head approves; permanent) -----
  Gov.proposeBlacklist = function (vendorId, reason) {
    PH.requireRole('buyer'); const v = PH.vendor(vendorId); PH.assert(v.status !== 'blacklisted', 'Vendor is already blacklisted.'); PH.assert(!v.blacklistRequest || v.blacklistRequest.status !== 'pending', 'A blacklist request is already pending.');
    PH.assert(reason && reason.trim().length >= 15, 'Give a detailed reason for blacklisting (min 15 characters).');
    v.blacklistRequest = { reason: reason.trim(), by: PH.actor().name, at: now(), status: 'pending' }; vhist(v, 'Blacklist proposed: ' + reason);
    PH.Notify.push({ type: 'pending_approval', ref: v.name, to: { roles: ['approver'] }, title: 'Blacklist approval: ' + v.name, body: reason, link: '#/approvals' }); return v;
  };
  Gov.decideBlacklist = function (vendorId, approve, remarks) {
    PH.requireRole('approver'); const v = PH.vendor(vendorId); PH.assert(v.blacklistRequest && v.blacklistRequest.status === 'pending', 'No pending blacklist request.');
    if (!approve) { PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are required to decline.'); v.blacklistRequest.status = 'declined'; v.blacklistRequest.remarks = remarks; vhist(v, 'Blacklist declined: ' + remarks); return v; }
    v.blacklistRequest.status = 'approved'; v.blacklistedAt = now(); Gov.setStatus(v, 'blacklisted', v.blacklistRequest.reason, 'SCM Head'); return v;
  };

  // ----- reactivation (vendor → buyer → SCM Head) -----
  Gov.requestReactivation = function (vendorId, reason) {
    const v = PH.vendor(vendorId); PH.assert(v, 'Vendor not found.');
    PH.assert(v.status !== 'blacklisted', 'Blacklisted vendors are permanently blocked – there is no reactivation path.', 'FORBIDDEN');
    PH.assert(['dormant', 'closed'].includes(v.status), 'Only dormant or closed accounts can request reactivation.'); PH.assert(reason && reason.trim().length >= 10, 'Please explain why the account should be reactivated (min 10 characters).');
    PH.assert(!PH.db().reactivations.some((x) => x.vendorId === vendorId && ['pending_buyer', 'pending_head'].includes(x.status)), 'A reactivation request is already in progress.');
    const x = { id: PH.nextId('react'), vendorId, reason: reason.trim(), status: 'pending_buyer', createdAt: now(), log: [] }; PH.db().reactivations.push(x); vhist(v, 'Reactivation requested', v.name);
    PH.Notify.push({ type: 'dormant_alert', ref: v.name, to: { roles: ['buyer'] }, title: 'Reactivation request: ' + v.name, body: reason, link: '#/vendors/' + v.id }); return x;
  };
  Gov.buyerReview = function (id, forward, remarks) {
    PH.requireRole('buyer'); const x = PH.byId('reactivations', id); PH.assert(x && x.status === 'pending_buyer', 'Request is not awaiting buyer review.'); PH.assert(remarks && remarks.trim().length >= 5, 'Add review remarks.');
    x.buyerRemarks = remarks; x.buyer = PH.actor().name; x.status = forward ? 'pending_head' : 'rejected';
    if (forward) PH.Notify.push({ type: 'pending_approval', ref: PH.vendor(x.vendorId).name, to: { roles: ['approver'] }, title: 'Reactivation approval (SCM Head): ' + PH.vendor(x.vendorId).name, body: remarks, link: '#/approvals' }); return x;
  };
  Gov.headDecide = function (id, approve, remarks) {
    PH.requireRole('approver'); const x = PH.byId('reactivations', id); PH.assert(x && x.status === 'pending_head', 'Request is not awaiting SCM Head approval.'); const v = PH.vendor(x.vendorId);
    if (!approve) PH.assert(remarks && remarks.trim().length >= 5, 'Remarks required to reject.'); x.headRemarks = remarks || ''; x.status = approve ? 'approved' : 'rejected';
    if (approve) { v.lastActivityAt = now(); Gov.setStatus(v, 'active', 'Reactivated – approved by SCM Head', 'SCM Head'); } return x;
  };

  // ----- MSME certificate -----
  Gov.uploadMsme = function (vendorId, { certNo, validTill, file }) {
    const me = PH.requireRole('vendor'); PH.assert(me.vendorId === vendorId, 'You can only update your own certificate.', 'FORBIDDEN'); const v = PH.vendor(vendorId);
    PH.assert(certNo && certNo.trim(), 'Certificate number is required.'); PH.assert(validTill && !U.isPast(validTill), 'The certificate must have a future validity date.'); PH.assert(file, 'Attach the certificate file.');
    const wasLapsed = !(v.msme && v.msme.is); v.msme = { is: true, certNo: certNo.trim(), validTill: U.iso(validTill), file, uploadedAt: now() }; v.alerts = {};
    vhist(v, 'MSME certificate uploaded (valid till ' + U.d(validTill) + ')', me.name); S.Perf.event(vendorId, 'compliance', 15);
    if (wasLapsed) { v.paymentTerms = 'PT' + PH.cfg().rules.msmeTermsCompliant; PH.Sys.send('VENDOR_PAYTERMS', { vendorCode: v.code, paymentTerms: v.paymentTerms, msme: true, certificateValidity: v.msme.validTill }, v.code); }
    PH.Notify.push({ type: 'msme_expiry', ref: v.name, to: { roles: ['buyer', 'finance'] }, title: 'MSME certificate renewed – ' + v.name, body: 'Valid till ' + U.d(validTill), link: '#/vendors/' + v.id }); return v;
  };

  // ----- profile change (bank / GST / PAN) → Finance (CFO office) approval -----
  Gov.requestProfileChange = function (vendorId, { field, values, reason }) {
    const me = PH.requireRole('vendor'); PH.assert(me.vendorId === vendorId, 'You can only change your own profile.', 'FORBIDDEN'); const v = PH.vendor(vendorId); const e = {};
    PH.assert(['bank', 'gst', 'pan'].includes(field), 'Choose what to change.'); PH.assert(reason && reason.trim().length >= 5, 'Explain the reason for the change.');
    if (field === 'bank') { if (!values.holder) e.holder = 'Account holder is required.'; if (!U.isAcct(values.accountNo)) e.accountNo = 'Account number must be 9–18 digits.'; if (!U.isIFSC(values.ifsc)) e.ifsc = 'IFSC format is invalid.'; }
    if (field === 'gst') { if (!U.isGST(values.gst)) e.gst = 'GST number format is invalid.'; else U.gstPanState(values.gst, v.pan, v.state).forEach((x) => { e.gst = x.msg; }); }
    if (field === 'pan') { if (!U.isPAN(values.pan)) e.pan = 'PAN format is invalid.'; else if (v.gst.slice(2, 12) !== values.pan) e.pan = 'PAN must match the registered GST number.'; }
    if (Object.keys(e).length) PH.fail('Change request has issues.', 'VALIDATION', e);
    PH.assert(!PH.db().profileChanges.some((x) => x.vendorId === vendorId && x.field === field && x.status === 'pending'), 'A change request for this item is already pending Finance review.');
    const old = field === 'bank' ? U.clone(v.bank) : field === 'gst' ? { gst: v.gst } : { pan: v.pan };
    const x = { id: PH.nextId('chg'), vendorId, field, old, new: U.clone(values), reason: reason.trim(), status: 'pending', createdAt: now(), by: me.name }; PH.db().profileChanges.push(x);
    PH.Notify.push({ type: 'compliance_failure', ref: v.name, to: { roles: ['finance'] }, title: 'Finance approval needed: ' + field.toUpperCase() + ' change – ' + v.name, body: reason, link: '#/vendors/' + v.id }); return x;
  };
  Gov.decideProfileChange = function (id, approve, remarks) {
    PH.requireRole('finance'); const x = PH.byId('profileChanges', id); PH.assert(x && x.status === 'pending', 'Change request is not pending.'); const v = PH.vendor(x.vendorId);
    if (!approve) { PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are required to reject.'); x.status = 'rejected'; x.remarks = remarks; x.decidedBy = PH.actor().name; x.decidedAt = now(); vhist(v, x.field.toUpperCase() + ' change rejected by Finance: ' + remarks); return x; }
    if (x.field === 'bank') v.bank = Object.assign({}, v.bank, x.new); if (x.field === 'gst') v.gst = x.new.gst; if (x.field === 'pan') v.pan = x.new.pan;
    x.status = 'approved'; x.remarks = remarks || ''; x.decidedBy = PH.actor().name; x.decidedAt = now(); vhist(v, x.field.toUpperCase() + ' change approved by Finance');
    PH.Sys.send('VENDOR_BANK_CHANGE', { vendorCode: v.code, field: x.field, pan: x.field === 'pan' ? x.new.pan : undefined, gst: x.field === 'gst' ? x.new.gst : undefined, bank: x.field === 'bank' ? { ifsc: x.new.ifsc, holder: x.new.holder } : undefined }, v.code);
    PH.Notify.push({ type: 'compliance_failure', ref: v.name, to: { vendorId: v.id }, title: x.field.toUpperCase() + ' change approved', body: 'Finance approved your change; vendor master updated.', link: '#/vendors/' + v.id }); return x;
  };
  Gov.setCategories = function (vendorId, cats) { PH.requireRole('buyer'); const v = PH.vendor(vendorId); PH.assert(cats && cats.length, 'A vendor needs at least one category.'); v.cats = cats.slice(); vhist(v, 'Categories updated: ' + cats.map((x) => PH.label(PH.cfg().supplierCategories, x)).join(', ')); return v; };
  Gov.reevaluate = function (vendorId, { kind, decision, remarks }) {
    PH.requireRole('buyer'); const v = PH.vendor(vendorId); PH.assert(['periodic', 'event'].includes(kind), 'Choose the re-evaluation type.'); PH.assert(['maintain', 'conditional', 'disqualify'].includes(decision), 'Choose an outcome.'); PH.assert(remarks && remarks.trim().length >= 10, 'Remarks are mandatory (min 10 characters).');
    v.reevals = v.reevals || []; v.reevals.push({ at: now(), kind, decision, remarks, by: PH.actor().name, score: Perf.overall(v) }); vhist(v, 'Re-evaluation (' + kind + '): ' + decision);
    if (decision === 'disqualify') Gov.setStatus(v, 'blocked', 'Disqualified in re-evaluation: ' + remarks); return v;
  };

  // ================= Support tickets =================
  const Tkt = (S.Tkt = {});
  const tk = (id) => { const t = PH.byId('tickets', id); PH.assert(t, 'Ticket not found', 'NOT_FOUND'); return t; };
  Tkt.get = tk;
  Tkt.visibleTo = (u) => (u.role === 'vendor' ? PH.db().tickets.filter((t) => t.vendorId === u.vendorId) : PH.db().tickets);
  Tkt.canManage = (u, t) => u.role === 'buyer' || u.role === (PH.cfg().ticketCategories.find((c) => c.id === t.category) || {}).owner || (t.category === 'drawing' && u.role === 'design');
  Tkt.create = function (f) {
    const me = PH.actor(); PH.assert(me.role === 'vendor' || me.role === 'buyer', 'Only vendors and buyers can raise tickets.', 'FORBIDDEN');
    const e = {}; if (!f.subject || f.subject.trim().length < 5) e.subject = 'Subject is required (min 5 characters).'; if (!f.description || f.description.trim().length < 10) e.description = 'Describe the issue (min 10 characters).';
    const cat = PH.cfg().ticketCategories.find((c) => c.id === f.category); if (!cat) e.category = 'Select a category.'; if (!['low', 'medium', 'high', 'urgent'].includes(f.priority)) e.priority = 'Select a priority.';
    const vendorId = me.role === 'vendor' ? me.vendorId : f.vendorId; if (!vendorId || !PH.vendor(vendorId)) e.vendorId = 'Select the vendor.';
    if (Object.keys(e).length) PH.fail('Ticket needs attention.', 'VALIDATION', e);
    const refs = f.refs || {}; const rfq = refs.rfq ? PH.byId('rfqs', refs.rfq) : null;
    const t = { id: PH.nextId('tkt'), subject: f.subject.trim(), description: f.description.trim(), priority: f.priority, category: f.category, status: 'open', vendorId, raisedBy: { name: me.name, role: me.role }, assignedTo: rfq ? rfq.buyer : (me.role === 'buyer' ? me.name : 'Procurement'), ownerRole: cat.owner, refs, createdAt: now(), messages: [{ by: me.name, role: me.role, internal: false, at: now(), text: f.description.trim() }], resolution: null, closedAt: null, reopenCount: 0, forwardedTo: f.category === 'drawing' && refs.rfq ? cat.forward : null, alerts: {} };
    PH.db().tickets.push(t); PH.audit('ticket', t.id, 'created', t.subject);
    PH.Notify.push({ type: 'ticket_response', ref: t.id, to: me.role === 'vendor' ? { roles: ['buyer'].concat(cat.owner !== 'buyer' ? [cat.owner] : []).concat(t.forwardedTo ? ['design', 'leader'] : []) } : { vendorId }, title: (me.role === 'vendor' ? 'New ticket ' : 'Query from buyer ') + t.id + ': ' + t.subject, body: t.forwardedTo ? 'Drawing-related RFQ query forwarded to ' + t.forwardedTo.join(', ') : f.description.slice(0, 120), link: '#/tickets/' + t.id }); return t;
  };
  Tkt.reply = function (id, text, internal) {
    const t = tk(id); const me = PH.actor(); PH.assert(text && text.trim(), 'Write a message.'); PH.assert(t.status !== 'closed', 'Closed tickets cannot take new messages – reopen it first.');
    if (me.role === 'vendor') { PH.assert(me.vendorId === t.vendorId, 'Not your ticket.', 'FORBIDDEN'); PH.assert(!internal, 'Vendors cannot post internal comments.'); } else PH.assert(Tkt.canManage(me, t) || PH.isInternal(me), 'Not permitted.', 'FORBIDDEN');
    t.messages.push({ by: me.name, role: me.role, internal: !!internal, at: now(), text: text.trim() });
    if (me.role === 'vendor' && t.status === 'waiting_vendor') t.status = 'open';
    if (!internal) PH.Notify.push({ type: 'ticket_response', ref: t.id, to: me.role === 'vendor' ? { roles: ['buyer'] } : { vendorId: t.vendorId }, title: 'New response on ' + t.id, body: text.slice(0, 120), link: '#/tickets/' + t.id });
    PH.audit('ticket', t.id, 'reply', internal ? 'internal' : 'public'); return t;
  };
  Tkt.setStatus = function (id, status, resolution) {
    const t = tk(id); const me = PH.actor(); PH.assert(me.role !== 'vendor' && Tkt.canManage(me, t), 'Only the buyer and the category owner can update ticket status.', 'FORBIDDEN');
    PH.assert(['open', 'in_progress', 'waiting_vendor', 'resolved'].includes(status), 'Invalid status.'); PH.assert(t.status !== 'closed', 'Ticket is closed.');
    if (status === 'resolved') { PH.assert(resolution && resolution.trim().length >= 5, 'Resolution details are required.'); t.resolution = { details: resolution.trim(), by: me.name, at: now() }; }
    t.status = status; PH.audit('ticket', t.id, 'status', status);
    PH.Notify.push({ type: 'ticket_response', ref: t.id, to: { vendorId: t.vendorId }, title: 'Ticket ' + t.id + ' is now ' + status.replace('_', ' '), body: resolution || '', link: '#/tickets/' + t.id }); return t;
  };
  Tkt.close = function (id, remarks) {
    const t = tk(id); const me = PH.requireRole('buyer'); PH.assert(t.status === 'resolved', 'Resolve the ticket (with resolution details) before closing it.');
    PH.assert(remarks && remarks.trim().length >= 3, 'Closure remarks are required.'); t.status = 'closed'; t.closedAt = now(); t.closure = { by: me.name, remarks: remarks.trim(), at: now() }; PH.audit('ticket', t.id, 'closed', remarks); return t;
  };
  Tkt.reopen = function (id, reason) {
    const t = tk(id); const me = PH.requireRole('vendor'); PH.assert(me.vendorId === t.vendorId, 'Not your ticket.', 'FORBIDDEN'); PH.assert(['resolved', 'closed'].includes(t.status), 'Only resolved or closed tickets can be reopened.'); PH.assert(reason && reason.trim().length >= 5, 'Tell us why it is being reopened.');
    t.status = 'reopened'; t.reopenCount += 1; t.closedAt = null; t.messages.push({ by: me.name, role: 'vendor', internal: false, at: now(), text: 'Reopened: ' + reason.trim() }); PH.audit('ticket', t.id, 'reopened', reason);
    PH.Notify.push({ type: 'ticket_response', ref: t.id, to: { roles: ['buyer'] }, title: 'Ticket ' + t.id + ' reopened', body: reason, link: '#/tickets/' + t.id }); return t;
  };
  Tkt.report = function () {
    const l = PH.db().tickets; const t = PH.now(); const open = l.filter((x) => !['resolved', 'closed'].includes(x.status));
    const aging = { '0–2 days': 0, '3–7 days': 0, '8+ days': 0 }; open.forEach((x) => { const d = U.diffDays(x.createdAt, t); if (d <= 2) aging['0–2 days']++; else if (d <= 7) aging['3–7 days']++; else aging['8+ days']++; });
    return { open: open.length, resolved: l.filter((x) => ['resolved', 'closed'].includes(x.status)).length, aging, byCategory: U.groupBy(l, (x) => x.category), byVendor: U.groupBy(l, (x) => x.vendorId) };
  };

  // ================= Aggregates used by dashboards =================
  const Dash = (S.Dash = {});
  Dash.management = function () {
    const db = PH.db(); const vs = db.vendors; const sc = (st) => vs.filter((v) => v.status === st).length;
    const rank = Perf.ranking();
    return { active: sc('active'), dormant: sc('dormant'), blacklisted: sc('blacklisted'), blocked: sc('blocked'), closed: sc('closed'), rfqReleased: db.rfqs.filter((r) => r.publishedAt).length, rfqAwarded: db.rfqs.filter((r) => r.status === 'awarded').length, posCreated: db.pos.length, top: rank.slice(0, 3), low: rank.filter((x) => x.score < PH.cfg().rules.lowPerformerBelow), msmeOk: vs.filter((v) => v.msme && v.msme.is).length, msmePending: vs.filter((v) => !(v.msme && v.msme.is) || (v.msme.validTill && U.diffDays(PH.now(), v.msme.validTill) <= PH.cfg().rules.msmeExpiryNoticeDays)).length };
  };
  Dash.pendingApprovals = function () {
    const db = PH.db(); const items = [];
    db.onboarding.filter((o) => o.stage === 'approval').forEach((o) => S.Onb.nextApprovals(o).forEach((a) => items.push({ kind: 'onboarding', id: o.id, title: 'Vendor approval – ' + o.vendorName, level: a.role, since: o.decision && o.decision.at, link: '#/onboarding/' + o.id, value: null })));
    db.pans.filter((p) => p.status === 'in_approval').forEach((p) => { const c = S.Matrix.current(p.chain); items.push({ kind: 'pan', id: p.id, title: p.no + ' – ' + PH.byId('rfqs', p.rfqId).title, level: c.role, since: c.since, link: '#/pan/' + p.id, value: p.value, escalated: c.escalated }); });
    db.pos.filter((p) => p.pendingRevision).forEach((p) => { const c = S.Matrix.current(p.pendingRevision.chain); items.push({ kind: 'po_rev', id: p.id, title: 'PO ' + p.id + ' revision ' + p.pendingRevision.rev, level: c.role, since: p.pendingRevision.createdAt, link: '#/po/' + p.id, value: p.pendingRevision.value }); });
    db.vendors.filter((v) => v.blacklistRequest && v.blacklistRequest.status === 'pending').forEach((v) => items.push({ kind: 'blacklist', id: v.id, title: 'Blacklist – ' + v.name, level: 'SCM Head', since: v.blacklistRequest.at, link: '#/vendors/' + v.id }));
    db.reactivations.filter((x) => x.status === 'pending_head').forEach((x) => items.push({ kind: 'reactivation', id: x.id, title: 'Reactivation – ' + PH.vendor(x.vendorId).name, level: 'SCM Head', since: x.createdAt, link: '#/vendors/' + x.vendorId }));
    return items;
  };
})(typeof window !== 'undefined' ? window : globalThis);
