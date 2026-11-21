/* Source2Pay – Vendor onboarding workflow (recommend → screen → invite → register → review → 3rd-party → audit → consolidate → approve → setup → active) */
(function (g) {
  const PH = (g.PH = g.PH || {});
  const U = PH.U;
  PH.S = PH.S || {};
  const Onb = (PH.S.Onb = {});
  const now = () => U.iso(PH.now());
  const get = (id) => { const o = PH.byId('onboarding', id); PH.assert(o, 'Onboarding request ' + id + ' not found.', 'NOT_FOUND'); return o; };
  const log = (o, text) => { o.log.push({ at: now(), by: PH.actor().name, text }); PH.audit('onboarding', o.id, 'update', text); };

  Onb.STAGES = [
    { k: 'screening', l: 'Initial screening' }, { k: 'invite', l: 'Invitation' }, { k: 'registration', l: 'Registration' }, { k: 'review', l: 'Internal review' },
    { k: 'third_party', l: 'Third-party assessment' }, { k: 'audit_decision', l: 'Audit decision' }, { k: 'audit', l: 'Physical audit' }, { k: 'consolidation', l: 'Consolidation' },
    { k: 'approval', l: 'Executive approval' }, { k: 'setup', l: 'Vendor ID creation' }, { k: 'active', l: 'Portal activation' },
  ];
  Onb.get = get;
  Onb.isOpen = (o) => !['rejected', 'cancelled', 'active'].includes(o.stage);
  Onb.DEPT_ROLE = { purchase: 'buyer', finance: 'finance', quality: 'quality', operations: 'ops' };
  Onb.DEPT_LABEL = { purchase: 'Purchase / SCM', finance: 'Finance', quality: 'Quality', operations: 'Operations' };
  Onb.SCREEN_ROLE = { scm: 'buyer', qc: 'quality', ops: 'ops' };

  Onb.requiredDepts = (cats) => {
    const m = PH.cfg().reviewMatrix; const set = new Set();
    (cats || []).forEach((c) => (m[c] || []).forEach((d) => set.add(d)));
    return PH.cfg().reviewOrder.filter((d) => set.has(d));
  };
  Onb.applicableQuestions = (cats) => {
    const q = PH.cfg().questionnaire;
    const secs = q.sections.filter((s) => s.cats.some((c) => (cats || []).includes(c)));
    return { sections: secs, questions: q.questions.filter((x) => secs.some((s) => s.id === x.section)) };
  };
  Onb.requiredDocs = (cats) => {
    const r = PH.cfg().docRequirements; const out = [...(r['*'] || [])];
    (cats || []).forEach((c) => (r[c] || []).forEach((d) => { if (!out.includes(d)) out.push(d); }));
    return out;
  };
  Onb.scoreSelf = (cats, answers) => {
    const { sections, questions } = Onb.applicableQuestions(cats);
    let tot = 0, got = 0; const bySection = {}; const critical = [];
    questions.forEach((q) => {
      const a = answers[q.id]; const frac = q.type === 'yesno' ? (a === 'yes' ? 1 : 0) : U.num(a) / 5;
      tot += q.weight; got += q.weight * frac;
      const s = (bySection[q.section] = bySection[q.section] || { tot: 0, got: 0 }); s.tot += q.weight; s.got += q.weight * frac;
      if (q.critical && frac < 0.5) critical.push(q.id);
    });
    const overall = tot ? U.round((got / tot) * 100, 1) : 0;
    const secs = sections.map((s) => ({ id: s.id, name: s.name, score: bySection[s.id] ? U.round((bySection[s.id].got / bySection[s.id].tot) * 100, 1) : 0 }));
    const pass = overall >= PH.cfg().questionnaire.passMark && critical.length === 0;
    return { overall, sections: secs, critical, pass };
  };

  // ---- Step 1: recommendation (+ duplicate validation) ----
  Onb.recommend = function (f) {
    PH.requireRole('buyer');
    const errs = {};
    if (!f.vendorName || f.vendorName.trim().length < 3) errs.vendorName = 'Enter the vendor legal name.';
    if (f.pan && !U.isPAN(f.pan)) errs.pan = 'PAN format is invalid (AAAAA9999A).';
    if (f.gst && !U.isGST(f.gst)) errs.gst = 'GST number format is invalid.';
    if (f.pan && f.gst && U.isPAN(f.pan) && U.isGST(f.gst) && f.gst.slice(2, 12) !== f.pan) errs.gst = 'GST number does not match the PAN.';
    if (!f.cats || !f.cats.length) errs.cats = 'Select at least one supplier category.';
    if (!f.contactName || !f.contactName.trim()) errs.contactName = 'Contact person is required.';
    if (!U.isEmail(f.contactEmail)) errs.contactEmail = 'Enter a valid contact e-mail.';
    if (!f.justification || f.justification.trim().length < 20) errs.justification = 'Business justification is required (min 20 characters).';
    if (Object.keys(errs).length) PH.fail('Please correct the highlighted fields.', 'VALIDATION', errs);
    const hit = PH.Sys.lookupVendor({ pan: f.pan, gst: f.gst, name: f.vendorName });
    if (hit) PH.fail('Vendor already exists in the vendor master as ' + hit.code + ' (' + hit.name + ', status: ' + hit.status + '). A new onboarding cannot be started' + (hit.status.startsWith('Active') ? '.' : ' – use the reactivation process instead.'), 'DUPLICATE');
    const db = PH.db(); const me = PH.actor();
    const existing = db.onboarding.find((o) => Onb.isOpen(o) && f.pan && o.pan === f.pan);
    if (existing) { // multiple business users may recommend the same vendor
      existing.recommendedBy.push({ user: me.name, at: now(), justification: f.justification });
      log(existing, 'Additional recommendation added by ' + me.name);
      return { merged: true, request: existing };
    }
    const o = {
      id: PH.nextId('onb'), vendorName: f.vendorName.trim(), pan: f.pan || '', gst: f.gst || '', contactName: f.contactName.trim(), contactEmail: f.contactEmail.trim(), cats: f.cats.slice(),
      estValue: U.num(f.estValue), recommendedBy: [{ user: me.name, at: now(), justification: f.justification.trim() }], stage: 'screening', createdAt: now(),
      mode: f.mode || 'parallel', screening: {}, invitation: null, reg: null, regSubmittedAt: null, selfScore: null, reviews: [], thirdParty: null, auditDecision: {}, auditRequired: null, audit: null,
      consolidation: null, decision: null, approvals: [], erp: null, vendorId: null, cycle: 1, cycles: [], queries: [], log: [],
    };
    db.onboarding.push(o); log(o, 'Vendor recommended: ' + o.vendorName);
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: { roles: ['buyer', 'quality', 'ops'] }, title: 'Initial screening needed: ' + o.vendorName, body: 'New vendor recommendation awaits Procurement, Quality and Operations screening.', link: '#/onboarding/' + o.id });
    return { merged: false, request: o };
  };

  // ---- Step 2: initial screening ----
  Onb.screen = function (id, dept, decision, remarks) {
    const o = get(id); PH.requireRole(Onb.SCREEN_ROLE[dept] || '__none');
    PH.assert(o.stage === 'screening', 'Request is not at the screening stage.');
    PH.assert(['pass', 'fail'].includes(decision), 'Choose pass or fail.');
    PH.assert(!o.screening[dept], 'Screening already recorded for this function.');
    if (decision === 'fail') PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are mandatory when failing a screening.');
    o.screening[dept] = { decision, remarks: remarks || '', by: PH.actor().name, at: now() };
    log(o, dept.toUpperCase() + ' screening: ' + decision);
    const all = ['scm', 'qc', 'ops'].every((d) => o.screening[d]);
    if (decision === 'fail') { o.stoppedAt = o.stage; o.stage = 'rejected'; o.decision = { approved: false, by: PH.actor().name, at: now(), remarks: 'Failed initial screening (' + dept.toUpperCase() + '): ' + remarks }; log(o, 'Rejected at screening'); }
    else if (all) { o.stage = 'invite'; log(o, 'Screening complete – ready for invitation'); PH.Notify.push({ type: 'onboarding', ref: o.id, to: { roles: ['buyer'] }, title: 'Screening complete: ' + o.vendorName, body: 'Send the registration invitation to the vendor.', link: '#/onboarding/' + o.id }); }
    return o;
  };

  // ---- Step 3: invitation (SCM only) ----
  Onb.invite = function (id) {
    const o = get(id); PH.requireRole('buyer');
    PH.assert(o.stage === 'invite', 'Initial screening must be completed (Procurement, Quality and Operations) before inviting the vendor.');
    const db = PH.db(); const uid = 'u-' + o.id.toLowerCase();
    if (!db.users.find((u) => u.id === uid)) db.users.push({ id: uid, name: o.contactName, email: o.contactEmail, role: 'vendor', vendorId: null, onbId: o.id, active: true, dept: 'Vendor', password: 'Demo@123' });
    o.invitation = { sentAt: now(), by: PH.actor().name, token: U.hash(o.id + o.vendorName).toString(36), userId: uid, link: '#/register/' + U.hash(o.id).toString(36) };
    o.stage = 'registration'; log(o, 'Invitation sent to ' + o.contactEmail);
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: { users: [uid] }, title: 'You are invited to register with ' + PH.cfg().company.name, body: 'Please complete registration and the self-assessment. Sign in with the invited e-mail.', link: '#/onboarding/' + o.id });
    return o;
  };

  // ---- Step 4: vendor registration ----
  Onb.saveRegistration = function (id, data) {
    const o = get(id); const me = PH.requireRole('vendor');
    PH.assert(me.onbId === id || me.role === 'system', 'You can only edit your own registration.', 'FORBIDDEN');
    PH.assert(o.stage === 'registration', 'Registration is closed for editing at this stage.');
    o.reg = Object.assign({}, o.reg || {}, U.clone(data)); o.regSavedAt = now(); PH.audit('onboarding', o.id, 'draft-saved', 'Registration draft saved');
    return o;
  };
  Onb.validateRegistration = function (o) {
    const r = o.reg || {}, e = {}; const c = r.company || {}, ct = r.contact || {}, st = r.statutory || {}, fin = r.financial || {};
    if (!c.name || !c.name.trim()) e['company.name'] = 'Supplier name is required.';
    if (!c.regAddress || !c.regAddress.trim()) e['company.regAddress'] = 'Registered address is required.';
    const yr = U.num(c.yearEst); if (!(yr >= 1900 && yr <= PH.now().getFullYear())) e['company.yearEst'] = 'Enter a valid year of establishment.';
    if (!c.ownership) e['company.ownership'] = 'Select the ownership structure.';
    if (!ct.name) e['contact.name'] = 'Primary contact person is required.';
    if (!U.isEmail(ct.email)) e['contact.email'] = 'Enter a valid e-mail address.';
    if (!U.isMobile(ct.mobile)) e['contact.mobile'] = 'Enter a valid 10-digit mobile number.';
    if (!U.isPAN(st.pan)) e['statutory.pan'] = 'PAN format is invalid (AAAAA9999A).';
    if (!U.isGST(st.gst)) e['statutory.gst'] = 'GST number format is invalid (15 characters).';
    if (!st.state) e['statutory.state'] = 'Select the state of registration.';
    U.gstPanState(st.gst, st.pan, st.state).forEach((x) => { e['statutory.' + x.field] = x.msg; });
    if (o.pan && st.pan && st.pan !== o.pan) e['statutory.pan'] = 'PAN does not match the entity recommended by the buyer (' + o.pan + '). Contact the buyer if this is a different legal entity.';
    const addrs = r.addresses || [];
    if (!addrs.length) e.addresses = 'Add at least one address.';
    else if (addrs.length > 1 && addrs.filter((a) => a.primary).length !== 1) e.addresses = 'Mark exactly one address as primary.';
    addrs.forEach((a, i) => { if (!a.line || !a.city || !/^[0-9]{6}$/.test(a.pin || '')) e['addresses.' + i] = 'Address ' + (i + 1) + ': line, city and a 6-digit PIN are required.'; });
    if (fin.netWorth === '' || fin.netWorth == null || isNaN(U.num(fin.netWorth))) e['financial.netWorth'] = 'Net worth is required.';
    const cibil = U.num(fin.cibil); if (!(cibil >= 300 && cibil <= 900)) e['financial.cibil'] = 'Credit score must be between 300 and 900.';
    if (!fin.holder) e['financial.holder'] = 'Account holder name is required.';
    if (!U.isAcct(fin.accountNo)) e['financial.accountNo'] = 'Account number must be 9–18 digits.';
    if (!U.isIFSC(fin.ifsc)) e['financial.ifsc'] = 'IFSC format is invalid (e.g. SAMP0001234).';
    if (!r.nda || !r.nda.file) e.nda = 'Upload the duly signed NDA (shared by the buyer outside the portal).';
    if (!r.coc || !r.coc.ack) e.coc = 'Acknowledge the Supplier Code of Conduct.';
    const m = r.msme || {};
    if (m.is) { if (!m.certNo) e['msme.certNo'] = 'MSME certificate number is required.'; if (!m.validTill || U.isPast(m.validTill)) e['msme.validTill'] = 'MSME certificate must be valid (future validity date).'; if (!m.file) e['msme.file'] = 'Upload the MSME certificate.'; }
    const docs = r.docs || {}; Onb.requiredDocs(o.cats).forEach((d) => { if (d === 'Signed NDA') return; if (!docs[d]) e['docs.' + d] = d + ' is required.'; });
    const { questions } = Onb.applicableQuestions(o.cats); const ans = r.answers || {};
    const missing = questions.filter((q) => ans[q.id] === undefined || ans[q.id] === '' || ans[q.id] === null);
    if (missing.length) e.answers = missing.length + ' self-assessment question(s) are unanswered.';
    return e;
  };
  Onb.submitRegistration = function (id) {
    const o = get(id); const me = PH.requireRole('vendor');
    PH.assert(me.onbId === id || me.role === 'system', 'You can only submit your own registration.', 'FORBIDDEN');
    PH.assert(o.stage === 'registration', 'Registration cannot be submitted at this stage.');
    const e = Onb.validateRegistration(o);
    if (Object.keys(e).length) PH.fail('Registration has ' + Object.keys(e).length + ' issue(s) to fix before submission.', 'VALIDATION', e);
    const hit = PH.Sys.lookupVendor({ pan: o.reg.statutory.pan, gst: o.reg.statutory.gst });
    PH.assert(!hit, 'A vendor record (' + (hit && hit.code) + ') already exists for this legal entity.', 'DUPLICATE');
    o.selfScore = Onb.scoreSelf(o.cats, o.reg.answers);
    o.regSubmittedAt = now();
    const depts = Onb.requiredDepts(o.cats);
    o.reviews = depts.map((d) => ({ dept: d, verdict: null, score: null, remarks: '', by: null, at: null }));
    o.stage = 'review'; log(o, 'Registration submitted (cycle ' + o.cycle + ') – self-assessment ' + o.selfScore.overall + '%');
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: { roles: ['buyer'].concat(depts.map((d) => Onb.DEPT_ROLE[d])) }, title: 'Registration submitted: ' + o.vendorName, body: 'Internal review can start (' + (o.mode === 'sequential' ? 'sequential' : 'parallel') + ' workflow).', link: '#/onboarding/' + o.id });
    return o;
  };
  Onb.returnToVendor = function (id, remarks) {
    const o = get(id); PH.requireRole('buyer');
    PH.assert(['review', 'third_party', 'audit_decision', 'consolidation'].includes(o.stage), 'Request cannot be returned from this stage.');
    PH.assert(remarks && remarks.trim().length >= 5, 'Tell the vendor what must be corrected.');
    o.cycles.push({ cycle: o.cycle, submittedAt: o.regSubmittedAt, selfScore: o.selfScore, reviews: U.clone(o.reviews), reg: U.clone(o.reg), returnedRemarks: remarks });
    o.cycle += 1; o.stage = 'registration'; o.reviews = []; o.selfScore = null; o.regSubmittedAt = null; o.thirdParty = null; o.auditDecision = {}; o.auditRequired = null; o.audit = null; o.consolidation = null;
    log(o, 'Returned to vendor for re-submission (cycle ' + o.cycle + '): ' + remarks);
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: { users: [o.invitation.userId] }, title: 'Please update your registration', body: remarks, link: '#/onboarding/' + o.id });
    return o;
  };
  Onb.setMode = function (id, mode) { const o = get(id); PH.requireRole('buyer'); PH.assert(['sequential', 'parallel'].includes(mode), 'Invalid mode'); PH.assert(!o.reviews.some((r) => r.verdict), 'Mode cannot change once reviews have started.'); o.mode = mode; log(o, 'Review mode set to ' + mode); return o; };

  // ---- Step 5: internal review ----
  Onb.canReview = (o, dept) => {
    if (o.stage !== 'review') return false; const r = o.reviews.find((x) => x.dept === dept); if (!r || r.verdict) return false;
    if (o.mode === 'sequential') { const first = o.reviews.find((x) => !x.verdict); return first && first.dept === dept; }
    return true;
  };
  Onb.review = function (id, dept, verdict, score, remarks) {
    const o = get(id); PH.requireRole(Onb.DEPT_ROLE[dept] || '__none');
    PH.assert(o.stage === 'review', 'Internal review is only possible after the vendor has submitted registration.');
    const r = o.reviews.find((x) => x.dept === dept); PH.assert(r, Onb.DEPT_LABEL[dept] + ' is not a required reviewer for this vendor category.');
    PH.assert(!r.verdict, 'This review has already been recorded.');
    PH.assert(Onb.canReview(o, dept), 'Sequential workflow: an earlier review must be completed first.');
    PH.assert(['recommend', 'not_recommend'].includes(verdict), 'Choose a verdict.');
    const sc = U.num(score); PH.assert(score !== '' && sc >= 0 && sc <= 100, 'Score must be between 0 and 100.');
    if (verdict === 'not_recommend') PH.assert(remarks && remarks.trim().length >= 5, 'Remarks are mandatory when not recommending.');
    Object.assign(r, { verdict, score: sc, remarks: remarks || '', by: PH.actor().name, at: now() });
    log(o, Onb.DEPT_LABEL[dept] + ' review: ' + verdict + ' (' + sc + ')');
    if (o.reviews.every((x) => x.verdict)) { o.stage = 'third_party'; log(o, 'Internal review complete'); }
    return o;
  };

  // ---- Step 6: third-party assessment (recorded only) ----
  Onb.recordThirdParty = function (id, f) {
    const o = get(id); PH.requireRole('buyer');
    PH.assert(o.stage === 'third_party', 'Internal review must be completed before recording the third-party assessment.');
    const e = {}; if (!f.agency) e.agency = 'Agency name is required.'; if (!f.date) e.date = 'Assessment date is required.'; if (f.score === '' || f.score == null || U.num(f.score) < 0 || U.num(f.score) > 100) e.score = 'Score 0–100 is required.'; if (!f.result) e.result = 'Select the overall result.'; if (!f.findings || f.findings.trim().length < 5) e.findings = 'Findings are required.';
    if (Object.keys(e).length) PH.fail('Complete the assessment record.', 'VALIDATION', e);
    o.thirdParty = { agency: f.agency, date: f.date, score: U.num(f.score), result: f.result, findings: f.findings, file: f.file || null, recordedBy: PH.actor().name, at: now() };
    o.stage = 'audit_decision'; log(o, 'Third-party assessment recorded (' + f.agency + ', ' + f.score + ')');
    PH.Notify.push({ type: 'pending_audit', ref: o.id, to: { roles: ['buyer', 'quality'] }, title: 'Decide on physical audit: ' + o.vendorName, body: 'SCM and QC must jointly decide whether a physical audit is required.', link: '#/onboarding/' + o.id });
    return o;
  };

  // ---- Step 7: joint audit decision (SCM + QC) & audit ----
  Onb.decideAudit = function (id, who, required, remarks) {
    const o = get(id); PH.requireRole(who === 'scm' ? 'buyer' : who === 'qc' ? 'quality' : '__none');
    PH.assert(o.stage === 'audit_decision', 'Audit decision is not pending.');
    o.auditDecision[who] = { required: !!required, remarks: remarks || '', by: PH.actor().name, at: now() };
    const s = o.auditDecision.scm, q = o.auditDecision.qc;
    if (s && q) {
      if (s.required !== q.required) { o.auditDecision.conflict = true; log(o, 'Audit decision conflict – SCM and QC must align'); return o; }
      o.auditDecision.conflict = false; o.auditRequired = s.required;
      if (o.auditRequired) { o.stage = 'audit'; log(o, 'Physical audit required (SCM + QC agree)'); PH.Notify.push({ type: 'pending_audit', ref: o.id, to: { roles: ['quality'] }, title: 'Physical audit to be scheduled: ' + o.vendorName, body: 'Complete the audit using the configured checklist; evidence is mandatory.', link: '#/onboarding/' + o.id }); }
      else { o.stage = 'consolidation'; log(o, 'Physical audit not required (SCM + QC agree)'); }
    } else log(o, who.toUpperCase() + ' audit decision recorded');
    return o;
  };
  Onb.recordAudit = function (id, f) {
    const o = get(id); PH.requireRole('quality');
    PH.assert(o.stage === 'audit', 'No physical audit is pending for this request.');
    const e = {}; if (!f.date) e.date = 'Audit date is required.'; if (!f.auditor) e.auditor = 'Lead auditor is required.'; if (!f.outcome) e.outcome = 'Final audit outcome is required.';
    (PH.cfg().auditChecklist).forEach((c) => { const x = (f.checklist || []).find((y) => y.id === c.id); if (!x || !x.result) e['chk.' + c.id] = 'Select a result.'; else if (x.result !== 'na' && !(x.evidence && x.evidence.trim())) e['chk.' + c.id] = 'Evidence is mandatory.'; });
    if (!f.findings || f.findings.trim().length < 5) e.findings = 'Findings are required.';
    if (Object.keys(e).length) PH.fail('Audit record is incomplete.', 'VALIDATION', e);
    const pts = { pass: 100, minor: 60, major: 0 }; const scored = f.checklist.filter((x) => x.result !== 'na');
    const score = scored.length ? U.round(U.avg(scored.map((x) => pts[x.result])), 1) : 0;
    o.audit = { date: f.date, auditor: f.auditor, checklist: f.checklist, observations: f.observations || '', findings: f.findings, recommendations: f.recommendations || '', outcome: f.outcome, score, by: PH.actor().name, at: now() };
    o.stage = 'consolidation'; log(o, 'Physical audit recorded: ' + f.outcome + ' (' + score + ')');
    return o;
  };

  // ---- Step 8–9: consolidation & decision ----
  Onb.consolidate = function (o) {
    const w = Object.assign({}, PH.cfg().onboardingWeights);
    const internal = o.reviews.length ? U.round(U.avg(o.reviews.map((r) => r.score || 0)), 1) : 0;
    const parts = { self: o.selfScore ? o.selfScore.overall : 0, internal, thirdParty: o.thirdParty ? o.thirdParty.score : 0, audit: o.audit ? o.audit.score : null };
    if (parts.audit == null) delete w.audit;
    const tw = U.sum(Object.values(w)); const composite = U.round(Object.keys(w).reduce((a, k) => a + parts[k] * w[k], 0) / tw, 1);
    const flags = [];
    if (o.selfScore && o.selfScore.critical.length) flags.push('Critical self-assessment question(s) failed: ' + o.selfScore.critical.join(', '));
    if (o.reviews.some((r) => r.verdict === 'not_recommend')) flags.push('Not recommended by: ' + o.reviews.filter((r) => r.verdict === 'not_recommend').map((r) => Onb.DEPT_LABEL[r.dept]).join(', '));
    if (o.thirdParty && o.thirdParty.result === 'unsatisfactory') flags.push('Third-party assessment unsatisfactory');
    if (o.audit && o.audit.outcome === 'unsatisfactory') flags.push('Physical audit unsatisfactory');
    const recommendation = composite >= PH.cfg().questionnaire.passMark && !flags.length ? 'qualify' : 'not_qualify';
    return { parts, weights: w, composite, flags, recommendation };
  };
  Onb.decide = function (id, decision, remarks) {
    const o = get(id); PH.requireRole('buyer');
    PH.assert(o.stage === 'consolidation', 'Consolidation is not pending.');
    const c = Onb.consolidate(o); o.consolidation = c;
    if (decision === 'reject') { PH.assert(remarks && remarks.trim().length >= 5, 'Rejection remarks are mandatory.'); o.stoppedAt = o.stage; o.stage = 'rejected'; o.decision = { approved: false, by: PH.actor().name, at: now(), remarks }; log(o, 'Qualification decision: rejected'); return o; }
    PH.assert(decision === 'approve', 'Invalid decision');
    if (c.recommendation === 'not_qualify') PH.assert(remarks && remarks.trim().length >= 15, 'Approving a vendor the consolidation does not recommend needs a justification (min 15 characters).');
    o.decision = { approved: true, by: PH.actor().name, at: now(), remarks: remarks || '' };
    o.approvals = [{ role: 'Head Operations', group: 1 }, { role: 'Head Quality', group: 1 }, { role: 'Head Procurement', group: 2 }, { role: 'Head Finance', group: 3 }].map((a) => Object.assign(a, { name: PH.cfg().approvers[a.role] || PH.cfg().approvers['Head of Procurement'], status: 'pending', by: null, at: null, remarks: '' }));
    o.stage = 'approval'; log(o, 'Qualified – sent for executive approval');
    PH.Notify.push({ type: 'pending_approval', ref: o.id, to: { roles: ['approver'] }, title: 'Vendor approval pending: ' + o.vendorName, body: 'Head Operations and Head Quality (parallel), then Head Procurement, then Head Finance.', link: '#/approvals' });
    return o;
  };

  // ---- Step 10: executive approval (Operations ∥ Quality → Procurement → Finance) ----
  Onb.nextApprovals = (o) => { const p = o.approvals.filter((a) => a.status === 'pending'); if (!p.length) return []; const g = Math.min(...p.map((a) => a.group)); return p.filter((a) => a.group === g); };
  Onb.approve = function (id, role, decision, remarks) {
    const o = get(id); PH.requireRole('approver');
    PH.assert(o.stage === 'approval', 'Request is not awaiting executive approval.');
    const step = o.approvals.find((a) => a.role === role); PH.assert(step, 'Unknown approval step.');
    PH.assert(step.status === 'pending', 'This approval is already recorded.');
    PH.assert(Onb.nextApprovals(o).includes(step), 'Approval order: ' + role + ' can act only after the earlier approval group is complete (Operations & Quality → Procurement → Finance).');
    PH.assert(['approved', 'rejected'].includes(decision), 'Invalid decision');
    if (decision === 'rejected') PH.assert(remarks && remarks.trim().length >= 5, 'Rejection remarks are mandatory.');
    Object.assign(step, { status: decision, by: step.name, at: now(), remarks: remarks || '' });
    log(o, role + ' ' + decision);
    if (decision === 'rejected') { o.stoppedAt = o.stage; o.stage = 'rejected'; o.decision = { approved: false, by: step.name, at: now(), remarks: role + ' rejected: ' + remarks }; return o; }
    if (o.approvals.every((a) => a.status === 'approved')) {
      o.stage = 'setup'; log(o, 'All approvals complete – vendor ID creation initiated');
      o.erp = { msgId: null, sentAt: now(), code: null };
      const msg = PH.Sys.send('VENDOR_CREATE', { onbId: o.id, name: o.reg.company.name, pan: o.reg.statutory.pan, gst: o.reg.statutory.gst, cats: o.cats, msme: !!(o.reg.msme && o.reg.msme.is), paymentTerms: o.reg.msme && o.reg.msme.is ? 'PT30' : 'PT60', address: (o.reg.addresses.find((a) => a.primary) || o.reg.addresses[0]), bank: { ifsc: o.reg.financial.ifsc, holder: o.reg.financial.holder } }, o.id);
      o.erp.msgId = msg.id;
    }
    return o;
  };
  // vendor ID issued
  Onb.vendorCreated = function (onbId, code) {
    const o = get(onbId); const db = PH.db(); const r = o.reg;
    const vid = 'V-' + U.pad(db.vendors.length + 1, 2);
    const base = { delivery: 70, quality: 70, commercial: 70, participation: 70, responsiveness: 70, compliance: 80, engagement: 60 };
    const v = { id: vid, code, name: r.company.name, pan: r.statutory.pan, gst: r.statutory.gst, state: r.statutory.state, cats: o.cats.slice(), status: 'active', purchasingBlock: false, msme: r.msme && r.msme.is ? { is: true, certNo: r.msme.certNo, validTill: r.msme.validTill } : { is: false }, paymentTerms: r.msme && r.msme.is ? 'PT30' : 'PT60', addresses: r.addresses, contact: r.contact, bank: { holder: r.financial.holder, accountNo: r.financial.accountNo, ifsc: r.financial.ifsc, bankName: r.financial.bankName || '' }, financial: { netWorth: r.financial.netWorth, cibil: r.financial.cibil }, ownership: r.company.ownership, onboardedAt: now(), lastActivityAt: now(), consecutiveHigh: 0, perf: { cur: Object.assign({}, base), prev: Object.assign({}, base) }, history: [{ at: now(), text: 'Onboarded via ' + o.id + ' (code ' + code + ')', by: 'System' }], onbId: o.id, alerts: {}, sysStatus: 'Active' };
    db.vendors.push(v);
    const u = db.users.find((x) => x.id === o.invitation.userId); if (u) u.vendorId = vid;
    o.vendorId = vid; o.erp.code = code; o.erp.doneAt = now(); o.stage = 'active';
    log(o, 'Vendor code ' + code + ' issued – portal account activated');
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: { vendorId: vid, roles: ['buyer', 'finance'] }, title: 'Vendor active: ' + v.name + ' (' + code + ')', body: 'Vendor code issued and portal access activated. Eligible for RFQs.', link: '#/vendors/' + vid });
    return v;
  };

  Onb.cancel = function (id, reason) {
    const o = get(id); PH.requireRole('buyer'); PH.assert(Onb.isOpen(o), 'Only open requests can be cancelled.');
    PH.assert(reason && reason.trim().length >= 5, 'A cancellation reason is mandatory (the record is retained for audit).');
    o.stoppedAt = o.stage; o.stage = 'cancelled'; o.decision = { approved: false, by: PH.actor().name, at: now(), remarks: 'Cancelled: ' + reason }; log(o, 'Cancelled: ' + reason); return o;
  };
  Onb.addQuery = function (id, text) {
    const o = get(id); const me = PH.actor(); PH.assert(text && text.trim(), 'Write your message.');
    PH.assert(me.role === 'buyer' || (me.role === 'vendor' && me.onbId === id), 'Only the buyer and the invited vendor can exchange queries.', 'FORBIDDEN');
    o.queries.push({ by: me.name, role: me.role, at: now(), text: text.trim() }); PH.audit('onboarding', o.id, 'query', text.slice(0, 60));
    PH.Notify.push({ type: 'onboarding', ref: o.id, to: me.role === 'vendor' ? { roles: ['buyer'] } : { users: [o.invitation && o.invitation.userId].filter(Boolean) }, title: 'New query on ' + o.vendorName, body: text.slice(0, 120), link: '#/onboarding/' + o.id });
    return o;
  };
  Onb.counts = () => { const l = PH.db().onboarding; const s = (f) => l.filter(f).length; return { newReq: s((o) => ['screening', 'invite'].includes(o.stage)), underReview: s((o) => ['registration', 'review', 'third_party', 'consolidation', 'audit_decision'].includes(o.stage)), pendingAudit: s((o) => o.stage === 'audit'), pendingApproval: s((o) => o.stage === 'approval' || o.stage === 'setup'), approved: s((o) => o.stage === 'active'), rejected: s((o) => o.stage === 'rejected') }; };
})(typeof window !== 'undefined' ? window : globalThis);
