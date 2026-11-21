/* Source2Pay – demo seed. All names, numbers and documents are fictional.
   History is REPLAYED through the real services with the demo clock stepped back in time,
   so every seeded record already obeys the business rules and carries a believable audit trail. */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  const Seed = (PH.Seed = {});
  const Samples = (PH.Samples = {});

  // ---------- sample data builders (also used by the "Fill sample data" demo helpers in the UI) ----------
  Samples.registration = function (o, opt) {
    opt = opt || {}; const good = opt.good !== false;
    const gst = o.gst, pan = o.pan, state = U.STATES[(gst || '27').slice(0, 2)] || 'Maharashtra';
    const { questions } = PH.S.Onb.applicableQuestions(o.cats); const answers = {};
    questions.forEach((q, i) => { answers[q.id] = q.type === 'yesno' ? (good || i % 3 ? 'yes' : 'no') : String(good ? 4 + (i % 2) : 2); });
    const docs = {}; PH.S.Onb.requiredDocs(o.cats).forEach((d) => { if (d !== 'Signed NDA') docs[d] = d.replace(/[^A-Za-z0-9]+/g, '_') + '.pdf'; });
    return {
      company: { name: o.vendorName, regAddress: 'Plot 21, Industrial Estate, Phase II, Pune 411019', commAddress: 'Plot 21, Industrial Estate, Phase II, Pune 411019', website: 'www.' + U.slug(o.vendorName).slice(0, 14) + '.demo', yearEst: 2009, ownership: 'Private Limited', other: '' },
      contact: { name: o.contactName, email: o.contactEmail, mobile: '9820012345', phone: '020-27123456' },
      statutory: { pan, gst, state },
      financial: { netWorth: 42000000, cibil: 762, bankName: 'Sample Bank', holder: o.vendorName, accountNo: '50200012345678', ifsc: 'HDFC0001234', capability: 'Annual turnover about ₹ 38 Cr; stable cash flows.' },
      msme: { is: opt.msme !== false, certNo: 'UDYAM-MH-26-0098765', validTill: U.ymd(U.addDays(PH.now(), 400)), file: 'MSME_certificate.pdf' },
      addresses: [{ id: 'A1', line: 'Plot 21, Industrial Estate, Phase II', city: 'Pune', state, pin: '411019', primary: true }],
      nda: { file: 'Signed_NDA.pdf' }, coc: { ack: true, at: U.iso(PH.now()) }, docs, answers,
    };
  };
  Samples.quote = function (rfq, vendor, bias) {
    const f = bias || 1;
    return { header: { paymentTerms: rfq.defaults.paymentTerm, advancePct: 0, taxId: 'GST18', incoterm: rfq.defaults.incoterm, validityDays: 60, currency: 'INR', exchangeRate: 1, placeOfSupply: vendor.state, extras: { development: 0, inspection: 0, tooling: 0, freight: 0, other: 0 } }, lines: rfq.items.map((it) => ({ no: it.no, rate: U.round(it.budgetRate * f, 2), deliveryDate: it.deliveryDate, remarks: '' })), docs: [], ack: true, remarks: '' };
  };

  // ---------- master data ----------
  const D = (n) => U.iso(U.addDays(new Date(), n));
  const vend = (o) => Object.assign({ status: 'active', purchasingBlock: false, consecutiveHigh: 0, alerts: {}, history: [], sysStatus: 'Active', addresses: [], bank: {}, financial: {}, ownership: 'Private Limited' }, o);
  const MET = (a) => ({ delivery: a[0], quality: a[1], commercial: a[2], participation: a[3], responsiveness: a[4], compliance: a[5], engagement: a[6] });

  Seed.build = function () {
    const db = PH.db();
    db.cfg = PH.defaultConfig();
    ['users', 'vendors', 'onboarding', 'rfqs', 'quotes', 'pans', 'pos', 'inspections', 'readiness', 'dispatches', 'grns', 'invoices', 'payments', 'tickets', 'notifs', 'mails', 'sysLog', 'audit', 'reactivations', 'profileChanges', 'advices'].forEach((k) => { db[k] = []; });
    db.clock = { days: 0 };

    const pw = 'Demo@123';
    const mk = (id, name, email, role, dept, extra) => Object.assign({ id, name, email, role, dept, active: true, password: pw }, extra || {});
    db.users = [
      mk('u-anita', 'Procurement', 'procurement@demo.example', 'buyer', 'SCM – Senior Buyer'),
      mk('u-rohan', 'Quality', 'quality@demo.example', 'quality', 'Quality Assurance'),
      mk('u-dev', 'Design', 'design@demo.example', 'design', 'Design & Engineering'),
      mk('u-farah', 'Finance', 'finance@demo.example', 'finance', 'Finance – Accounts Payable'),
      mk('u-neha', 'Operations', 'operations@demo.example', 'ops', 'Operations Planning'),
      mk('u-meera', 'Approver', 'approver@demo.example', 'approver', 'Approving Authority (acts at any level in this demo)'),
      mk('u-arvind', 'Management', 'management@demo.example', 'leader', 'Leadership – Head of Operations'),
      mk('u-karan', 'Admin', 'admin@demo.example', 'admin', 'Portal Administrator'),
      mk('u-v01', 'Precision Forgings', 'rakesh@precisionforgings.demo', 'vendor', 'Sales – Key Accounts', { vendorId: 'V-01' }),
      mk('u-v02', 'Apex Castings', 'hetal@apexcastings.demo', 'vendor', 'Commercial Manager', { vendorId: 'V-02' }),
      mk('u-v03', 'Sterling Fasteners', 'selvam@sterlingfasteners.demo', 'vendor', 'Director', { vendorId: 'V-03' }),
      mk('u-v05', 'Orion Machining', 'gurpreet@orionmachining.demo', 'vendor', 'Works Manager', { vendorId: 'V-05' }),
      mk('u-v09', 'Kestrel Wire', 'subrata@kestrelwire.demo', 'vendor', 'Proprietor', { vendorId: 'V-09' }),
    ];

    const V = (id, code, name, pan, gst, cats, msme, terms, perf, prev, extra) => vend(Object.assign({ id, code, name, pan, gst, state: U.STATES[gst.slice(0, 2)], cats, msme: msme || { is: false }, paymentTerms: terms, perf: { cur: MET(perf), prev: MET(prev) }, contact: { name: 'Contact – ' + name.split(' ')[0], email: 'contact@' + U.slug(name).slice(0, 12) + '.demo', mobile: '98200' + U.pad(U.hash(id) % 100000, 5), phone: '' }, bank: { holder: name, accountNo: '5020' + U.pad(U.hash(id) % 10000000000, 10), ifsc: 'HDFC0001234', bankName: 'Sample Bank' }, financial: { netWorth: 30000000 + (U.hash(id) % 50000000), cibil: 700 + (U.hash(name) % 160) }, onboardedAt: D(-420), lastActivityAt: D(-10), history: [{ at: D(-420), text: 'Onboarded – vendor code ' + code + ' issued', by: 'System' }], addresses: [{ id: 'A1', line: 'Industrial Area', city: 'Pune', state: U.STATES[gst.slice(0, 2)], pin: '411019', primary: true }] }, extra || {}));
    db.vendors = [
      V('V-01', '100231', 'Precision Forgings Pvt Ltd', 'AABCP4821K', '27AABCP4821K1Z5', ['C3', 'C5'], { is: true, certNo: 'UDYAM-MH-26-0012345', validTill: D(210) }, 'PT30', [88, 90, 82, 92, 85, 95, 80], [84, 88, 80, 90, 82, 92, 76]),
      V('V-02', '100232', 'Apex Castings & Alloys Ltd', 'AAACA7733M', '24AAACA7733M1Z2', ['C3', 'C7'], null, 'PT60', [80, 84, 78, 85, 80, 85, 70], [78, 82, 76, 84, 78, 84, 68]),
      V('V-03', '100233', 'Sterling Fasteners & Fittings LLP', 'AAFFS5521Q', '33AAFFS5521Q1Z9', ['C1', 'C6'], { is: true, certNo: 'UDYAM-TN-26-0045671', validTill: D(24) }, 'PT30', [76, 82, 84, 88, 90, 70, 75], [74, 80, 82, 86, 88, 72, 72]),
      V('V-04', '100234', 'Hydrotek Fluid Systems LLP', 'AAHFH3390L', '29AAHFH3390L1Z4', ['C7'], { is: true, certNo: 'UDYAM-KA-26-0033120', validTill: D(160) }, 'PT30', [79, 80, 75, 70, 72, 90, 40], [80, 82, 77, 72, 74, 90, 55], { lastActivityAt: D(-165) }),
      V('V-05', '100235', 'Orion Machining Works Pvt Ltd', 'AABCO9124D', '06AABCO9124D1Z7', ['C3', 'C4'], { is: true, certNo: 'UDYAM-HR-26-0021877', validTill: U.iso(new Date(Math.max(Date.now() - 15 * 864e5, PH.S.Gov.msmeDeadline(new Date()).getTime() + 864e5))) }, 'PT30', [52, 58, 48, 60, 55, 60, 50], [60, 64, 55, 66, 60, 70, 55], { consecutiveHigh: 6 }),
      V('V-06', '100236', 'Bluecrest Electronics Pvt Ltd', 'AABCB6677H', '36AABCB6677H1Z1', ['C6', 'C7'], null, 'PT60', [90, 88, 86, 80, 82, 90, 85], [88, 86, 84, 78, 80, 88, 82]),
      V('V-07', '100237', 'Titan Capital Equipment Pvt Ltd', 'AAECT2209R', '27AAECT2209R1Z3', ['C8'], null, 'PT60', [78, 82, 70, 60, 65, 88, 55], [76, 80, 72, 62, 66, 86, 54]),
      V('V-08', '100238', 'Vertex Alloys Pvt Ltd', 'AABCV8841P', '08AABCV8841P1Z6', ['C3'], null, 'PT60', [30, 35, 40, 25, 30, 40, 20], [45, 50, 52, 40, 42, 55, 30], { status: 'blacklisted', sysStatus: 'Blocked (blacklisted)', blacklistedAt: D(-120), lastActivityAt: D(-130) }),
      V('V-09', '100239', 'Kestrel Wire & Cable Co', 'AAJFK1180B', '19AAJFK1180B1Z8', ['C6'], { is: true, certNo: 'UDYAM-WB-26-0010023', validTill: D(120) }, 'PT30', [62, 64, 60, 50, 52, 80, 25], [66, 68, 62, 58, 60, 80, 40], { lastActivityAt: D(-210) }),
    ];
    db.vendors.find((v) => v.id === 'V-08').history.push({ at: D(-120), text: 'Blacklisted – repeated quality fraud on certificates; permanently blocked', by: 'SCM Head' });

    // ---------- master data: PRs, budgets, vendor master ----------
    const it = (no, code, desc, hsn, qty, uom, reqD, b, bm, sys, hv, hd, hr) => ({ no, code, desc, hsn, qty, uom, reqDate: D(reqD), budgetRate: b, benchmarkRate: bm, systemRate: sys, hist: { vendor: hv, date: D(-hd), rate: hr } });
    const pr = (no, title, bu, project, wbs, commodity, items, d) => ({ no, title, bu, project, wbs, commodity, plant: 'Main Plant, Pune', date: D(-d), requester: 'Planning – ' + bu, status: 'Released', items });
    db.erp = {
      vendors: db.vendors.map((v) => ({ code: v.code, name: v.name, pan: v.pan, gst: v.gst, status: v.status === 'blacklisted' ? 'Blocked (blacklisted)' : v.status === 'active' ? 'Active' : 'Active', payTerms: v.msme && v.msme.is ? 'PT30' : 'PT60', msme: !!(v.msme && v.msme.is), created: v.onboardedAt })).concat([
        { code: '100150', name: 'Zenith Metal Works Pvt Ltd', pan: 'AABCZ1234F', gst: '27AABCZ1234F1Z5', status: 'Active', payTerms: 'PT60', msme: false, created: D(-1200) },
      ]),
      prs: [
        pr('1000004521', 'Forged transmission shafts & flanges – batch 3', 'HEV', 'Heavy Duty Gearbox Programme', 'HEV-GB-2026-01', 'Forgings', [it(1, 'FRG-1001', 'Forged shaft EN24, Ø80 × 620 mm', '7326', 400, 'EA', 45, 4850, 4700, 4920, 'Precision Forgings Pvt Ltd', 140, 4920), it(2, 'FRG-1002', 'Forged flange 16" SS316', '7326', 250, 'EA', 45, 3200, 3050, 3280, 'Precision Forgings Pvt Ltd', 140, 3280)], 95),
        pr('1000004522', 'Aluminium alloy castings – drive housings', 'PRC', 'Compact Drive Line', 'PRC-CD-2026-04', 'Castings', [it(1, 'CST-2001', 'Housing casting A356-T6, machined faces', '7616', 600, 'EA', 50, 2750, 2600, 2810, 'Apex Castings & Alloys Ltd', 110, 2810), it(2, 'CST-2002', 'End cover casting A356', '7616', 600, 'EA', 50, 980, 930, 1010, 'Apex Castings & Alloys Ltd', 110, 1010)], 20),
        pr('1000004523', 'Hydraulic fittings & hose assemblies', 'IND', 'Industrial Hydraulics Retrofit', 'IND-HY-2026-02', 'Hydraulics', [it(1, 'HYD-3001', 'JIC fitting 1/2" zinc-nickel', '7307', 2000, 'EA', 40, 145, 138, 150, 'Hydrotek Fluid Systems LLP', 90, 150), it(2, 'HYD-3002', 'Hose assembly 1 m, 3000 PSI', '4009', 800, 'EA', 40, 620, 590, 640, 'Hydrotek Fluid Systems LLP', 90, 640)], 28),
        pr('1000004524', 'CNC vertical machining centre (3-axis)', 'HEV', 'Capacity Expansion – Machine Shop', 'HEV-CP-2026-09', 'Capital Equipment', [it(1, 'CAP-4001', 'VMC 1050, 3-axis, 12k rpm spindle, ATC 24', '8457', 1, 'SET', 120, 6800000, 6500000, 6900000, 'Titan Capital Equipment Pvt Ltd', 700, 6900000)], 15),
        pr('1000004525', 'Precision fasteners – grade 10.9', 'PRC', 'Compact Drive Line', 'PRC-FS-2026-03', 'Fasteners', [it(1, 'FST-5001', 'Hex bolt M16 × 80, grade 10.9, zinc flake', '7318', 120000, 'EA', 50, 18.5, 17.5, 19, 'Sterling Fasteners & Fittings LLP', 100, 19), it(2, 'FST-5002', 'Nylock nut M16, grade 10', '7318', 120000, 'EA', 50, 6.2, 5.9, 6.4, 'Sterling Fasteners & Fittings LLP', 100, 6.4)], 40),
        pr('1000004526', 'Cast aluminium control enclosures (IP65)', 'IND', 'Smart Control Panels', 'IND-EL-2026-05', 'Castings', [it(1, 'CST-6001', 'IP65 cast aluminium enclosure 300×200×120', '7616', 300, 'EA', 30, 4200, 4000, 4300, 'Apex Castings & Alloys Ltd', 120, 4300)], 60),
        pr('1000004527', 'Calibration & NDT services – annual contract', 'IND', 'Quality Infrastructure', 'IND-SV-2026-01', 'Services', [it(1, 'SRV-7001', 'Calibration & NDT service – monthly visit', '9983', 12, 'LOT', 90, 85000, 80000, 88000, 'Metrocal Services', 380, 88000)], 8),
        pr('1000004528', 'Machined aluminium brackets', 'PRC', 'Compact Drive Line', 'PRC-MB-2026-06', 'Machined Parts', [it(1, 'MCH-8001', 'Bracket Al6061, CNC machined, anodised', '7616', 1500, 'EA', 30, 640, 610, 660, 'Orion Machining Works Pvt Ltd', 100, 660)], 70),
      ],
      budgets: { 'HEV-GB-2026-01': { project: 'Heavy Duty Gearbox Programme', total: 9200000, committed: 2699500 }, 'PRC-CD-2026-04': { project: 'Compact Drive Line', total: 4200000, committed: 0 }, 'IND-HY-2026-02': { project: 'Industrial Hydraulics Retrofit', total: 1100000, committed: 0 }, 'HEV-CP-2026-09': { project: 'Capacity Expansion – Machine Shop', total: 7600000, committed: 0 }, 'PRC-FS-2026-03': { project: 'Compact Drive Line', total: 3400000, committed: 0 }, 'IND-EL-2026-05': { project: 'Smart Control Panels', total: 1500000, committed: 0 }, 'IND-SV-2026-01': { project: 'Quality Infrastructure', total: 1100000, committed: 0 }, 'PRC-MB-2026-06': { project: 'Compact Drive Line', total: 1100000, committed: 0 } },
      queue: [],
    };

    PH.Seed.replay();
  };

  // ---------- history replay ----------
  Seed.replay = function () {
    const db = PH.db(); const S = PH.S; const Sys = PH.Sys;
    const at = (d) => { db.clock.days = -d; };
    const as = (u, fn) => PH.as(u, fn);
    const ymd = (n) => U.ymd(U.addDays(PH.now(), n));
    const ddt = (n, h) => { const x = U.addDays(PH.now(), n); x.setHours(h || 17, 0, 0, 0); return x.toISOString(); };
    const qd = (rfq, s) => ({ header: { paymentTerms: s.pt || 'PT45', advancePct: s.adv || 0, taxId: 'GST18', incoterm: s.inc || 'DAP', validityDays: s.val || 60, currency: 'INR', exchangeRate: 1, placeOfSupply: s.pos || 'Maharashtra', extras: s.extras || {} }, lines: rfq.items.map((x, i) => ({ no: x.no, rate: s.rates[i], deliveryDate: ymd(s.days || 45), remarks: '' })), docs: [], ack: true, remarks: s.remarks || '', noRegret: !!s.noRegret });
    const U_ = { 'V-01': 'u-v01', 'V-02': 'u-v02', 'V-03': 'u-v03', 'V-05': 'u-v05' };
    const vu = (vid) => U_[vid] || ('u-' + vid.toLowerCase());
    // vendors without a login persona respond "on behalf" through system user records created lazily
    ['V-04', 'V-06', 'V-07'].forEach((vid) => { if (!PH.userById('u-' + vid.toLowerCase())) db.users.push({ id: 'u-' + vid.toLowerCase(), name: PH.vendor(vid).name, email: vid.toLowerCase() + '@vendor.demo', role: 'vendor', dept: 'Vendor', vendorId: vid, active: true, password: 'Demo@123' }); });

    const publish = (prNo, vids, dAgo, deadlineIn) => { at(dAgo); return as('u-anita', () => { const r = S.Rfq.create({ prNo, templateId: 'T1' }); S.Rfq.publish(r.id, { deadline: ddt(deadlineIn), accessDays: 60, vendorIds: vids }); return r; }); };
    const respond = (rfq, vid, spec, dAgo, view) => { at(dAgo); as(vu(vid), () => { if (view) S.Docs.view(rfq.id, rfq.docs[0].id); S.Quote.submit(rfq.id, qd(rfq, spec)); }); };
    const negotiate = (rfq, vid, rounds, dAgo) => { rounds.forEach((r, i) => { at(dAgo - i * 2); as('u-anita', () => S.Neg.request(rfq.id, vid, r.ask)); at(dAgo - i * 2 - 1); as(vu(vid), () => S.Neg.submitRevised(rfq.id, Object.assign(qd(rfq, r), { remarks: r.remarks || 'Revised offer after discussion' }))); }); };
    const final = (rfq, vid, n, dAgo) => { at(dAgo); as('u-anita', () => S.Neg.markFinal(rfq.id, vid, n)); };
    const approveAll = (pan, startAgo, stepDays) => { let d = startAgo; while (pan.status === 'in_approval') { at(d); as('u-meera', () => S.Pan.act(pan.id, 'approve', 'Reviewed – commercially acceptable.')); d -= stepDays; } };
    const poFor = (pan) => db.pos.find((p) => p.panId === pan.id);

    // ================= H1: forgings – full lifecycle to payment =================
    let r1 = publish('1000004521', ['V-01', 'V-02', 'V-05'], 90, 10);
    respond(r1, 'V-01', { rates: [4850, 3200], days: 50, pt: 'PT45', extras: { freight: 20000 } }, 88, true);
    respond(r1, 'V-02', { rates: [4950, 3260], days: 55, pt: 'PT60' }, 87, true);
    respond(r1, 'V-05', { rates: [4700, 3300], days: 60, pt: 'PT45', extras: { freight: 45000 } }, 86, true);
    negotiate(r1, 'V-01', [{ ask: 'Please improve rates by 2% for a 400/250 pcs commitment.', rates: [4780, 3150], days: 48, pt: 'PT45', extras: { freight: 20000 }, noRegret: true, remarks: 'Best rates – no-regret offer.' }], 85);
    negotiate(r1, 'V-02', [{ ask: 'Target 4,850 / 3,200 on volume.', rates: [4890, 3200], days: 55, pt: 'PT60', remarks: 'Reduced on volume.' }], 85);
    negotiate(r1, 'V-05', [{ ask: 'Match market benchmark on item 1.', rates: [4650, 3250], days: 60, pt: 'PT45', extras: { freight: 45000 }, remarks: 'Final.' }], 85);
    final(r1, 'V-01', 1, 80); final(r1, 'V-02', 1, 80); final(r1, 'V-05', 1, 80);
    at(78); let pan1 = as('u-anita', () => S.Pan.create(r1.id));
    as('u-anita', () => { S.Pan.recommend(pan1.id, { vendorId: 'V-01', justification: 'Incumbent with 90 quality score and on-time record; capacity confirmed for the full lot.', nonL1: 'Orion (L1 by ₹2,000 only) has delivery score 52 and quality score 58; Precision Forgings is the lower-risk supplier.', remarks: 'Recommend award to Precision Forgings.' }); S.Pan.submit(pan1.id); });
    approveAll(pan1, 76, 1);
    const po1 = poFor(pan1); at(70); as('u-v01', () => S.Po.accept(po1.id));
    // readiness & inspection (cycle 1 partial, cycle 2 approved)
    const qap = { QAP: 'QAP_Rev3.pdf', 'Material test certificate': 'MTC_HT-2210.pdf', 'Heat-treatment record': 'HT_record_4410.pdf' };
    at(62); as('u-v01', () => { S.Qa.markReady(po1.id, { lineNo: 1, qty: 200, readyDate: ymd(0), remarks: 'First lot ready' }); S.Qa.markReady(po1.id, { lineNo: 2, qty: 250, readyDate: ymd(0), remarks: 'Complete lot' }); });
    at(60); const ir1 = as('u-v01', () => S.Qa.requestInspection(po1.id, { lines: [{ lineNo: 1, qty: 200 }, { lineNo: 2, qty: 250 }], requestedDate: ymd(2), contactName: 'Dispatch desk', contactPhone: '9820011223', docs: qap, remarks: 'Please inspect at vendor works.' }));
    const chk = (res, failId) => db.cfg.inspectionChecklist.map((c) => ({ id: c.id, result: c.id === failId ? 'fail' : res, remarks: c.id === failId ? '50 shafts out of diametral tolerance' : '' }));
    at(57); as('u-rohan', () => S.Qa.inspect(ir1.id, { checklist: chk('pass', 'I1'), outcome: 'partial', lines: [{ lineNo: 1, approved: 150 }, { lineNo: 2, approved: 250 }], remarks: '50 shafts rejected – diameter above tolerance. Rework & re-present.' }));
    at(54); as('u-v01', () => S.Qa.resubmit(ir1.id, { evidence: ['Rework_report_50pcs.pdf', 'Re-measurement_sheet.xlsx'], remarks: 'Re-ground 50 shafts; dimensions re-verified with calibrated micrometer.' }));
    at(52); as('u-rohan', () => S.Qa.inspect(ir1.id, { checklist: chk('pass'), outcome: 'approved', remarks: '' }));
    at(48); as('u-v01', () => S.Qa.dispatch(po1.id, { irId: ir1.id, lines: [{ lineNo: 1, qty: 200 }, { lineNo: 2, qty: 250 }], transporter: 'BlueLine Logistics', lrNo: 'BL-558210', vehicle: 'MH12-AB-4471', date: ymd(0) }));
    at(42); Sys.postGRN({ poId: po1.id, location: 'Main Plant – Stores', lines: [{ lineNo: 1, physical: 200 }, { lineNo: 2, physical: 250 }] });
    at(40); const inv1 = as('u-v01', () => S.Inv.submit({ poId: po1.id, number: 'PF/26-27/0412', date: ymd(0), taxable: 200 * 4780 + 250 * 3150, docs: ['Invoice_PF_0412.pdf'] }));
    at(8); Sys.runPayment(inv1.id, { deductions: [{ type: 'Liquidated damages', amount: 12500, reason: 'Delay of 5 days on line 1 (clause 14.2)' }] });
    at(35); as('u-v01', () => { S.Qa.markReady(po1.id, { lineNo: 1, qty: 200, readyDate: ymd(0), remarks: 'Second lot' }); });
    at(33); const ir2 = as('u-v01', () => S.Qa.requestInspection(po1.id, { lines: [{ lineNo: 1, qty: 200 }], requestedDate: ymd(2), contactName: 'Dispatch desk', contactPhone: '9820011223', docs: qap }));
    at(30); as('u-rohan', () => S.Qa.inspect(ir2.id, { checklist: chk('pass'), outcome: 'approved' }));
    at(27); as('u-v01', () => S.Qa.dispatch(po1.id, { irId: ir2.id, lines: [{ lineNo: 1, qty: 200 }], transporter: 'BlueLine Logistics', lrNo: 'BL-559877', vehicle: 'MH12-CD-1180', date: ymd(0) }));
    at(21); Sys.postGRN({ poId: po1.id, location: 'Main Plant – Stores', lines: [{ lineNo: 1, physical: 198, remarks: '2 pcs short in packing' }] });
    at(19); as('u-v01', () => S.Inv.submit({ poId: po1.id, number: 'PF/26-27/0455', date: ymd(0), taxable: 198 * 4780, docs: ['Invoice_PF_0455.pdf'] }));

    // ================= H2: brackets – awarded without negotiation, PO accepted =================
    let r2 = publish('1000004528', ['V-05', 'V-01', 'V-02'], 74, 8);
    respond(r2, 'V-05', { rates: [615], days: 35, pt: 'PT45' }, 72); respond(r2, 'V-01', { rates: [632], days: 38, pt: 'PT45' }, 72, true); respond(r2, 'V-02', { rates: [648], days: 40, pt: 'PT60' }, 71);
    ['V-05', 'V-01', 'V-02'].forEach((v) => final(r2, v, 0, 68));
    at(66); let pan2 = as('u-anita', () => S.Pan.create(r2.id));
    as('u-anita', () => { S.Pan.recommend(pan2.id, { vendorId: 'V-05', justification: 'L1 and meets drawing tolerances on the sample lot.' }); S.Pan.submit(pan2.id); });
    approveAll(pan2, 64, 1); const po2 = poFor(pan2); at(60); as('u-v05', () => S.Po.accept(po2.id));

    // ================= H3: enclosures – PO released, awaiting acceptance (live demo for the vendor) =================
    let r3 = publish('1000004526', ['V-02', 'V-01', 'V-07'], 40, 8);
    respond(r3, 'V-02', { rates: [4150], days: 40, pt: 'PT60' }, 36, true); respond(r3, 'V-01', { rates: [4220], days: 45, pt: 'PT45' }, 36); respond(r3, 'V-07', { rates: [4310], days: 50, pt: 'PT60' }, 35);
    ['V-02', 'V-01', 'V-07'].forEach((v) => final(r3, v, 0, 32));
    at(30); let pan3 = as('u-anita', () => S.Pan.create(r3.id));
    as('u-anita', () => { S.Pan.recommend(pan3.id, { vendorId: 'V-02', justification: 'L1 with strong casting quality record.' }); S.Pan.submit(pan3.id); });
    approveAll(pan3, 28, 1); const po3 = poFor(pan3);
    at(4); as('u-v02', () => S.Po.raise(po3.id, { type: 'clarification', subject: 'Surface treatment specification', text: 'Drawing note 4 mentions powder coat RAL 7035 but the PO text says "as per sample". Please confirm the final colour.' }));
    at(3); as('u-anita', () => S.Po.reply(po3.id, 'CL-1', 'Please follow RAL 7035 textured, as per the drawing. The sample will be returned with the PO acceptance.'));

    // ================= Live RFQs =================
    // RFQ castings (published, responses in progress)
    at(3); let r4 = publish('1000004522', ['V-01', 'V-02', 'V-05'], 3, 6);
    at(2); as('u-v01', () => S.Docs.view(r4.id, r4.docs[1].id));
    respond(r4, 'V-02', { rates: [2790, 975], days: 40, pt: 'PT60' }, 1, true);
    // RFQ hydraulics: all final, ready for PAN (hero demo)
    let r5 = publish('1000004523', ['V-04', 'V-06', 'V-03'], 34, 10);
    respond(r5, 'V-04', { rates: [148, 630], days: 38, pt: 'PT30', extras: { freight: 6000 } }, 31, true);
    respond(r5, 'V-06', { rates: [141, 615], days: 30, pt: 'ADV30', adv: 30, extras: { freight: 4000 } }, 31);
    respond(r5, 'V-03', { rates: [150, 650], days: 40, pt: 'PT45', extras: { freight: 5000 } }, 30);
    negotiate(r5, 'V-04', [{ ask: 'Need 5% reduction to remain competitive.', rates: [144, 612], days: 36, pt: 'PT30', extras: { freight: 6000 }, remarks: 'Reduced rates, same terms.' }], 28);
    negotiate(r5, 'V-06', [{ ask: 'Can you reduce advance to 10%?', rates: [139, 600], days: 30, pt: 'ADV30', adv: 30, extras: { freight: 4000 }, remarks: 'Advance needed for imported seals.', noRegret: true }], 28);
    negotiate(r5, 'V-03', [{ ask: 'Best price please.', rates: [146, 618], days: 40, pt: 'PT45', extras: { freight: 5000 }, remarks: 'Best price.' }], 28);
    ['V-04', 'V-06', 'V-03'].forEach((v) => final(r5, v, 1, 22));
    // RFQ fasteners: PAN in approval (level 3 pending)
    let r6 = publish('1000004525', ['V-03', 'V-05', 'V-02'], 26, 10);
    respond(r6, 'V-03', { rates: [18.9, 6.3], days: 44, pt: 'ADV10', adv: 10 }, 24, true); respond(r6, 'V-05', { rates: [19.4, 6.6], days: 48, pt: 'PT45' }, 23); respond(r6, 'V-02', { rates: [19.8, 6.7], days: 50, pt: 'PT60' }, 23);
    negotiate(r6, 'V-03', [{ ask: 'Reduce by 3% for 120k pcs.', rates: [18.4, 6.1], days: 44, pt: 'ADV10', adv: 10, remarks: 'Agreed on volume.', noRegret: true }], 20);
    final(r6, 'V-03', 1, 17); final(r6, 'V-05', 0, 17); final(r6, 'V-02', 0, 17);
    at(15); let pan6 = as('u-anita', () => S.Pan.create(r6.id));
    as('u-anita', () => { S.Pan.recommend(pan6.id, { vendorId: 'V-03', justification: 'L1 with proven fastener quality; volume pricing secured.' }); S.Pan.submit(pan6.id); });
    at(13); as('u-meera', () => S.Pan.act(pan6.id, 'approve', 'Commodity review complete.')); at(12); as('u-meera', () => S.Pan.act(pan6.id, 'approve', 'Aligned with program budget.'));

    // ================= Onboarding pipeline =================
    const rec = (name, pan, gst, cats, contact, email, just, est, dAgo) => { at(dAgo); return as('u-anita', () => S.Onb.recommend({ vendorName: name, pan, gst, cats, contactName: contact, contactEmail: email, justification: just, estValue: est })).request; };
    const screenAll = (o, dAgo) => { at(dAgo); as('u-anita', () => S.Onb.screen(o.id, 'scm', 'pass', '')); as('u-rohan', () => S.Onb.screen(o.id, 'qc', 'pass', '')); as('u-dev', () => S.Onb.screen(o.id, 'design', 'pass', '')); };
    const register = (o, dAgo, good) => { at(dAgo); as('u-anita', () => S.Onb.invite(o.id)); at(dAgo - 3); const uid = o.invitation.userId; as(uid, () => { S.Onb.saveRegistration(o.id, Samples.registration(o, { good })); S.Onb.submitRegistration(o.id); }); };

    const o1 = rec('Orbit Precision Components Pvt Ltd', 'AAGCO4417N', '27AAGCO4417N1Z6', ['C3', 'C4'], 'Orbit Precision', 'neeraj@orbitprecision.demo', 'Second source needed for precision turned components; strong references from two tier-1 customers.', 6000000, 12);
    screenAll(o1, 11); at(9); as('u-anita', () => S.Onb.invite(o1.id));

    const o2 = rec('Helix Tooling & Dies Pvt Ltd', 'AAHCH5532G', '27AAHCH5532G1Z4', ['C4'], 'Prakash Wagh', 'prakash@helixtooling.demo', 'Need a second source for precision dies and fixtures for the new gearbox programme.', 8000000, 25);
    screenAll(o2, 24); register(o2, 22);

    const o3 = rec('Crown Forge Industries', 'AABFC7766J', '24AABFC7766J1Z3', ['C3'], 'Imran Qureshi', 'imran@crownforge.demo', 'Forging capacity for shafts above Ø100 mm; incumbent at capacity.', 15000000, 45);
    screenAll(o3, 44); register(o3, 42); at(38);
    as('u-anita', () => S.Onb.review(o3.id, 'purchase', 'recommend', 80, 'Commercial terms and references are good.')); as('u-rohan', () => S.Onb.review(o3.id, 'quality', 'recommend', 74, 'ISO 9001 valid; calibration records to be verified at audit.'));
    at(34); as('u-anita', () => S.Onb.recordThirdParty(o3.id, { agency: 'Veritas Assurance Services', date: ymd(-1), score: 78, result: 'satisfactory', findings: 'Capable melt shop and forging press line; minor gaps in NDT traceability records.' }));
    at(30); as('u-anita', () => S.Onb.decideAudit(o3.id, 'scm', true, 'Large forging supplier – audit advised.')); as('u-rohan', () => S.Onb.decideAudit(o3.id, 'qc', true, 'Heat-treatment control needs on-site verification.'));

    const o4 = rec('Delta Polymer Components', 'AACCD3345M', '27AACCD3345M1Z8', ['C1'], 'Smita Joshi', 'smita@deltapolymer.demo', 'Catalogue gaskets and seals; replaces three small suppliers.', 2500000, 40);
    screenAll(o4, 39); register(o4, 37); at(33); as('u-anita', () => S.Onb.review(o4.id, 'purchase', 'recommend', 88, 'Catalogue pricing competitive.'));
    at(31); as('u-anita', () => S.Onb.recordThirdParty(o4.id, { agency: 'Veritas Assurance Services', date: ymd(-1), score: 82, result: 'satisfactory', findings: 'Stable trading operation with good stock control.' }));
    at(29); as('u-anita', () => S.Onb.decideAudit(o4.id, 'scm', false, 'Trading category – audit not needed.')); as('u-rohan', () => S.Onb.decideAudit(o4.id, 'qc', false, 'Agreed.'));
    at(27); as('u-anita', () => S.Onb.decide(o4.id, 'approve', 'Qualified – proceed to executive approval.'));
    at(25); as('u-meera', () => { S.Onb.approve(o4.id, 'Head Design', 'approved', 'No design concerns.'); S.Onb.approve(o4.id, 'Head QC', 'approved', 'Catalogue items – acceptable.'); });

    const o5 = rec('Nova Cables & Conductors', 'AAHFN8890C', '29AAHFN8890C1Z2', ['C6'], 'Asha Pillai', 'asha@novacables.demo', 'Alternate source for control cables.', 3000000, 55);
    at(54); as('u-rohan', () => S.Onb.screen(o5.id, 'qc', 'fail', 'No ISO certification and failed sample test on insulation resistance.'));
    const o6 = rec('Sigma Sealing Solutions', 'AAFCS2210Q', '27AAFCS2210Q1Z0', ['C1', 'C6'], 'Vivek Dalvi', 'vivek@sigmasealing.demo', 'Hydraulic and pneumatic seal kits – OEM distributor.', 4000000, 3);
    at(2); as('u-anita', () => S.Onb.screen(o6.id, 'scm', 'pass', ''));

    // ================= Governance extras =================
    at(14); as('u-anita', () => S.Gov.proposeBlacklist('V-05', 'Repeatedly submitted rates above benchmark and delayed three consecutive deliveries without notice.'));
    at(9); const t = as('u-v01', () => S.Tkt.create({ subject: 'Short quantity on GRN – PF/26-27/0455', description: 'GRN shows 198 received against 200 dispatched. Packing list confirmed 200 – please verify the physical count.', priority: 'high', category: 'grn', refs: { po: po1.id, invoice: 'PF/26-27/0455' } }));
    at(8); as('u-anita', () => S.Tkt.reply(t.id, 'Stores will recount and confirm by tomorrow.', false)); at(8); as('u-anita', () => S.Tkt.reply(t.id, 'Internal: check dock CCTV for the 2 missing pieces.', true)); as('u-anita', () => S.Tkt.setStatus(t.id, 'waiting_vendor'));
    at(6); as('u-v03', () => S.Tkt.create({ subject: 'Drawing FST-5001 thread tolerance unclear', description: 'Thread class on the M16 bolt drawing is shown as 6g but the specification refers to 6h. Please confirm which applies.', priority: 'medium', category: 'drawing', refs: { rfq: r6.id } }));
    at(40); const t3 = as('u-v02', () => S.Tkt.create({ subject: 'Payment advice not received for last month', description: 'We did not receive the payment advice for the payment released last month.', priority: 'low', category: 'invoice' }));
    at(38); as('u-farah', () => S.Tkt.setStatus(t3.id, 'resolved', 'Advice re-sent and shared in the Payments section.')); at(37); as('u-anita', () => S.Tkt.close(t3.id, 'Confirmed by vendor on call.'));
    at(5); as('u-anita', () => S.Tkt.create({ subject: 'Please share updated ISO certificate', description: 'Your ISO 9001 certificate on file expires next quarter. Please upload the renewed certificate.', priority: 'medium', category: 'compliance', vendorId: 'V-05' }));

    // ----- finish: clock back to today, vendor activity, time-based rules -----
    db.clock.days = 0;
    const act = { 'V-01': 1, 'V-02': 1, 'V-03': 2, 'V-04': 165, 'V-05': 6, 'V-06': 12, 'V-07': 25, 'V-09': 210 };
    db.vendors.forEach((v) => { if (act[v.id] != null) v.lastActivityAt = D(-act[v.id]); });
    db.vendors.find((v) => v.id === 'V-05').consecutiveHigh = 6; // demo: one more non-L1 award triggers the auto-block rule
    PH.Store.actor = null;
    S.Gov.tick();
    // older notifications are already "read" so the bell shows only the recent, relevant items
    const cutoff = U.addDays(PH.now(), -4); db.users.forEach((u) => db.notifs.forEach((n) => { if (U.toDate(n.at) < cutoff && !n.readBy.includes(u.id)) n.readBy.push(u.id); }));
  };
})(typeof window !== 'undefined' ? window : globalThis);
