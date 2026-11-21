/* Source2Pay – Execution: PO collaboration & revision, dispatch readiness / quality clearance, invoice submission */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  PH.S = PH.S || {};
  const S = PH.S;
  const now = () => U.iso(PH.now());

  // ================= Purchase Order =================
  const Po = (S.Po = {});
  const poOf = (id) => { const p = PH.byId('pos', id); PH.assert(p, 'PO ' + id + ' not found.', 'NOT_FOUND'); return p; };
  const plog = (p, t) => PH.audit('po', p.id, 'update', t);
  Po.get = poOf;
  Po.value = (po) => {
    const taxable = U.round(U.sum(po.lines, (l) => l.value), 2); const rate = (PH.cfg().taxStructures.find((t) => t.id === po.taxId) || { rate: 18 }).rate;
    const tax = U.round((taxable * rate) / 100, 2); return { taxable, tax, gross: U.round(taxable + tax, 2), rate };
  };
  Po.visibleTo = (user) => { const l = PH.db().pos; return user.role === 'vendor' ? l.filter((p) => p.vendorId === user.vendorId) : l; };
  const own = (po) => { const me = PH.requireRole('vendor'); PH.assert(po.vendorId === me.vendorId, 'Only the awarded vendor can access this PO.', 'FORBIDDEN'); return me; };
  Po.openItems = (po) => po.clarifications.filter((c) => c.status === 'open');

  Po.accept = function (poId) {
    const po = poOf(poId); const me = own(po);
    PH.assert(po.status === 'released', po.status === 'accepted' ? 'This PO revision is already accepted.' : po.status === 'revision_pending' ? 'A revision is awaiting internal approval – wait for the revised PO.' : 'PO cannot be accepted in status ' + po.status + '.');
    PH.assert(!po.clarifications.some((c) => c.status === 'open' && c.type === 'change'), 'A change request is still open – wait for resolution before accepting.');
    po.status = 'accepted'; po.acceptedAt = now(); po.acceptedRev = po.rev; po.acceptedBy = me.name; plog(po, 'Accepted revision ' + po.rev); PH.vendor(po.vendorId).lastActivityAt = now();
    PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: { roles: ['buyer', 'quality'] }, title: 'PO ' + po.id + ' accepted by ' + PH.vendor(po.vendorId).name, body: 'Accepted on ' + U.dt(po.acceptedAt) + ' (revision ' + po.rev + '). Ready for execution.', link: '#/po/' + po.id });
    return po;
  };
  Po.raise = function (poId, { type, subject, text }) {
    const po = poOf(poId); const me = own(po);
    PH.assert(['clarification', 'change', 'tnc'].includes(type), 'Choose a request type.'); PH.assert(subject && subject.trim().length >= 3, 'Subject is required.'); PH.assert(text && text.trim().length >= 5, 'Describe your request.');
    PH.assert(po.status !== 'revision_pending', 'A revision is already being processed.'); if (po.status === 'accepted') PH.assert(type === 'clarification', 'This PO is accepted – change requests are not possible. Raise a support ticket for the buyer.');
    const c = { id: 'CL-' + (po.clarifications.length + 1), type, subject: subject.trim(), status: 'open', createdAt: now(), messages: [{ by: me.name, role: 'vendor', at: now(), text: text.trim() }] };
    po.clarifications.push(c); plog(po, 'Vendor raised ' + type + ': ' + subject);
    PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: { roles: ['buyer'] }, title: 'Vendor ' + (type === 'change' ? 'change request' : type === 'tnc' ? 'T&C query' : 'clarification') + ' on PO ' + po.id, body: subject, link: '#/po/' + po.id });
    return c;
  };
  Po.reply = function (poId, clarId, text) {
    const po = poOf(poId); const me = PH.actor(); const c = po.clarifications.find((x) => x.id === clarId); PH.assert(c, 'Thread not found.');
    PH.assert(me.role === 'buyer' || me.role === 'vendor', 'Only the buyer and the vendor take part in this discussion.', 'FORBIDDEN'); if (me.role === 'vendor') own(po);
    PH.assert(c.status === 'open', 'This thread is resolved. Raise a new request.'); PH.assert(text && text.trim(), 'Write a message.');
    c.messages.push({ by: me.name, role: me.role, at: now(), text: text.trim() }); plog(po, 'Reply on ' + clarId);
    PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: me.role === 'vendor' ? { roles: ['buyer'] } : { vendorId: po.vendorId }, title: 'New reply on PO ' + po.id, body: text.slice(0, 120), link: '#/po/' + po.id }); return c;
  };
  Po.resolve = function (poId, clarId, resolution) {
    PH.requireRole('buyer'); const po = poOf(poId); const c = po.clarifications.find((x) => x.id === clarId); PH.assert(c && c.status === 'open', 'Thread is not open.'); PH.assert(resolution && resolution.trim().length >= 3, 'Add a resolution note.');
    c.status = 'resolved'; c.resolution = resolution.trim(); c.resolvedAt = now(); c.messages.push({ by: PH.actor().name, role: 'buyer', at: now(), text: 'Resolved: ' + resolution.trim() }); return c;
  };
  Po.approveRevision = function (poId, decision, remarks) {
    PH.requireRole('approver'); const po = poOf(poId); const r = po.pendingRevision; PH.assert(r, 'No revision awaiting approval.');
    PH.assert(['approve', 'reject'].includes(decision), 'Invalid decision'); if (decision === 'reject') PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are mandatory to reject.');
    const cur = S.Matrix.current(r.chain); Object.assign(cur, { status: decision === 'approve' ? 'approved' : 'rejected', by: cur.name, at: now(), remarks: remarks || '' }); plog(po, 'Revision ' + r.rev + ' – ' + cur.role + ': ' + decision);
    if (decision === 'reject') { po.pendingRevision = null; po.status = po.acceptedRev === po.rev ? 'accepted' : 'released'; return po; }
    if (S.Matrix.current(r.chain)) return po;
    r.changes.forEach((c) => { const l = po.lines.find((x) => x.no === c.lineNo); if (c.qty != null) l.qty = c.qty; if (c.rate != null) l.rate = c.rate; if (c.deliveryDate) l.deliveryDate = c.deliveryDate; l.value = U.round(l.qty * l.rate, 2); });
    po.rev = r.rev; po.revisions.push({ rev: r.rev, date: now(), remarks: r.remarks, changes: r.changes, value: r.value }); po.pendingRevision = null; po.status = 'released'; po.acceptedAt = null; po.acceptedRev = null; po.acceptedBy = null;
    plog(po, 'Revision ' + po.rev + ' released to vendor through the portal – acceptance reset');
    PH.Notify.push({ type: 'pending_po_acceptance', ref: po.id, to: { vendorId: po.vendorId }, title: 'Revised PO ' + po.id + ' (rev ' + po.rev + ') released', body: r.remarks + ' Please review and accept the latest version.', link: '#/po/' + po.id });
    return po;
  };
  // vendors may only download the latest released version
  Po.download = function (poId) {
    const po = poOf(poId); const me = PH.actor(); if (me.role === 'vendor') own(po);
    const v = PH.vendor(po.vendorId); const val = Po.value(po); PH.audit('po', po.id, 'download', 'Revision ' + po.rev);
    return ['PURCHASE ORDER ' + po.id + '   Rev ' + po.rev, PH.cfg().company.name, '', 'Vendor: ' + v.name + ' (' + v.code + ')', 'Date: ' + U.d(po.date), 'Project: ' + po.project + ' / WBS ' + po.wbs, 'Payment: ' + PH.label(PH.cfg().paymentTerms, po.paymentTerms) + '   Incoterm: ' + po.incoterm, '', 'LINES']
      .concat(po.lines.map((l) => ' ' + l.no + '  ' + l.code + '  ' + l.desc + '  ' + l.qty + ' ' + l.uom + ' x ' + U.inr(l.rate, 2) + ' = ' + U.inr(l.value, 2) + '  (deliver ' + U.d(l.deliveryDate) + ')'))
      .concat(['', 'Taxable: ' + U.inr(val.taxable, 2), 'Tax (' + val.rate + '%): ' + U.inr(val.tax, 2), 'Total: ' + U.inr(val.gross, 2), '', po.tnc]).join('\n');
  };

  // ================= Dispatch readiness, quality clearance =================
  const Qa = (S.Qa = {});
  const irOf = (id) => { const x = PH.byId('inspections', id); PH.assert(x, 'Inspection request ' + id + ' not found.', 'NOT_FOUND'); return x; };
  Qa.get = irOf;
  Qa.requiredDocs = (po) => { const q = PH.cfg().qapDocs; return q[po.commodity] || q.default; };
  Qa.markReady = function (poId, { lineNo, qty, readyDate, remarks }) {
    const po = poOf(poId); const me = own(po); PH.assert(po.status === 'accepted', 'Only an accepted PO can be marked ready.');
    const l = po.lines.find((x) => x.no === lineNo); PH.assert(l, 'PO line not found.'); const q = U.num(qty);
    PH.assert(q > 0, 'Quantity ready must be greater than zero.'); PH.assert(q <= l.qty - l.readyQty, 'Quantity exceeds the balance still to be offered (' + (l.qty - l.readyQty) + ' ' + l.uom + ').');
    PH.assert(readyDate, 'Readiness date is required.');
    const r = { id: PH.nextId('rdy'), poId, lineNo, qty: q, readyDate, remarks: remarks || '', by: me.name, at: now() }; PH.db().readiness.push(r); l.readyQty += q; plog(po, 'Line ' + lineNo + ': ' + q + ' ' + l.uom + ' ready'); return r;
  };
  Qa.requestInspection = function (poId, f) {
    const po = poOf(poId); const me = own(po); PH.assert(po.status === 'accepted', 'Inspection requests are allowed only for an accepted PO.');
    const e = {}; if (!f.requestedDate) e.requestedDate = 'Requested inspection date is required.'; if (!f.contactName) e.contactName = 'Contact person is required.'; if (!U.isMobile(f.contactPhone)) e.contactPhone = 'Enter a valid 10-digit mobile number.';
    const lines = (f.lines || []).filter((x) => U.num(x.qty) > 0); if (!lines.length) e.lines = 'Add at least one line with quantity.';
    lines.forEach((x) => { const l = po.lines.find((y) => y.no === x.lineNo); if (!l) { e.lines = 'Unknown line.'; return; } const avail = l.readyQty - (l.inspQty || 0); if (U.num(x.qty) > avail) e['qty.' + x.lineNo] = 'Only ' + avail + ' ' + l.uom + ' declared ready and not yet submitted for inspection.'; });
    const need = Qa.requiredDocs(po); const have = f.docs || {}; need.forEach((d) => { if (!have[d]) e['doc.' + d] = d + ' must be uploaded (QAP / quality documents).'; });
    if (Object.keys(e).length) PH.fail('Inspection request has issues.', 'VALIDATION', e);
    const ir = { id: PH.nextId('insp'), poId, vendorId: po.vendorId, lines: lines.map((x) => ({ lineNo: x.lineNo, qty: U.num(x.qty), approved: 0 })), requestedDate: f.requestedDate, contactName: f.contactName, contactPhone: f.contactPhone, remarks: f.remarks || '', docs: have, status: 'requested', createdAt: now(), createdBy: me.name, cycles: [{ n: 1, kind: 'initial', at: now(), lines: lines.map((x) => ({ lineNo: x.lineNo, qty: U.num(x.qty) })), result: null }], sysRef: null };
    lines.forEach((x) => { const l = po.lines.find((y) => y.no === x.lineNo); l.inspQty = (l.inspQty || 0) + U.num(x.qty); });
    PH.db().inspections.push(ir); plog(po, 'Inspection request ' + ir.id);
    PH.Notify.push({ type: 'quality_inspection', ref: ir.id, to: { roles: ['quality'] }, title: 'Inspection requested: ' + ir.id + ' (PO ' + po.id + ')', body: 'Vendor ' + PH.vendor(po.vendorId).name + ' requested inspection on ' + U.d(f.requestedDate) + '. QAP documents attached.', link: '#/quality/' + ir.id });
    return ir;
  };
  Qa.outstanding = (ir) => ir.lines.map((l) => ({ lineNo: l.lineNo, qty: l.qty - l.approved }));
  Qa.inspect = function (irId, f) {
    PH.requireRole('quality'); const ir = irOf(irId); const po = poOf(ir.poId);
    PH.assert(['requested', 'reinspect'].includes(ir.status), 'This request is not awaiting inspection (status: ' + ir.status + ').');
    const cyc = ir.cycles[ir.cycles.length - 1]; const e = {};
    PH.cfg().inspectionChecklist.forEach((c) => { const x = (f.checklist || []).find((y) => y.id === c.id); if (!x || !x.result) e['chk.' + c.id] = 'Select a result.'; else if (x.result === 'fail' && !(x.remarks && x.remarks.trim())) e['chk.' + c.id] = 'Remarks needed for a failed check.'; });
    if (!['approved', 'partial', 'rejected'].includes(f.outcome)) e.outcome = 'Select the inspection outcome.';
    if (Object.keys(e).length) PH.fail('Inspection record is incomplete.', 'VALIDATION', e);
    const reqTotal = U.sum(cyc.lines, (l) => l.qty); const appr = cyc.lines.map((l) => { const a = (f.lines || []).find((x) => x.lineNo === l.lineNo); return { lineNo: l.lineNo, qty: l.qty, approved: f.outcome === 'approved' ? l.qty : f.outcome === 'rejected' ? 0 : U.num(a && a.approved) }; });
    appr.forEach((a) => PH.assert(a.approved >= 0 && a.approved <= a.qty, 'Approved quantity for line ' + a.lineNo + ' must be between 0 and ' + a.qty + '.'));
    const apprTotal = U.sum(appr, (a) => a.approved);
    if (f.outcome === 'partial') PH.assert(apprTotal > 0 && apprTotal < reqTotal, 'Partial approval needs an approved quantity between zero and the requested quantity.');
    const fails = (f.checklist || []).filter((x) => x.result === 'fail').length;
    if (f.outcome === 'approved') PH.assert(!fails, 'Cannot approve while a checklist item has failed – choose partial or rejected.');
    if (f.outcome !== 'approved') PH.assert(f.remarks && f.remarks.trim().length >= 5, 'Remarks are mandatory for partial approval or rejection.');
    Object.assign(cyc, { result: f.outcome, inspector: PH.actor().name, at: now(), checklist: f.checklist, approvedLines: appr, remarks: f.remarks || '' });
    appr.forEach((a) => { const l = ir.lines.find((x) => x.lineNo === a.lineNo); l.approved += a.approved; const pl = po.lines.find((x) => x.no === a.lineNo); pl.approvedQty += a.approved; pl.inspQty -= (a.qty - a.approved); });
    const out = U.sum(Qa.outstanding(ir), (x) => x.qty);
    ir.status = out === 0 ? 'approved' : 'rework'; ir.lastResult = f.outcome;
    const msg = PH.Sys.send('INSPECTION_STATUS', { inspectionRef: ir.id, poNumber: po.id, status: ir.status === 'approved' ? 'Approved' : f.outcome === 'partial' ? 'Partially approved' : 'Rejected', approvalDate: now() }, ir.id); ir.sysRef = msg.id;
    PH.audit('inspection', ir.id, 'inspected', f.outcome + ' (cycle ' + cyc.n + ')');
    S.Perf.event(po.vendorId, 'quality', f.outcome === 'approved' ? 2 : f.outcome === 'partial' ? -2 : -5);
    PH.Notify.push({ type: f.outcome === 'rejected' ? 'material_rejection' : 'quality_inspection', ref: ir.id, to: { vendorId: po.vendorId }, title: 'Inspection ' + ir.id + ': ' + (f.outcome === 'approved' ? 'approved' : f.outcome === 'partial' ? 'partially approved' : 'rejected'), body: f.remarks || 'Material approved for dispatch.', link: '#/quality/' + ir.id });
    return ir;
  };
  Qa.resubmit = function (irId, { evidence, remarks, requestedDate }) {
    const ir = irOf(irId); const po = poOf(ir.poId); own(po); PH.assert(ir.status === 'rework', 'Re-inspection can be requested only after a rejection / partial approval.');
    PH.assert(evidence && evidence.length > 0, 'Attach evidence of the corrective action / rework.'); PH.assert(remarks && remarks.trim().length >= 5, 'Describe the corrective action taken.');
    const out = Qa.outstanding(ir).filter((x) => x.qty > 0); ir.cycles.push({ n: ir.cycles.length + 1, kind: 'rework', at: now(), lines: out, evidence, reworkRemarks: remarks.trim(), requestedDate: requestedDate || null, result: null });
    out.forEach((x) => { const pl = po.lines.find((y) => y.no === x.lineNo); pl.inspQty = (pl.inspQty || 0) + x.qty; });
    ir.status = 'reinspect'; PH.audit('inspection', ir.id, 'resubmitted', 'Cycle ' + ir.cycles.length);
    PH.Notify.push({ type: 'quality_inspection', ref: ir.id, to: { roles: ['quality'] }, title: 'Re-inspection requested: ' + ir.id, body: 'Rework evidence uploaded (cycle ' + ir.cycles.length + ').', link: '#/quality/' + ir.id }); return ir;
  };
  Qa.dispatch = function (poId, f) {
    const po = poOf(poId); const me = own(po); PH.assert(po.status === 'accepted', 'Dispatch requires an accepted PO.');
    const e = {}; if (!f.transporter) e.transporter = 'Transporter is required.'; if (!f.lrNo) e.lrNo = 'LR / docket number is required.'; if (!f.date) e.date = 'Dispatch date is required.';
    const lines = (f.lines || []).filter((x) => U.num(x.qty) > 0); if (!lines.length) e.lines = 'Enter a quantity to dispatch.';
    lines.forEach((x) => { const l = po.lines.find((y) => y.no === x.lineNo); const avail = l ? l.approvedQty - l.dispatchedQty : 0; if (U.num(x.qty) > avail) e['qty.' + x.lineNo] = avail <= 0 ? 'No quality-approved quantity available – dispatch is blocked until inspection approval.' : 'Only ' + avail + ' ' + l.uom + ' is approved and undispatched.'; });
    if (Object.keys(e).length) PH.fail('Dispatch cannot be completed.', 'VALIDATION', e);
    const d = { id: PH.nextId('dsp'), poId, irId: f.irId || null, date: U.iso(f.date), lines: lines.map((x) => ({ lineNo: x.lineNo, qty: U.num(x.qty) })), transporter: f.transporter, lrNo: f.lrNo, vehicle: f.vehicle || '', status: 'In transit', by: me.name, at: now() };
    lines.forEach((x) => { const l = po.lines.find((y) => y.no === x.lineNo); l.dispatchedQty += U.num(x.qty); S.Perf.event(po.vendorId, 'delivery', U.toDate(f.date) <= U.addDays(l.deliveryDate, 0) ? 2 : -2); });
    PH.db().dispatches.push(d); PH.audit('dispatch', d.id, 'dispatched', po.id); PH.vendor(po.vendorId).lastActivityAt = now();
    PH.Notify.push({ type: 'delivery_due', ref: po.id, to: { roles: ['buyer', 'quality'] }, title: 'Material dispatched – PO ' + po.id, body: 'LR ' + f.lrNo + ' via ' + f.transporter + '. Goods receipt will follow.', link: '#/po/' + po.id }); return d;
  };
  Qa.counts = () => { const l = PH.db().inspections; return { pending: l.filter((i) => ['requested', 'reinspect'].includes(i.status)).length, approved: l.filter((i) => i.status === 'approved').length, rejected: l.filter((i) => i.cycles.some((c) => c.result === 'rejected' || c.result === 'partial')).length }; };

  // ================= Invoices =================
  const Inv = (S.Inv = {});
  Inv.get = (id) => { const i = PH.byId('invoices', id); PH.assert(i, 'Invoice not found', 'NOT_FOUND'); return i; };
  Inv.submit = function (f) {
    const me = PH.requireRole('vendor'); const db = PH.db(); const po = PH.byId('pos', f.poId);
    PH.assert(po && po.vendorId === me.vendorId, 'Select one of your purchase orders.', 'FORBIDDEN'); PH.assert(po.status === 'accepted', 'Invoices can be raised only against an accepted PO.');
    const e = {}; const num = (f.number || '').trim();
    if (!num) e.number = 'Vendor invoice number is required.'; else if (num.length > 20) e.number = 'Invoice number can be at most 20 characters.';
    else if (db.invoices.some((i) => i.vendorId === me.vendorId && i.number.toLowerCase() === num.toLowerCase() && i.status !== 'Rejected')) e.number = 'Invoice number ' + num + ' was already submitted – duplicate invoices are not allowed.';
    if (!f.date) e.date = 'Invoice date is required.'; else if (U.toDate(f.date) > U.addDays(PH.now(), 1)) e.date = 'Invoice date cannot be in the future.'; else if (U.toDate(f.date) < U.addDays(po.date, -1)) e.date = 'Invoice date cannot precede the PO date.';
    const taxable = U.num(f.taxable); if (!(taxable > 0)) e.taxable = 'Taxable value must be greater than zero.';
    const used = U.sum(db.invoices.filter((i) => i.poId === po.id && i.status !== 'Rejected'), (i) => i.taxable); const pv = Po.value(po).taxable;
    if (taxable > 0 && U.round(used + taxable, 2) > U.round(pv, 2)) e.taxable = 'Invoice value exceeds the PO balance (' + U.inr(pv - used, 2) + ' remaining).';
    if (!f.docs || !f.docs.length) e.docs = 'Attach the invoice document.';
    if (Object.keys(e).length) PH.fail('Invoice could not be submitted.', 'VALIDATION', e);
    const v = PH.vendor(me.vendorId); const val = Po.value(po); const tax = U.round((taxable * val.rate) / 100, 2);
    const inv = { id: PH.nextId('inv'), vendorId: me.vendorId, poId: po.id, number: num, date: U.iso(f.date), taxable: U.round(taxable, 2), taxRate: val.rate, tax, total: U.round(taxable + tax, 2), currency: po.currency, gst: v.gst, docs: f.docs, remarks: f.remarks || '', status: 'Submitted', statusHistory: [{ at: now(), status: 'Submitted', note: 'Submitted via portal by ' + me.name }], submittedAt: now(), submittedBy: me.name, docNo: null, match: null, schedule: null, paymentId: null, grnAtSubmit: db.grns.some((x) => x.poId === po.id) };
    db.invoices.push(inv); PH.audit('invoice', inv.id, 'submitted', num); v.lastActivityAt = now();
    PH.Sys.send('INVOICE_SUBMIT', { portalRef: inv.id, vendorInvoiceNo: num, invoiceDate: inv.date, amount: inv.total, currency: inv.currency, vendorCode: v.code, gst: v.gst, taxableValue: inv.taxable, taxAmount: inv.tax, totalInvoiceAmount: inv.total, docs: inv.docs, submissionDate: inv.submittedAt, submittedBy: me.name }, inv.id);
    PH.Notify.push({ type: 'invoice_received', ref: num, to: { roles: ['buyer', 'finance'] }, title: 'Invoice ' + num + ' received from ' + v.name, body: 'PO ' + po.id + ' – ' + U.inr(inv.total) + (inv.grnAtSubmit ? '' : ' (submitted before GRN)'), link: '#/invoices/' + inv.id });
    return inv;
  };
  Inv.update = function () { PH.fail('Submitted invoices cannot be edited or amended through the portal – contact the buyer to have it rejected and resubmit.', 'LOCKED'); };
  Inv.bucket = (i) => (['Submitted'].includes(i.status) ? 'submitted' : i.status === 'Rejected' ? 'rejected' : ['Approved', 'Payment scheduled', 'Paid'].includes(i.status) ? 'approved' : 'processing');
  Inv.counts = (list) => { const l = list || PH.db().invoices; const c = (b) => l.filter((i) => Inv.bucket(i) === b).length; return { submitted: l.length, processing: c('processing') + c('submitted'), approved: c('approved'), rejected: c('rejected') }; };

  // Bulk TDS / payment advice sharing (CFO office): simulated FTP-drop → distributed per vendor
  Inv.shareAdvice = function ({ vendorIds, kind, period, fileName }) {
    PH.requireRole('finance', 'buyer'); PH.assert(vendorIds && vendorIds.length, 'Select at least one vendor.'); PH.assert(['TDS certificate', 'Payment advice'].includes(kind), 'Choose a document type.'); PH.assert(period, 'Period is required.');
    const out = vendorIds.map((vid) => { const v = PH.vendor(vid); const a = { id: PH.nextId('advice'), vendorId: vid, kind, period, file: (fileName || kind.replace(/\s/g, '_')) + '_' + v.code + '.pdf', at: now(), by: PH.actor().name }; PH.db().advices.push(a); PH.Notify.push({ type: 'payment_scheduled', ref: a.id, to: { vendorId: vid }, title: kind + ' available – ' + period, body: 'A new ' + kind.toLowerCase() + ' for ' + period + ' has been shared in your Payments section.', link: '#/payments' }); return a; });
    PH.Sys.send('BULK_ADVICE', { count: out.length, kind, period }, 'BATCH-' + period); return out;
  };
  Inv.simulateFtp = function () { const vids = PH.U.uniq(PH.db().payments.map((p) => p.vendorId)); PH.assert(vids.length, 'No paid invoices yet – nothing to distribute.'); return Inv.shareAdvice({ vendorIds: vids, kind: 'Payment advice', period: 'Current month', fileName: 'FTP_PaymentAdvice' }); };
})(typeof window !== 'undefined' ? window : globalThis);
