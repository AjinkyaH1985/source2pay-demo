/* Source2Pay – internal workflow engine: issues POs, records goods receipts, matches invoices and releases payments.
   Events are written to an internal log (Sys.log) used for audit and tests. */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  const Sys = (PH.Sys = {});

  // Event catalogue
  Sys.IFACES = {
    VENDOR_DUP_CHECK: { dir: 'IN', module: 'Onboarding', label: 'Vendor duplicate check' },
    VENDOR_CREATE: { dir: 'OUT', module: 'Onboarding', label: 'Vendor master create request' },
    VENDOR_CODE: { dir: 'IN', module: 'Onboarding', label: 'Vendor code sync-back' },
    PR_FETCH: { dir: 'IN', module: 'RFQ', label: 'PR / WBS / project / budget fetch' },
    HIST_FETCH: { dir: 'IN', module: 'PAN', label: 'Historical PO & procurement rates' },
    PO_REQUEST: { dir: 'OUT', module: 'PAN', label: 'Approved price package for PO creation' },
    PO_SYNC: { dir: 'IN', module: 'PO', label: 'Purchase order sync' },
    PO_REVISION: { dir: 'IN', module: 'PO', label: 'PO amendment sync' },
    INSPECTION_STATUS: { dir: 'OUT', module: 'Quality', label: 'Inspection status update' },
    GRN_SYNC: { dir: 'IN', module: 'GRN', label: 'Goods receipt (GRN) sync' },
    INVOICE_SUBMIT: { dir: 'OUT', module: 'Invoice', label: 'Vendor invoice submission' },
    INVOICE_STATUS: { dir: 'IN', module: 'Invoice', label: 'Invoice status' },
    PAYMENT_SCHEDULE: { dir: 'IN', module: 'Invoice', label: 'Payment schedule' },
    PAYMENT_POSTED: { dir: 'IN', module: 'Invoice', label: 'Payment & deductions' },
    VENDOR_STATUS: { dir: 'OUT', module: 'Governance', label: 'Vendor status change (dormant/closed/blacklist)' },
    VENDOR_PAYTERMS: { dir: 'OUT', module: 'Governance', label: 'MSME payment-terms update' },
    VENDOR_BANK_CHANGE: { dir: 'OUT', module: 'Governance', label: 'Bank / GST / PAN change (CFO-approved)' },
    VENDOR_MASTER_STATUS: { dir: 'IN', module: 'Governance', label: 'Vendor master status & purchasing block' },
    PERF_METRICS: { dir: 'IN', module: 'Performance', label: 'Delivery / quality / commercial metrics' },
    BULK_ADVICE: { dir: 'OUT', module: 'Invoice', label: 'Bulk TDS & payment advice (FTP drop)' },
  };

  const now = () => U.iso(PH.now());
  const sysdb = () => PH.db().erp;

  // ---------- logging ----------
  Sys.log = function (iface, dir, ref, payload, status, response) {
    const db = PH.db();
    const m = { id: PH.nextId('msg'), at: now(), iface, dir, ref: ref || '', status: status || 'ok', response: response || '', payload: payload || {}, attempts: 1 };
    db.sysLog.push(m);
    if (db.sysLog.length > 1200) db.sysLog.splice(0, 100);
    return m;
  };

  // ---------- outbound events ----------
  Sys.send = function (iface, payload, ref) {
    const db = PH.db();
    PH.assert(Sys.IFACES[iface] && Sys.IFACES[iface].dir === 'OUT', 'Unknown outbound interface ' + iface);
    const m = Sys.log(iface, 'OUT', ref, payload, 'ok', 'Acknowledged');
    Sys._exec(m);
    return m;
  };
  // outbound side-effects
  Sys._exec = function (m) {
    const db = PH.db(), p = m.payload, S = sysdb();
    switch (m.iface) {
      case 'VENDOR_CREATE': {
        const q = Sys._queue('VENDOR_CREATE', p.onbId, p, m.id);
        if (db.cfg.flowMode === 'auto') Sys.createVendor(q.id);
        break;
      }
      case 'PO_REQUEST': {
        const q = Sys._queue('PO_CREATE', p.panNo, p, m.id);
        if (db.cfg.flowMode === 'auto') Sys.createPO(q.id);
        break;
      }
      case 'INVOICE_SUBMIT': {
        const inv = PH.byId('invoices', p.portalRef);
        if (inv) {
          inv.docNo = inv.docNo || '51056' + U.pad(U.hash(inv.id) % 100000, 5);
          Sys._setInvStatus(inv, 'Received');
          Sys._queue('INVOICE_VERIFY', inv.id, { invId: inv.id }, m.id);
          Sys.receive('INVOICE_STATUS', { invoice: inv.id, status: inv.status, docNo: inv.docNo }, inv.id, () => {});
          if (db.cfg.flowMode === 'auto') Sys.autoVerify(inv.id);
        }
        break;
      }
      case 'VENDOR_STATUS': {
        const sv = S.vendors.find((v) => v.code === p.vendorCode);
        if (sv) sv.status = { active: 'Active', dormant: 'Dormant', closed: 'Closed', blacklisted: 'Blocked (blacklisted)', blocked: 'Blocked' }[p.status] || p.status;
        break;
      }
      case 'VENDOR_PAYTERMS': {
        const sv = S.vendors.find((v) => v.code === p.vendorCode);
        if (sv) { sv.payTerms = p.paymentTerms; sv.msme = p.msme; }
        break;
      }
      case 'VENDOR_BANK_CHANGE': {
        const sv = S.vendors.find((v) => v.code === p.vendorCode);
        if (sv) { if (p.pan) sv.pan = p.pan; if (p.gst) sv.gst = p.gst; sv.bankChangedAt = now(); }
        break;
      }
      default: break; // acknowledged only (INSPECTION_STATUS, BULK_ADVICE)
    }
  };
  Sys._queue = function (type, ref, payload, msgId) {
    const S = sysdb();
    const q = { id: 'SQ-' + U.pad(S.queue.length + 1, 4), type, ref, status: 'open', createdAt: now(), payload, msgId };
    S.queue.push(q); return q;
  };
  Sys.openQueue = (type) => sysdb().queue.filter((q) => q.status === 'open' && (!type || q.type === type));

  // ---------- inbound events ----------
  Sys.receive = function (iface, payload, ref, apply) {
    PH.assert(Sys.IFACES[iface] && Sys.IFACES[iface].dir === 'IN', 'Unknown inbound interface ' + iface);
    const m = Sys.log(iface, 'IN', ref, payload, 'ok', 'Applied in portal');
    if (apply) PH.system(apply);
    return m;
  };

  // ---------- lookups used by portal screens ----------
  Sys.lookupVendor = function ({ pan, gst, name }) {
    const S = sysdb();
    const nm = String(name || '').trim().toLowerCase();
    const hit = S.vendors.find((v) => (pan && v.pan === pan) || (gst && v.gst === gst) || (nm && v.name.toLowerCase() === nm));
    Sys.log('VENDOR_DUP_CHECK', 'IN', pan || gst || name, { pan, gst, name }, 'ok', hit ? 'Match found: ' + hit.code + ' (' + hit.status + ')' : 'No match – safe to onboard');
    return hit || null;
  };
  Sys.openPRs = () => sysdb().prs.filter((p) => p.status === 'Released');
  Sys.getPR = function (prNo) {
    const pr = sysdb().prs.find((p) => p.no === prNo);
    Sys.log('PR_FETCH', 'IN', prNo, { prNo }, pr ? 'ok' : 'error', pr ? 'PR ' + prNo + ' with ' + pr.items.length + ' item(s), WBS ' + pr.wbs : 'PR not found / not released');
    return pr || null;
  };
  Sys.budget = (wbs) => sysdb().budgets[wbs] || null;

  // ---------- vendor creation ----------
  Sys.createVendor = function (qid) {
    const S = sysdb(); const q = S.queue.find((x) => x.id === qid);
    PH.assert(q && q.type === 'VENDOR_CREATE' && q.status === 'open', 'Request is not open.');
    const p = q.payload;
    const dup = S.vendors.find((v) => v.pan === p.pan && v.status.startsWith('Active'));
    PH.assert(!dup, 'Rejected: an active vendor with PAN ' + p.pan + ' already exists (' + dup?.code + ').');
    const code = PH.nextId('vendor');
    S.vendors.push({ code, name: p.name, pan: p.pan, gst: p.gst, status: 'Active', payTerms: p.msme ? 'PT30' : 'PT60', msme: !!p.msme, created: now(), cats: p.cats });
    q.status = 'done'; q.doneAt = now(); q.result = code;
    Sys.receive('VENDOR_CODE', { onbId: p.onbId, vendorCode: code }, p.onbId, () => PH.S.Onb.vendorCreated(p.onbId, code));
    return code;
  };

  // ---------- PO issue from an approved PAN ----------
  Sys.createPO = function (qid) {
    const db = PH.db(); const S = sysdb(); const q = S.queue.find((x) => x.id === qid);
    PH.assert(q && q.type === 'PO_CREATE' && q.status === 'open', 'Request is not open.');
    const pan = PH.byId('pans', q.payload.panId); PH.assert(pan && pan.status === 'approved', 'PAN is not approved – a PO cannot be issued.');
    const rfq = PH.byId('rfqs', pan.rfqId);
    const vid = pan.recommendation.vendorId;
    const quote = db.quotes.find((x) => x.rfqId === rfq.id && x.vendorId === vid);
    const fin = quote.rounds[quote.finalRound];
    const v = PH.vendor(vid);
    const po = {
      id: PH.nextId('po'), rfqId: rfq.id, panId: pan.id, vendorId: vid, type: rfq.poType || 'PO1', date: now(), currency: fin.header.currency || 'INR',
      bu: rfq.bu, wbs: rfq.wbs, project: rfq.project, commodity: rfq.commodity, buyer: rfq.buyer,
      lines: rfq.items.map((it, i) => {
        const l = fin.lines.find((x) => x.no === it.no) || fin.lines[i];
        return { no: it.no, code: it.code, desc: it.desc, hsn: it.hsn, qty: it.qty, uom: it.uom, rate: l.rate, value: U.round(l.rate * it.qty, 2), deliveryDate: l.deliveryDate, readyQty: 0, approvedQty: 0, dispatchedQty: 0, receivedQty: 0, rejectedQty: 0, physicalQty: 0 };
      }),
      paymentTerms: fin.header.paymentTerms, advancePct: fin.header.advancePct || 0, taxId: fin.header.taxId, incoterm: fin.header.incoterm, location: rfq.plant || 'Main Plant, Pune',
      tnc: 'Standard Terms & Conditions of Purchase – Rev 07; Quality clause QC-12; Warranty 12 months from commissioning.',
      docs: [{ name: 'Purchase Order document.pdf' }, { name: 'Terms & Conditions.pdf' }, { name: 'Technical attachments.zip' }],
      rev: 0, revisions: [{ rev: 0, date: now(), remarks: 'Original PO released' }], status: 'released', acceptedAt: null, acceptedRev: null, acceptedBy: null, clarifications: [], pendingRevision: null,
      sysRef: { po: null, createdAt: now(), pan: pan.no, msgId: q.msgId },
    };
    po.sysRef.po = po.id;
    db.pos.push(po); pan.poNo = po.id; q.status = 'done'; q.doneAt = now(); q.result = po.id;
    Sys.receive('PO_SYNC', { po: po.id, vendorCode: v.code, value: PH.S.Po.value(po).taxable, lines: po.lines.length }, po.id, () => {
      PH.audit('po', po.id, 'issued', 'PO issued from ' + pan.no);
      PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: { vendorId: vid }, title: 'New Purchase Order ' + po.id, body: 'A new PO has been released to you. Please review and accept.', link: '#/po/' + po.id });
      PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: { roles: ['buyer'] }, title: 'PO ' + po.id + ' issued', body: 'PO created from ' + pan.no + '. Awaiting vendor acceptance.', link: '#/po/' + po.id });
    });
    return po;
  };

  // ---------- PO revision (needs internal approval before release) ----------
  Sys.revisePO = function (poId, { changes, remarks }) {
    const po = PH.byId('pos', poId); PH.assert(po, 'PO not found');
    PH.assert(!po.pendingRevision, 'A revision is already awaiting approval for this PO.');
    PH.assert(remarks && remarks.trim(), 'Revision remarks are mandatory.');
    PH.assert(changes && changes.length, 'Provide at least one change (quantity, rate or delivery date).');
    changes.forEach((c) => { const l = po.lines.find((x) => x.no === c.lineNo); PH.assert(l, 'Unknown PO line ' + c.lineNo); if (c.qty != null) PH.assert(c.qty >= l.dispatchedQty && c.qty > 0, 'Revised quantity cannot be below already dispatched quantity (' + l.dispatchedQty + ').'); if (c.rate != null) PH.assert(c.rate > 0, 'Rate must be positive.'); });
    const newPo = U.clone(po); changes.forEach((c) => { const l = newPo.lines.find((x) => x.no === c.lineNo); if (c.qty != null) l.qty = c.qty; if (c.rate != null) l.rate = c.rate; if (c.deliveryDate) l.deliveryDate = c.deliveryDate; l.value = U.round(l.qty * l.rate, 2); });
    const val = PH.S.Po.value(newPo).taxable;
    const chain = PH.S.Matrix.route({ value: val, bu: po.bu, paymentTerms: po.paymentTerms, advancePct: po.advancePct });
    po.pendingRevision = { rev: po.rev + 1, changes, remarks, createdAt: now(), value: val, chain };
    po.status = 'revision_pending';
    Sys.receive('PO_REVISION', { po: po.id, rev: po.rev + 1, remarks, changes }, po.id, () => {
      PH.audit('po', po.id, 'revision-created', 'Revision ' + (po.rev + 1) + ' created – routed for internal approval');
      PH.Notify.push({ type: 'pending_approval', ref: po.id, to: { roles: ['approver'] }, title: 'PO revision ' + (po.rev + 1) + ' awaits approval', body: 'PO ' + po.id + ' amendment needs approval before release to vendor.', link: '#/approvals' });
    });
    return po;
  };

  // ---------- goods receipt ----------
  Sys.dispatchedOn = (poId, lineNo) => U.sum(PH.db().dispatches.filter((d) => d.poId === poId), (d) => U.sum(d.lines.filter((l) => l.lineNo === lineNo), (l) => l.qty));
  Sys.postGRN = function ({ poId, location, lines, remarks }) {
    const db = PH.db(); const po = PH.byId('pos', poId);
    PH.assert(po, 'PO not found.');
    PH.assert(po.status === 'accepted', 'Goods receipt is only possible against an accepted PO.');
    const out = []; let any = false;
    lines.forEach((r) => {
      const l = po.lines.find((x) => x.no === r.lineNo); PH.assert(l, 'Unknown PO line ' + r.lineNo);
      const physical = U.num(r.physical), rej = U.num(r.rejected), dmg = U.num(r.damaged);
      PH.assert(physical >= 0 && rej >= 0 && dmg >= 0, 'Quantities cannot be negative (line ' + l.no + ').');
      PH.assert(rej + dmg <= physical, 'Rejected + damaged cannot exceed physically received quantity (line ' + l.no + ').');
      const pending = Sys.dispatchedOn(po.id, l.no) - l.physicalQty;
      if (physical === 0 && !r.closeShort) return;
      PH.assert(pending > 0 || physical === 0, 'Nothing is pending receipt for line ' + l.no + ' – vendor has not dispatched further quantity.');
      const short = Math.max(0, pending - physical), excess = Math.max(0, physical - pending);
      any = true;
      out.push({ lineNo: l.no, code: l.code, desc: l.desc, uom: l.uom, ordered: l.qty, dispatched: pending, received: physical - rej - dmg, physical, short: r.closeShort || physical > 0 ? short : 0, excess, rejected: rej, damaged: dmg, remarks: r.remarks || '' });
    });
    PH.assert(any, 'Enter received quantity for at least one line.');
    const grn = { id: PH.nextId('grn'), poId: po.id, vendorId: po.vendorId, date: now(), location: location || po.location, refNo: 'RR-' + U.pad(db.grns.length + 1, 5), lines: out, remarks: remarks || '', status: '' };
    out.forEach((o) => { const l = po.lines.find((x) => x.no === o.lineNo); l.physicalQty += o.physical; l.receivedQty += o.received; l.rejectedQty += o.rejected + o.damaged; });
    const exc = out.some((o) => o.short || o.excess || o.rejected || o.damaged);
    const complete = po.lines.every((l) => l.physicalQty >= l.qty && true);
    grn.status = exc ? 'Received with exceptions' : complete ? 'Complete' : 'Partial';
    db.grns.push(grn);
    // mark dispatches received (FIFO coverage)
    po.lines.forEach((l) => { l._cov = l.physicalQty; });
    db.dispatches.filter((d) => d.poId === po.id).sort((a, b) => (a.date < b.date ? -1 : 1)).forEach((d) => {
      const ok = d.lines.every((dl) => { const l = po.lines.find((x) => x.no === dl.lineNo); if (l._cov >= dl.qty) { l._cov -= dl.qty; return true; } return false; });
      d.status = ok ? 'Received' : d.status;
    });
    po.lines.forEach((l) => { delete l._cov; });
    Sys.receive('GRN_SYNC', { grn: grn.id, po: po.id, status: grn.status, lines: out.length }, grn.id, () => {
      PH.audit('grn', grn.id, 'recorded', 'GRN ' + grn.id + ' recorded against PO ' + po.id + ' (' + grn.status + ')');
      PH.Notify.push({ type: 'grn_received', ref: po.id, to: { vendorId: po.vendorId }, title: 'GRN ' + grn.id + ' posted', body: 'Goods receipt posted for PO ' + po.id + ' – status: ' + grn.status, link: '#/grn/' + grn.id });
      if (out.some((o) => o.short)) { PH.Notify.push({ type: 'short_qty', ref: po.id, to: { vendorId: po.vendorId, roles: ['buyer'] }, title: 'Short quantity received – PO ' + po.id, body: 'Short: ' + out.filter((o) => o.short).map((o) => 'line ' + o.lineNo + ' (' + o.short + ' ' + o.uom + ')').join(', '), link: '#/grn/' + grn.id }); PH.S.Perf.event(po.vendorId, 'delivery', -3); }
      if (out.some((o) => o.rejected || o.damaged)) { PH.Notify.push({ type: 'material_rejection', ref: po.id, to: { vendorId: po.vendorId, roles: ['buyer', 'quality'] }, title: 'Material rejected at receipt – PO ' + po.id, body: 'Rejected/damaged quantities were recorded in GRN ' + grn.id, link: '#/grn/' + grn.id }); PH.S.Perf.event(po.vendorId, 'quality', -4); }
      if (!exc) PH.S.Perf.event(po.vendorId, 'delivery', 2);
    });
    // GR-based IV: release invoices parked for the GRN (auto mode)
    if (db.cfg.flowMode === 'auto') db.invoices.filter((i) => i.poId === po.id && i.status.startsWith('Parked')).forEach((i) => Sys.autoVerify(i.id));
    return grn;
  };

  // ---------- invoice verification + payment ----------
  Sys._setInvStatus = function (inv, status, note) {
    inv.status = status; inv.statusHistory = inv.statusHistory || [];
    inv.statusHistory.push({ at: now(), status, note: note || '' });
  };
  Sys.matchInvoice = function (inv) {
    const db = PH.db(); const po = PH.byId('pos', inv.poId);
    const grnValue = U.sum(po.lines, (l) => l.receivedQty * l.rate);
    const posted = U.sum(db.invoices.filter((i) => i.poId === inv.poId && i.id !== inv.id && ['Approved', 'Payment scheduled', 'Paid'].includes(i.status)), (i) => i.taxable);
    let result = 'matched';
    if (grnValue <= 0) result = 'no_grn'; else if (posted + inv.taxable > grnValue + 0.01) result = 'grn_short';
    return { result, grnValue: U.round(grnValue, 2), alreadyPosted: U.round(posted, 2), invoiceTaxable: inv.taxable, poValue: PH.S.Po.value(po).taxable };
  };
  Sys.autoVerify = function (invId) {
    const inv = PH.byId('invoices', invId); if (!inv || !['Received', 'Parked (GRN awaited)'].includes(inv.status)) return;
    const m = Sys.matchInvoice(inv); inv.match = m;
    if (m.result === 'matched') Sys.verifyInvoice(invId, 'post');
    else { Sys._setInvStatus(inv, 'Parked (GRN awaited)', 'GR-based invoice verification: ' + (m.result === 'no_grn' ? 'no GRN yet' : 'GRN value lower than invoice')); Sys.receive('INVOICE_STATUS', { invoice: inv.id, status: inv.status }, inv.id, () => {}); }
  };
  Sys.verifyInvoice = function (invId, decision, opts) {
    opts = opts || {}; const db = PH.db(); const inv = PH.byId('invoices', invId); PH.assert(inv, 'Invoice not found');
    PH.assert(['Received', 'Parked (GRN awaited)', 'Blocked'].includes(inv.status) || inv.status.startsWith('Blocked'), 'Invoice is not awaiting verification (status: ' + inv.status + ').');
    const po = PH.byId('pos', inv.poId); const v = PH.vendor(inv.vendorId);
    const m = Sys.matchInvoice(inv); inv.match = m;
    if (decision === 'reject') {
      PH.assert(opts.reason && opts.reason.trim(), 'A rejection reason is required.');
      Sys._setInvStatus(inv, 'Rejected', opts.reason); inv.rejectReason = opts.reason;
      Sys.receive('INVOICE_STATUS', { invoice: inv.id, status: 'Rejected', reason: opts.reason }, inv.id, () => PH.Notify.push({ type: 'invoice_received', ref: inv.number, to: { vendorId: inv.vendorId, roles: ['buyer'] }, title: 'Invoice ' + inv.number + ' rejected', body: opts.reason, link: '#/invoices/' + inv.id }));
      return inv;
    }
    if (decision === 'block') {
      Sys._setInvStatus(inv, 'Blocked', opts.reason || 'Blocked for payment'); inv.blockReason = opts.reason || 'Blocked for payment';
      Sys.receive('INVOICE_STATUS', { invoice: inv.id, status: 'Blocked' }, inv.id, () => {});
      return inv;
    }
    PH.assert(decision === 'post', 'Unknown decision');
    if (m.result !== 'matched') PH.assert(opts.override, m.result === 'no_grn' ? 'Three-way match failed: no GRN posted yet. Post the GRN first or use supervisor override.' : 'Three-way match failed: GRN value is lower than invoice value. Post the GRN or use supervisor override.');
    Sys._setInvStatus(inv, 'Approved', 'Invoice verified and posted');
    // payment schedule: PO terms vs vendor-master terms (MSME → 30d, non-MSME → 60d); MSME takes the shorter, others the longer
    const pt = PH.cfg().paymentTerms; const poDays = (pt.find((x) => x.id === po.paymentTerms) || { days: 30 }).days;
    const sv = sysdb().vendors.find((x) => x.code === v.code); const vmDays = (pt.find((x) => x.id === (sv ? sv.payTerms : 'PT30')) || { days: 30 }).days;
    const days = v.msme && v.msme.is ? Math.min(poDays, vmDays) : Math.max(poDays, vmDays);
    const grns = db.grns.filter((x) => x.poId === po.id).map((x) => x.date).sort(); const baseDate = [inv.date, grns[grns.length - 1]].filter(Boolean).sort().pop();
    const due = U.addDays(baseDate, days);
    inv.schedule = { terms: days + ' days' + (v.msme && v.msme.is ? ' (MSME)' : ''), days, baseDate, dueDate: U.iso(due), scheduledDate: U.iso(due), payable: inv.total };
    Sys._setInvStatus(inv, 'Payment scheduled', 'Due ' + U.d(due));
    Sys.receive('PAYMENT_SCHEDULE', { invoice: inv.id, dueDate: inv.schedule.dueDate, days }, inv.id, () => {
      PH.Notify.push({ type: 'payment_scheduled', ref: inv.number, to: { vendorId: inv.vendorId }, title: 'Payment scheduled for ' + inv.number, body: 'Amount ' + U.inr(inv.total) + ' is scheduled for ' + U.d(due) + '.', link: '#/invoices/' + inv.id });
    });
    return inv;
  };
  Sys.runPayment = function (invId, { deductions } = {}) {
    const db = PH.db(); const inv = PH.byId('invoices', invId); PH.assert(inv, 'Invoice not found');
    PH.assert(inv.status === 'Payment scheduled', 'Only scheduled invoices can be paid (status: ' + inv.status + ').');
    const ded = [{ type: 'TDS @0.1% (u/s 194Q)', amount: U.round(inv.taxable * 0.001, 2), reason: 'Tax deducted at source' }];
    (deductions || []).forEach((d) => { PH.assert(U.num(d.amount) >= 0 && d.type, 'Deduction needs a type and a non-negative amount.'); if (U.num(d.amount) > 0) ded.push({ type: d.type, amount: U.round(U.num(d.amount), 2), reason: d.reason || '' }); });
    const totalDed = U.sum(ded, (d) => d.amount);
    PH.assert(totalDed <= inv.total, 'Deductions exceed the invoice amount.');
    const pay = { id: PH.nextId('pay'), invoiceId: inv.id, poId: inv.poId, vendorId: inv.vendorId, invoiceNo: inv.number, date: now(), gross: inv.total, deductions: ded, net: U.round(inv.total - totalDed, 2), currency: inv.currency, status: 'Paid', utr: 'UTR' + (2026000000 + U.hash(inv.id + now()) % 999999) };
    db.payments.push(pay); inv.paymentId = pay.id; Sys._setInvStatus(inv, 'Paid', 'Payment ' + pay.id + ' released');
    Sys.receive('PAYMENT_POSTED', { payment: pay.id, invoice: inv.id, net: pay.net }, pay.id, () => {
      PH.Notify.push({ type: 'payment_scheduled', ref: inv.number, to: { vendorId: inv.vendorId }, title: 'Payment released – ' + inv.number, body: 'Net ' + U.inr(pay.net) + ' paid (ref ' + pay.id + '). Deductions: ' + U.inr(totalDed) + '.', link: '#/payments/' + pay.id });
    });
    return pay;
  };
  Sys.payAllDue = function () {
    const db = PH.db(); const t = PH.now(); let n = 0;
    db.invoices.filter((i) => i.status === 'Payment scheduled' && U.toDate(i.schedule.scheduledDate) <= t).forEach((i) => { Sys.runPayment(i.id); n++; });
    return n;
  };

  })(typeof window !== 'undefined' ? window : globalThis);
