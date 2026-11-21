/* Source2Pay – Sourcing: RFQ, vendor response, negotiation, Price Approval Note (PAN), approval matrix, secure documents */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  PH.S = PH.S || {};
  const S = PH.S;
  const now = () => U.iso(PH.now());
  const rfqOf = (id) => { const r = PH.byId('rfqs', id); PH.assert(r, 'RFQ ' + id + ' not found.', 'NOT_FOUND'); return r; };
  const rlog = (r, t) => { r.log.push({ at: now(), by: PH.actor().name, text: t }); PH.audit('rfq', r.id, 'update', t); };

  // ================= Approval matrix =================
  const Matrix = (S.Matrix = {});
  Matrix.route = function ({ value, bu, paymentTerms, advancePct }) {
    const c = PH.cfg(); const band = c.approvalMatrix.find((b) => b.upTo == null || value <= b.upTo);
    const lv = new Set(band.levels); const pt = c.paymentTerms.find((p) => p.id === paymentTerms) || { days: 30, advance: 0 };
    const adv = advancePct != null ? advancePct : pt.advance; const k = c.approvalConditions;
    if (adv > 0) lv.add(k.advanceAddsLevel); if (adv > k.advanceHighPct) lv.add(k.advanceHighAddsLevel); if (pt.days < k.shortTermDays) lv.add(k.shortTermAddsLevel);
    const unit = c.businessUnits.find((b) => b.id === bu);
    return Array.from(lv).sort((a, b) => a - b).map((i) => {
      const role = c.approvalLevels[i];
      return { level: i, role, name: role === 'Business Unit Head' ? (unit ? unit.head : 'BU Head') : (c.approvers[role] || role), status: 'pending', by: null, at: null, remarks: '', escalated: false, since: null };
    });
  };
  Matrix.reasons = function ({ value, paymentTerms, advancePct }) {
    const c = PH.cfg(); const out = []; const band = c.approvalMatrix.find((b) => b.upTo == null || value <= b.upTo);
    out.push('Value ' + U.inrC(value) + ' falls in the band ' + (band.upTo ? 'up to ' + U.inrC(band.upTo) : 'above ' + U.inrC(c.approvalMatrix[c.approvalMatrix.length - 2].upTo)));
    const pt = c.paymentTerms.find((p) => p.id === paymentTerms) || { days: 30, advance: 0 }; const adv = advancePct != null ? advancePct : pt.advance;
    if (adv > 0) out.push('Advance payment (' + adv + '%) adds Finance Manager'); if (adv > c.approvalConditions.advanceHighPct) out.push('Advance above ' + c.approvalConditions.advanceHighPct + '% adds CFO');
    if (pt.days < c.approvalConditions.shortTermDays) out.push('Payment term shorter than ' + c.approvalConditions.shortTermDays + ' days adds Head of Procurement');
    return out;
  };
  Matrix.current = (chain) => chain.find((x) => x.status === 'pending') || null;

  // ================= Secure document access =================
  const Docs = (S.Docs = {});
  Docs.access = function (user, rfq) {
    if (!user) return { ok: false, reason: 'Not signed in' };
    if (PH.isInternal(user)) return { ok: true };
    if (user.role !== 'vendor') return { ok: false, reason: 'No access' };
    const rv = rfq.vendors.find((v) => v.vendorId === user.vendorId);
    if (!rv) return { ok: false, reason: 'You are not assigned to this RFQ.' };
    if (rfq.status === 'draft') return { ok: false, reason: 'RFQ is not published.' };
    if (rv.status === 'regret') return { ok: false, reason: 'Access ended – you declined to quote.' };
    if (rv.status === 'no_response') return { ok: false, reason: 'Access ended – the RFQ closed without your response.' };
    if (rfq.status === 'awarded') { const pan = PH.db().pans.find((p) => p.rfqId === rfq.id && p.status === 'approved'); if (!pan || pan.recommendation.vendorId !== user.vendorId) return { ok: false, reason: 'Access ended – this RFQ was awarded to another vendor.' }; return { ok: true, awarded: true }; }
    if (U.isPast(rfq.accessUntil)) return { ok: false, reason: 'Access window for this RFQ has expired.' };
    return { ok: true };
  };
  Docs.view = function (rfqId, docId) { // records first-access timestamp + audit trail
    const rfq = rfqOf(rfqId); const me = PH.actor(); const a = Docs.access(me, rfq);
    PH.assert(a.ok, a.reason, 'FORBIDDEN');
    const d = rfq.docs.find((x) => x.id === docId); PH.assert(d, 'Document not found.');
    if (me.role === 'vendor') {
      const rv = rfq.vendors.find((v) => v.vendorId === me.vendorId);
      if (!rv.firstAccessAt) { rv.firstAccessAt = now(); rv.status = rv.status === 'invited' ? 'viewed' : rv.status; }
      rfq.accessLog.push({ vendorId: me.vendorId, doc: d.name, at: now() });
    } else rfq.accessLog.push({ internal: me.name, doc: d.name, at: now() });
    PH.audit('rfq', rfq.id, 'document-view', d.name);
    return d;
  };

  // ================= RFQ =================
  const Rfq = (S.Rfq = {});
  Rfq.get = rfqOf;
  Rfq.eligibility = function (vendorId, rfq) {
    const v = PH.vendor(vendorId); const reasons = [], flags = [];
    if (v.status === 'blacklisted') reasons.push('Blacklisted – permanently blocked');
    else if (v.status === 'blocked') reasons.push('Blocked (repeated high quotes)');
    else if (v.status === 'dormant') reasons.push('Dormant account – reactivation required');
    else if (v.status === 'closed') reasons.push('Account closed');
    const sc = S.Perf.overall(v); if (sc < PH.cfg().rules.lowPerformerBelow) flags.push('Low performer (' + sc + ')');
    if (v.msme && v.msme.is && v.msme.validTill && U.isPast(v.msme.validTill)) flags.push('MSME certificate expired');
    if (v.consecutiveHigh >= 4) flags.push('Quoted high in ' + v.consecutiveHigh + ' consecutive RFQs');
    return { eligible: !reasons.length, reasons, flags, score: sc };
  };
  // Enter a new requirement (purchase requisition) – lets a user start the cycle with their own data.
  Rfq.createRequirement = function (f) {
    PH.requireRole('buyer'); f = f || {}; const c = PH.cfg(); const e = {};
    if (!f.title || f.title.trim().length < 5) e.title = 'Give the requirement a title (min 5 characters).';
    const bu = c.businessUnits.find((b) => b.id === f.bu); if (!bu) e.bu = 'Select a business unit.';
    if (!f.commodity || !c.commodities.includes(f.commodity)) e.commodity = 'Select a commodity.';
    if (!f.project || !f.project.trim()) e.project = 'Enter the project or cost centre.';
    const rows = (f.items || []).filter((x) => x && ((x.desc && x.desc.trim()) || x.qty || x.rate));
    if (!rows.length) e.items = 'Add at least one item.';
    const items = rows.map((x, i) => {
      const n = i + 1, qty = U.num(x.qty), rate = U.num(x.rate), days = x.days === '' || x.days == null ? 30 : U.num(x.days);
      if (!x.desc || x.desc.trim().length < 3) e['item' + n + '.desc'] = 'Describe item ' + n + '.';
      if (!(qty > 0)) e['item' + n + '.qty'] = 'Quantity must be greater than 0.';
      if (!(rate > 0)) e['item' + n + '.rate'] = 'Budget rate must be greater than 0.';
      if (!c.uoms.includes(x.uom)) e['item' + n + '.uom'] = 'Select a unit.';
      if (!(days >= 1 && days <= 730)) e['item' + n + '.days'] = 'Required-in days must be 1–730.';
      return { no: n, code: 'NEW-' + U.pad(n, 3), desc: (x.desc || '').trim(), hsn: (x.hsn || '').trim() || '—', qty, uom: x.uom, reqDate: U.iso(U.addDays(PH.now(), days)), budgetRate: rate, benchmarkRate: rate, systemRate: rate, hist: { vendor: 'No purchase history', date: U.iso(PH.now()), rate } };
    });
    if (Object.keys(e).length) PH.fail('Requirement needs attention.', 'VALIDATION', e);
    const S = PH.db().erp; const no = PH.nextId('pr'); const wbs = bu.id + '-NEW-' + no.slice(-4);
    const value = U.round(U.sum(items, (i) => i.qty * i.budgetRate), 2);
    const pr = { no, title: f.title.trim(), bu: bu.id, project: f.project.trim(), wbs, commodity: f.commodity, plant: 'Main Plant, Pune', date: U.iso(PH.now()), requester: PH.actor().name, status: 'Released', items };
    S.prs.push(pr); S.budgets[wbs] = { project: pr.project, total: U.round(value * 1.25, 2), committed: 0 };
    return pr;
  };
  Rfq.create = function ({ prNo, templateId, title, poType }) {
    PH.requireRole('buyer');
    const pr = PH.Sys.getPR(prNo); PH.assert(pr, 'A valid released Purchase Requisition is required to create an RFQ.');
    const db = PH.db(); const tpl = PH.cfg().rfqTemplates.find((t) => t.id === templateId) || PH.cfg().rfqTemplates[0];
    const r = {
      id: PH.nextId('rfq'), prNo: pr.no, title: (title && title.trim()) || pr.title, bu: pr.bu, project: pr.project, wbs: pr.wbs, commodity: pr.commodity, plant: pr.plant, poType: poType || 'PO1',
      buyer: PH.actor().name, lead: PH.cfg().approvers['Category Manager'], templateId: tpl.id, status: 'draft', createdAt: now(), publishedAt: null, deadline: null, accessUntil: null,
      items: pr.items.map((i) => Object.assign({}, U.clone(i), { deliveryDate: i.reqDate })),
      docs: tpl.docs.map((n, i) => ({ id: 'D' + (i + 1), name: n + '.pdf', type: n, protected: true })), vendors: [], accessLog: [], log: [], sysRef: { pr: pr.no, wbs: pr.wbs, fetchedAt: now() }, prCreatedAt: pr.date, defaults: { paymentTerm: tpl.paymentTerm, incoterm: tpl.incoterm }, modelLink: null,
    };
    db.rfqs.push(r); pr.status = 'In RFQ'; rlog(r, 'RFQ created from PR ' + pr.no);
    return r;
  };
  Rfq.addDoc = function (id, name, type) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'draft', 'Documents can only be changed before publishing.'); PH.assert(name && name.trim(), 'Document name is required.'); r.docs.push({ id: 'D' + (r.docs.length + 1 + Math.floor(Math.random() * 1000)), name: name.trim(), type: type || 'Supporting Attachment', protected: true }); rlog(r, 'Document added: ' + name); return r; };
  Rfq.removeDoc = function (id, docId) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'draft', 'Documents can only be changed before publishing.'); r.docs = r.docs.filter((d) => d.id !== docId); return r; };
  Rfq.setItemDate = function (id, no, date) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'draft', 'Only draft RFQs can be edited.'); const it = r.items.find((i) => i.no === no); PH.assert(it, 'Item not found'); it.deliveryDate = date; return r; };
  Rfq.publish = function (id, { deadline, accessDays, vendorIds }) {
    PH.requireRole('buyer'); const r = rfqOf(id); const db = PH.db();
    PH.assert(r.status === 'draft', 'RFQ is already published.');
    PH.assert(PH.Sys.getPR(r.prNo), 'The linked PR is no longer valid.');
    PH.assert(r.docs.length > 0, 'Attach at least one RFQ document before publishing.');
    PH.assert(r.items.every((i) => i.deliveryDate), 'Every RFQ line item needs its own expected delivery date.');
    PH.assert(vendorIds && vendorIds.length > 0, 'Select at least one vendor to receive this RFQ.');
    const days = U.num(accessDays) || PH.cfg().rules.rfqDefaultAccessDays; PH.assert(days >= 1 && days <= 365, 'Access duration must be between 1 and 365 days.');
    PH.assert(deadline && !isNaN(U.toDate(deadline)), 'Response deadline is required.'); PH.assert(!U.isPast(deadline), 'Response deadline must be in the future.');
    const accessUntil = U.addDays(PH.now(), days); PH.assert(U.toDate(deadline) <= accessUntil, 'Response deadline cannot be later than the access window end.');
    vendorIds.forEach((vid) => { const e = Rfq.eligibility(vid, r); PH.assert(e.eligible, PH.vendor(vid).name + ' cannot be assigned: ' + e.reasons.join('; ') + '.', 'INELIGIBLE'); });
    r.vendors = vendorIds.map((vid) => ({ vendorId: vid, status: 'invited', invitedAt: now(), firstAccessAt: null, respondedAt: null }));
    r.status = 'published'; r.publishedAt = now(); r.deadline = U.iso(deadline); r.accessUntil = U.iso(accessUntil); r.maxRounds = PH.cfg().rules.maxNegotiationRounds;
    rlog(r, 'Published to ' + vendorIds.length + ' vendor(s); deadline ' + U.dt(deadline));
    vendorIds.forEach((vid) => PH.Notify.push({ type: 'rfq_assigned', ref: r.id, to: { vendorId: vid }, title: 'New RFQ ' + r.id + ': ' + r.title, body: 'Respond by ' + U.dt(deadline) + '. Documents are view-only.', link: '#/rfq/' + r.id }));
    return r;
  };
  Rfq.extend = function (id, deadline) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'published' || r.status === 'closed', 'Only published RFQs can be extended.'); PH.assert(!U.isPast(deadline), 'New deadline must be in the future.'); r.deadline = U.iso(deadline); if (U.toDate(deadline) > U.toDate(r.accessUntil)) r.accessUntil = U.iso(deadline); r.vendors.forEach((v) => { if (v.status === 'no_response') v.status = 'invited'; }); r.status = 'published'; rlog(r, 'Deadline extended to ' + U.dt(deadline)); return r; };
  Rfq.close = function (id) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'published', 'Only published RFQs can be closed.'); Rfq._closeNonResponders(r); r.status = 'closed'; r.closedAt = now(); rlog(r, 'RFQ closed by buyer'); return r; };
  Rfq._closeNonResponders = function (r) {
    r.vendors.forEach((v) => { if (['invited', 'viewed'].includes(v.status) || (v.status === 'draft')) { v.status = 'no_response'; PH.Notify.push({ type: 'rfq_closed_no_response', ref: r.id, to: { vendorId: v.vendorId, roles: ['buyer'] }, title: 'RFQ ' + r.id + ' closed – no response from ' + PH.vendor(v.vendorId).name, body: 'The response period ended without a submission.', link: '#/rfq/' + r.id }); S.Perf.event(v.vendorId, 'participation', -4); S.Perf.event(v.vendorId, 'responsiveness', -3); } });
  };
  Rfq.cancel = function (id, reason) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(['draft', 'published'].includes(r.status), 'Awarded or closed RFQs cannot be cancelled.'); PH.assert(reason && reason.trim().length >= 5, 'Reason is required.'); r.status = 'cancelled'; rlog(r, 'Cancelled: ' + reason); return r; };
  Rfq.setModelLink = function (id, link) { PH.requireRole('buyer'); const r = rfqOf(id); PH.assert(r.status === 'awarded', 'The model link can be shared only after award.'); PH.assert(link && link.trim(), 'Provide the model link.'); r.modelLink = link.trim(); rlog(r, 'Model link shared with the awarded vendor'); const pan = PH.db().pans.find((p) => p.rfqId === r.id && p.status === 'approved'); if (pan) PH.Notify.push({ type: 'rfq_award', ref: r.id, to: { vendorId: pan.recommendation.vendorId }, title: 'Model link shared for ' + r.id, body: 'Open the RFQ page to access the model link.', link: '#/rfq/' + r.id }); return r; };
  Rfq.visibleTo = function (user) {
    const l = PH.db().rfqs; if (PH.isInternal(user)) return l;
    return l.filter((r) => r.status !== 'draft' && r.status !== 'cancelled' && r.vendors.some((v) => v.vendorId === user.vendorId));
  };

  // ================= Vendor quotation =================
  const Quote = (S.Quote = {});
  Quote.find = (rfqId, vendorId) => PH.db().quotes.find((q) => q.rfqId === rfqId && q.vendorId === vendorId) || null;
  // Vendors never see other vendors' responses; internal users see all (authorised roles only)
  Quote.visibleTo = (user, rfqId) => PH.db().quotes.filter((q) => (!rfqId || q.rfqId === rfqId) && (user.role === 'vendor' ? q.vendorId === user.vendorId : PH.isInternal(user)));
  Quote.totals = function (rfq, round) {
    const base = U.round(U.sum(rfq.items, (it) => { const l = round.lines.find((x) => x.no === it.no); return l ? l.rate * it.qty : 0; }), 2);
    const e = round.header.extras || {}; const extras = U.round(U.sum(['development', 'inspection', 'tooling', 'freight', 'other'], (k) => U.num(e[k])), 2);
    return { base, extras, total: U.round(base + extras, 2) };
  };
  const vendorCtx = (rfqId) => {
    const me = PH.requireRole('vendor'); const rfq = rfqOf(rfqId); const rv = rfq.vendors.find((v) => v.vendorId === me.vendorId);
    PH.assert(rv, 'You are not assigned to this RFQ.', 'FORBIDDEN'); return { me, rfq, rv };
  };
  const validateRound = (rfq, d) => {
    const e = {}; const h = d.header || {};
    if (!h.paymentTerms) e.paymentTerms = 'Select payment terms.'; if (!h.taxId) e.taxId = 'Select tax structure.'; if (!h.incoterm) e.incoterm = 'Select incoterms.';
    if (!(U.num(h.validityDays) >= 1)) e.validityDays = 'Price validity (days) is required.';
    rfq.items.forEach((it) => { const l = (d.lines || []).find((x) => x.no === it.no);
      if (!l || !(U.num(l.rate) > 0)) e['rate.' + it.no] = 'Enter a unit rate greater than zero for item ' + it.no + '.';
      if (!l || !l.deliveryDate) e['date.' + it.no] = 'Commit a delivery date for item ' + it.no + '.'; else if (U.toDate(l.deliveryDate) < U.addDays(PH.now(), -1)) e['date.' + it.no] = 'Delivery date cannot be in the past.'; });
    ['development', 'inspection', 'tooling', 'freight', 'other'].forEach((k) => { if (U.num((h.extras || {})[k]) < 0) e['extra.' + k] = 'Cannot be negative.'; });
    return e;
  };
  const cleanRound = (rfq, d, extra) => ({
    header: { paymentTerms: d.header.paymentTerms, advancePct: U.num(d.header.advancePct), taxId: d.header.taxId, incoterm: d.header.incoterm, validityDays: U.num(d.header.validityDays), currency: d.header.currency || 'INR', exchangeRate: U.num(d.header.exchangeRate) || 1, placeOfSupply: d.header.placeOfSupply || '', extras: { development: U.num((d.header.extras || {}).development), inspection: U.num((d.header.extras || {}).inspection), tooling: U.num((d.header.extras || {}).tooling), freight: U.num((d.header.extras || {}).freight), other: U.num((d.header.extras || {}).other) } },
    lines: rfq.items.map((it) => { const l = d.lines.find((x) => x.no === it.no); return { no: it.no, rate: U.num(l.rate), deliveryDate: l.deliveryDate, remarks: l.remarks || '' }; }),
    docs: d.docs || [], ...extra,
  });
  Quote.saveDraft = function (rfqId, d) {
    const { me, rfq, rv } = vendorCtx(rfqId); const db = PH.db();
    PH.assert(rfq.status === 'published', 'This RFQ is closed for responses.'); PH.assert(!U.isPast(rfq.deadline), 'The response deadline has passed.');
    PH.assert(!['regret'].includes(rv.status), 'You have declined this RFQ.');
    let q = Quote.find(rfqId, me.vendorId); PH.assert(!q || q.status !== 'submitted', 'A submitted response cannot be reverted to draft – use Modify & resubmit.');
    if (!q) { q = { id: PH.nextId('q'), rfqId, vendorId: me.vendorId, status: 'draft', draft: null, rounds: [], negotiation: { status: 'none', comments: [], awaiting: null }, finalRound: null, editLog: [] }; db.quotes.push(q); }
    q.draft = U.clone(d); q.draftAt = now(); if (rv.status === 'invited' || rv.status === 'viewed') rv.status = 'draft'; PH.audit('quote', q.id, 'draft-saved', rfqId); return q;
  };
  Quote.submit = function (rfqId, d) {
    const { me, rfq, rv } = vendorCtx(rfqId); const db = PH.db();
    PH.assert(rfq.status === 'published', 'This RFQ is closed for responses.'); PH.assert(!U.isPast(rfq.deadline), 'The response deadline has passed.');
    PH.assert(rv.status !== 'regret', 'You have declined this RFQ.');
    const e = validateRound(rfq, d); if (!d.ack) e.ack = 'Digital acknowledgement is required before submission.';
    if (Object.keys(e).length) PH.fail('Response has ' + Object.keys(e).length + ' issue(s).', 'VALIDATION', e);
    let q = Quote.find(rfqId, me.vendorId);
    if (q && q.status === 'submitted') { // modification until negotiation / closure
      PH.assert(q.negotiation.status === 'none', 'The buyer has started negotiation – the original response is locked. Submit a revised offer instead.');
      q.editLog.push({ at: now(), previous: U.clone(q.rounds[0]) }); q.rounds[0] = Object.assign(cleanRound(rfq, d, { n: 0, kind: 'initial', at: now(), by: me.name, remarks: d.remarks || '' }), { modified: true });
      rv.respondedAt = now(); PH.audit('quote', q.id, 'modified', 'Response modified before negotiation'); return q;
    }
    if (!q) { q = { id: PH.nextId('q'), rfqId, vendorId: me.vendorId, status: 'draft', draft: null, rounds: [], negotiation: { status: 'none', comments: [], awaiting: null }, finalRound: null, editLog: [] }; db.quotes.push(q); }
    q.rounds = [cleanRound(rfq, d, { n: 0, kind: 'initial', at: now(), by: me.name, remarks: d.remarks || '' })]; q.status = 'submitted'; q.draft = null; q.submittedAt = now();
    rv.status = 'submitted'; rv.respondedAt = now();
    PH.audit('quote', q.id, 'submitted', rfqId); S.Perf.event(me.vendorId, 'participation', 3); S.Perf.event(me.vendorId, 'responsiveness', 2); me.lastActive = now(); PH.vendor(me.vendorId).lastActivityAt = now();
    PH.Notify.push({ type: 'rfq_assigned', ref: rfq.id, to: { roles: ['buyer'] }, title: 'Response received: ' + PH.vendor(me.vendorId).name, body: 'Vendor submitted a quotation for ' + rfq.id + '.', link: '#/rfq/' + rfq.id });
    return q;
  };
  Quote.regret = function (rfqId, reason) {
    const { me, rfq, rv } = vendorCtx(rfqId); PH.assert(['published'].includes(rfq.status), 'RFQ is not open.'); PH.assert(reason && reason.trim().length >= 5, 'Please state a reason for declining.');
    PH.assert(rv.status !== 'regret', 'Already declined.');
    let q = Quote.find(rfqId, me.vendorId); if (!q) { q = { id: PH.nextId('q'), rfqId, vendorId: me.vendorId, status: 'draft', draft: null, rounds: [], negotiation: { status: 'none', comments: [], awaiting: null }, finalRound: null, editLog: [] }; PH.db().quotes.push(q); }
    q.status = 'regret'; q.regretReason = reason; q.negotiation.status = q.negotiation.status === 'open' ? 'closed' : q.negotiation.status; rv.status = 'regret';
    PH.audit('quote', q.id, 'regret', reason); S.Perf.event(me.vendorId, 'participation', -2);
    PH.Notify.push({ type: 'rfq_closed_no_response', ref: rfq.id, to: { roles: ['buyer'] }, title: PH.vendor(me.vendorId).name + ' declined RFQ ' + rfq.id, body: reason, link: '#/rfq/' + rfq.id }); return q;
  };

  // ================= Negotiation =================
  const Neg = (S.Neg = {});
  Neg.roundsUsed = (q) => q.rounds.filter((r) => r.kind === 'revised').length;
  Neg.request = function (rfqId, vendorId, comment) {
    PH.requireRole('buyer'); const rfq = rfqOf(rfqId); const q = Quote.find(rfqId, vendorId);
    PH.assert(q && q.status === 'submitted', 'Negotiation can start only after the vendor has submitted an initial response.');
    PH.assert(q.finalRound == null, 'A Final Commercial Offer is already marked for this vendor.');
    PH.assert(rfq.status !== 'awarded' && rfq.status !== 'cancelled', 'This RFQ is no longer open for negotiation.');
    PH.assert(Neg.roundsUsed(q) < PH.cfg().rules.maxNegotiationRounds, 'Maximum negotiation rounds (' + PH.cfg().rules.maxNegotiationRounds + ') reached – mark a Final Commercial Offer.');
    PH.assert(comment && comment.trim().length >= 5, 'Add a comment/target for the vendor.');
    PH.assert(q.negotiation.awaiting !== 'vendor', 'Waiting for the vendor to respond to the previous request.');
    q.negotiation.status = 'open'; q.negotiation.awaiting = 'vendor'; q.negotiation.comments.push({ by: PH.actor().name, role: 'buyer', at: now(), text: comment.trim() });
    rfq.vendors.find((v) => v.vendorId === vendorId).status = 'negotiation'; PH.audit('quote', q.id, 'negotiation-requested', comment.slice(0, 60)); rlog(rfq, 'Negotiation requested from ' + PH.vendor(vendorId).name);
    PH.Notify.push({ type: 'rfq_assigned', ref: rfq.id, to: { vendorId }, title: 'Negotiation request on ' + rfq.id, body: comment.slice(0, 140), link: '#/rfq/' + rfq.id });
    return q;
  };
  Neg.submitRevised = function (rfqId, d) {
    const { me, rfq, rv } = vendorCtx(rfqId); const q = Quote.find(rfqId, me.vendorId);
    PH.assert(q && q.negotiation.status === 'open' && q.negotiation.awaiting === 'vendor', 'Revised quotations are accepted only in response to an active negotiation request.');
    PH.assert(Neg.roundsUsed(q) < PH.cfg().rules.maxNegotiationRounds, 'Maximum negotiation rounds reached.');
    const e = validateRound(rfq, d); if (!d.remarks || d.remarks.trim().length < 3) e.remarks = 'Add supporting remarks for the revision.';
    if (Object.keys(e).length) PH.fail('Revised offer has issues.', 'VALIDATION', e);
    const n = q.rounds.length; q.rounds.push(cleanRound(rfq, d, { n, kind: 'revised', at: now(), by: me.name, remarks: d.remarks.trim(), noRegret: !!d.noRegret }));
    q.negotiation.awaiting = 'buyer'; if (d.noRegret) q.negotiation.vendorFinal = n; rv.status = 'negotiation'; PH.audit('quote', q.id, 'revised-submitted', 'Round ' + n);
    PH.Notify.push({ type: 'rfq_assigned', ref: rfq.id, to: { roles: ['buyer'] }, title: 'Revised offer from ' + PH.vendor(me.vendorId).name, body: 'Negotiation round ' + n + (d.noRegret ? ' (marked No-Regret final offer)' : '') + ' for ' + rfq.id, link: '#/rfq/' + rfq.id });
    return q;
  };
  Neg.markFinal = function (rfqId, vendorId, n) {
    PH.requireRole('buyer'); const rfq = rfqOf(rfqId); const q = Quote.find(rfqId, vendorId); PH.assert(q && q.status === 'submitted', 'Vendor has no submitted response.');
    PH.assert(rfq.status !== 'awarded', 'RFQ already awarded.'); PH.assert(q.rounds[n], 'Round not found.'); PH.assert(q.negotiation.awaiting !== 'vendor', 'Vendor is yet to respond to the open negotiation request.');
    q.finalRound = n; q.negotiation.status = 'closed'; q.negotiation.awaiting = null; q.finalAt = now(); rfq.vendors.find((v) => v.vendorId === vendorId).status = 'final';
    PH.audit('quote', q.id, 'final-offer', 'Round ' + n + ' marked Final Commercial Offer'); rlog(rfq, 'Final Commercial Offer marked for ' + PH.vendor(vendorId).name + ' (round ' + n + ')');
    PH.Notify.push({ type: 'rfq_assigned', ref: rfq.id, to: { vendorId }, title: 'Final offer recorded for ' + rfq.id, body: 'Your round-' + n + ' quotation is the Final Commercial Offer.', link: '#/rfq/' + rfq.id }); return q;
  };

  // ================= Price Approval Note =================
  const Pan = (S.Pan = {});
  const panOf = (id) => { const p = PH.byId('pans', id); PH.assert(p, 'PAN not found', 'NOT_FOUND'); return p; };
  const plog = (p, t) => { p.history.push({ at: now(), by: PH.actor().name, text: t }); PH.audit('pan', p.id, 'update', t); };
  Pan.get = panOf;
  Pan.evaluate = function (pan) {
    const rfq = rfqOf(pan.rfqId); const db = PH.db(); const vendors = [];
    db.quotes.filter((q) => q.rfqId === rfq.id && q.finalRound != null).forEach((q) => {
      const fin = q.rounds[q.finalRound]; const init = q.rounds[0]; const t = Quote.totals(rfq, fin), ti = Quote.totals(rfq, init);
      const days = Math.max(...fin.lines.map((l) => Math.round(U.diffDays(rfq.publishedAt || now(), l.deliveryDate))));
      vendors.push({ vendorId: q.vendorId, name: PH.vendor(q.vendorId).name, quoteId: q.id, round: q.finalRound, rounds: q.rounds.length - 1, header: fin.header, lines: fin.lines, base: t.base, extras: t.extras, total: t.total, initialTotal: ti.total, deliveryDays: days, score: S.Perf.overall(PH.vendor(q.vendorId)) });
    });
    vendors.sort((a, b) => a.total - b.total || a.deliveryDays - b.deliveryDays); vendors.forEach((v, i) => { v.rank = i + 1; v.isL1 = i === 0; v.vsL1 = vendors.length ? U.round(((v.total - vendors[0].total) / vendors[0].total) * 100, 2) : 0; });
    const budgetValue = U.round(U.sum(rfq.items, (i) => i.budgetRate * i.qty), 2), systemValue = U.round(U.sum(rfq.items, (i) => i.systemRate * i.qty), 2), benchmarkValue = U.round(U.sum(rfq.items, (i) => i.benchmarkRate * i.qty), 2);
    const sel = pan.recommendation ? vendors.find((v) => v.vendorId === pan.recommendation.vendorId) : null;
    const savings = sel ? { actual: U.round(systemValue - sel.total, 2), budget: U.round(budgetValue - sel.total, 2), negotiated: U.round(sel.initialTotal - sel.total, 2) } : null;
    return { vendors, l1: vendors[0] || null, budgetValue, systemValue, benchmarkValue, savings, selected: sel };
  };
  Pan.create = function (rfqId) {
    PH.requireRole('buyer'); const rfq = rfqOf(rfqId); const db = PH.db();
    PH.assert(['published', 'closed'].includes(rfq.status), 'Only a published/closed RFQ can proceed to a Price Approval Note.');
    const finals = db.quotes.filter((q) => q.rfqId === rfqId && q.finalRound != null);
    PH.assert(finals.length > 0, 'A PAN can be created only after responses are submitted and a Final Commercial Offer is marked (negotiation complete).');
    PH.assert(!db.pans.find((p) => p.rfqId === rfqId && !['rejected'].includes(p.status)), 'An active PAN already exists for this RFQ.');
    PH.Sys.getPR(rfq.prNo); // fetch PR details
    PH.Sys.log('HIST_FETCH', 'IN', rfq.prNo, { items: rfq.items.map((i) => i.code) }, 'ok', 'Historical POs and rates for ' + rfq.items.length + ' item(s)');
    const n = db.pans.filter((p) => p.no.startsWith('PAN/' + rfq.bu + '/' + U.fy(PH.now()))).length + 1;
    const p = { id: PH.nextId('pan'), no: 'PAN/' + rfq.bu + '/' + U.fy(PH.now()) + '/' + U.pad(n), rfqId, prNo: rfq.prNo, bu: rfq.bu, project: rfq.project, wbs: rfq.wbs, commodity: rfq.commodity, buyer: PH.actor().name, lead: rfq.lead, status: 'draft', createdAt: now(), recommendation: null, chain: [], history: [], poNo: null, locked: false, reopen: null, cycle: 1 };
    db.pans.push(p); plog(p, 'PAN created ' + p.no); return p;
  };
  Pan.recommend = function (id, r) {
    PH.requireRole('buyer'); const p = panOf(id); PH.assert(!p.locked, 'PAN is locked after approval and cannot be edited unless reopened through authorised approval.');
    PH.assert(['draft', 'returned'].includes(p.status), 'PAN cannot be edited in status ' + p.status + '.');
    const ev = Pan.evaluate(p); const sel = ev.vendors.find((v) => v.vendorId === r.vendorId); PH.assert(sel, 'Select a vendor with a Final Commercial Offer.');
    const rfq = rfqOf(p.rfqId); const e = {};
    if (!r.justification || r.justification.trim().length < 10) e.justification = 'Commercial justification is mandatory (min 10 characters).';
    if (!sel.isL1 && (!r.nonL1 || r.nonL1.trim().length < 10)) e.nonL1 = 'Selecting a vendor other than L1 needs a mandatory justification.';
    const increase = rfq.items.filter((it) => { const l = sel.lines.find((x) => x.no === it.no); return l && l.rate > it.systemRate; });
    if (increase.length && (!r.priceIncrease || r.priceIncrease.trim().length < 10)) e.priceIncrease = 'Rate is above the existing system rate for item(s) ' + increase.map((i) => i.no).join(', ') + ' – justification is mandatory.';
    if (ev.vendors.length < PH.cfg().rules.minQuotesForPan && (!r.fewQuotes || r.fewQuotes.trim().length < 10)) e.fewQuotes = 'Fewer than ' + PH.cfg().rules.minQuotesForPan + ' quotations are available – explain the exception.';
    if (Object.keys(e).length) PH.fail('PAN recommendation needs attention.', 'VALIDATION', e);
    p.recommendation = { vendorId: r.vendorId, justification: r.justification.trim(), nonL1: r.nonL1 || '', priceIncrease: r.priceIncrease || '', fewQuotes: r.fewQuotes || '', remarks: r.remarks || '', isL1: sel.isL1, total: sel.total, savings: Pan.evaluate(Object.assign({}, p, { recommendation: { vendorId: r.vendorId } })).savings };
    plog(p, 'Recommended vendor: ' + sel.name + (sel.isL1 ? ' (L1)' : ' (non-L1, justified)')); return p;
  };
  Pan.submit = function (id) {
    PH.requireRole('buyer'); const p = panOf(id); PH.assert(['draft', 'returned'].includes(p.status), 'PAN is not in an editable state.');
    PH.assert(p.recommendation, 'Record the recommended vendor and justification first.');
    const ev = Pan.evaluate(p); const sel = ev.selected || ev.vendors.find((v) => v.vendorId === p.recommendation.vendorId); PH.assert(sel, 'Recommended vendor has no valid Final Commercial Offer.');
    p.recommendation.total = sel.total; p.value = sel.total; p.terms = { paymentTerms: sel.header.paymentTerms, advancePct: sel.header.advancePct };
    p.chain = Matrix.route({ value: sel.total, bu: p.bu, paymentTerms: sel.header.paymentTerms, advancePct: sel.header.advancePct }); p.chain[0].since = now();
    p.routeReasons = Matrix.reasons({ value: sel.total, paymentTerms: sel.header.paymentTerms, advancePct: sel.header.advancePct });
    p.status = 'in_approval'; p.submittedAt = now(); plog(p, 'Submitted for approval (' + p.chain.length + ' levels)');
    PH.Notify.push({ type: 'pending_approval', ref: p.no, to: { roles: ['approver'] }, title: 'PAN approval pending: ' + p.no, body: 'Level 1: ' + p.chain[0].role + ' – value ' + U.inrC(sel.total), link: '#/approvals' }); return p;
  };
  Pan.act = function (id, decision, remarks) {
    PH.requireRole('approver'); const p = panOf(id); PH.assert(p.status === 'in_approval', 'PAN is not awaiting approval.');
    PH.assert(['approve', 'reject', 'return'].includes(decision), 'Invalid decision'); if (decision !== 'approve') PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are mandatory to ' + decision + '.');
    const cur = Matrix.current(p.chain); PH.assert(cur, 'No pending level.');
    Object.assign(cur, { status: decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'returned', by: cur.name, at: now(), remarks: remarks || '' });
    plog(p, cur.role + ' (' + cur.name + '): ' + decision);
    if (decision === 'reject') { p.status = 'rejected'; PH.Notify.push({ type: 'pending_approval', ref: p.no, to: { roles: ['buyer'] }, title: 'PAN rejected: ' + p.no, body: cur.role + ': ' + remarks, link: '#/pan/' + p.id }); return p; }
    if (decision === 'return') { p.status = 'returned'; p.cycle += 1; PH.Notify.push({ type: 'pending_approval', ref: p.no, to: { roles: ['buyer'] }, title: 'PAN returned for revision: ' + p.no, body: cur.role + ': ' + remarks, link: '#/pan/' + p.id }); return p; }
    const nxt = Matrix.current(p.chain);
    if (nxt) { nxt.since = now(); PH.Notify.push({ type: 'pending_approval', ref: p.no, to: { roles: ['approver'] }, title: 'PAN approval pending: ' + p.no, body: 'Next level: ' + nxt.role, link: '#/approvals' }); return p; }
    Pan._finalApprove(p); return p;
  };
  Pan._finalApprove = function (p) {
    const db = PH.db(); const rfq = rfqOf(p.rfqId); const ev = Pan.evaluate(p); const sel = ev.selected; p.status = 'approved'; p.locked = true; p.approvedAt = now(); rfq.status = 'awarded'; rfq.awardedAt = now();
    plog(p, 'Final approval – PAN locked, RFQ awarded'); rlog(rfq, 'Awarded to ' + sel.name + ' via ' + p.no);
    ev.vendors.forEach((v) => { const rv = rfq.vendors.find((x) => x.vendorId === v.vendorId); if (!rv) return; const vend = PH.vendor(v.vendorId); vend.consecutiveHigh = v.isL1 ? 0 : (vend.consecutiveHigh || 0) + 1; if (v.vendorId === sel.vendorId) { rv.status = 'awarded'; S.Perf.event(v.vendorId, 'commercial', 3); } else { rv.status = 'not_awarded'; S.Perf.event(v.vendorId, 'commercial', v.isL1 ? 1 : -2); } S.Gov.checkRepeatedHigh(vend); });
    rfq.vendors.forEach((rv) => { if (!['awarded', 'not_awarded'].includes(rv.status) && rv.status !== 'regret') rv.status = 'not_awarded'; });
    rfq.vendors.forEach((rv) => { const won = rv.vendorId === sel.vendorId; PH.Notify.push({ type: 'rfq_award', ref: rfq.id, to: { vendorId: rv.vendorId }, title: won ? 'Congratulations – RFQ ' + rfq.id + ' awarded to you' : 'RFQ ' + rfq.id + ' outcome: not selected', body: won ? 'Your quotation was selected. Your purchase order will follow.' : 'Thank you for participating. Access to RFQ documents has now ended.', link: '#/rfq/' + rfq.id }); });
    PH.Notify.push({ type: 'rfq_award', ref: p.no, to: { roles: ['buyer', 'leader'] }, title: p.no + ' fully approved', body: 'Approved – the purchase order is being issued.', link: '#/pan/' + p.id });
    PH.Sys.send('PO_REQUEST', { panId: p.id, panNo: p.no, rfq: rfq.id, pr: rfq.prNo, wbs: rfq.wbs, project: rfq.project, bu: rfq.bu, commodity: rfq.commodity, vendorCode: PH.vendor(sel.vendorId).code, vendorName: sel.name, value: sel.total, header: sel.header, approval: { ref: p.no, status: 'Approved', date: p.approvedAt, remarks: p.chain[p.chain.length - 1].remarks } }, p.no);
    PH.Sys.log('HIST_FETCH', 'IN', p.no, {}, 'ok', 'Approved rate package transmitted for PO creation');
  };
  Pan.pendingFor = () => PH.db().pans.filter((p) => p.status === 'in_approval');
  Pan.escalateOverdue = function () {
    const sla = PH.cfg().approvalSlaDays; let n = 0;
    PH.db().pans.filter((p) => p.status === 'in_approval').forEach((p) => { const cur = Matrix.current(p.chain); if (cur && cur.since && !cur.escalated && U.diffDays(cur.since, PH.now()) > sla) { cur.escalated = true; n++; const idx = p.chain.indexOf(cur); const nx = p.chain[idx + 1]; plog(p, 'Escalated: ' + cur.role + ' did not act within ' + sla + ' day(s)' + (nx ? ' – notified ' + nx.role : '')); PH.Notify.push({ type: 'pending_approval', ref: p.no, to: { roles: ['approver', 'leader'] }, title: 'ESCALATION: ' + p.no + ' pending at ' + cur.role, body: 'Approval overdue by ' + Math.floor(U.diffDays(cur.since, PH.now()) - sla) + ' day(s).', link: '#/approvals' }); } });
    return n;
  };
})(typeof window !== 'undefined' ? window : globalThis);
