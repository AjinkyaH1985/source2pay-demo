/* Source2Pay – default configuration & masters (all editable from Admin) */
(function (g) {
  const PH = (g.PH = g.PH || {});

  PH.ROLES = {
    buyer: { label: 'Procurement', internal: true },
    quality: { label: 'Quality', internal: true },
    design: { label: 'Design', internal: true },
    finance: { label: 'Finance', internal: true },
    ops: { label: 'Operations', internal: true },
    approver: { label: 'Approver', internal: true },
    leader: { label: 'Management', internal: true },
    admin: { label: 'Admin', internal: true },
    vendor: { label: 'Vendor', internal: false },
  };

  PH.EVENTS = [
    { type: 'pending_approval', label: 'Pending approvals', to: ['approver'], subject: 'Action required: approval pending for {ref}' },
    { type: 'onboarding', label: 'Onboarding update', to: ['buyer', 'vendor'], subject: 'Onboarding update: {ref}' },
    { type: 'rfq_assigned', label: 'RFQ assigned', to: ['vendor'], subject: 'New RFQ {ref} assigned to you' },
    { type: 'rfq_closed_no_response', label: 'RFQ closed – no response', to: ['vendor', 'buyer'], subject: 'RFQ {ref} closed without a response' },
    { type: 'rfq_award', label: 'RFQ award / not-selected update', to: ['vendor'], subject: 'RFQ {ref} outcome' },
    { type: 'pending_audit', label: 'Pending audits', to: ['quality'], subject: 'Audit pending for {ref}' },
    { type: 'pending_po_acceptance', label: 'Pending PO acceptance', to: ['vendor', 'buyer'], subject: 'PO {ref} awaiting acceptance' },
    { type: 'quality_inspection', label: 'Quality inspection', to: ['quality', 'vendor'], subject: 'Inspection update: {ref}' },
    { type: 'delivery_due', label: 'Delivery due', to: ['vendor', 'buyer'], subject: 'Delivery due soon for PO {ref}' },
    { type: 'grn_received', label: 'GRN received', to: ['vendor'], subject: 'GRN posted against PO {ref}' },
    { type: 'invoice_received', label: 'Invoice received', to: ['buyer', 'finance'], subject: 'Invoice received: {ref}' },
    { type: 'payment_scheduled', label: 'Payment scheduled / released', to: ['vendor'], subject: 'Payment update for invoice {ref}' },
    { type: 'dormant_alert', label: 'Dormant vendor alert', to: ['buyer', 'vendor'], subject: 'Vendor account status change: {ref}' },
    { type: 'msme_expiry', label: 'MSME expiry alert', to: ['vendor', 'buyer'], subject: 'MSME certificate expiry: {ref}' },
    { type: 'compliance_failure', label: 'Compliance failure alert', to: ['buyer', 'finance', 'vendor'], subject: 'Compliance failure: {ref}' },
    { type: 'rfq_no_response_alert', label: 'RFQ no-response alert', to: ['buyer'], subject: 'No response yet on RFQ {ref}' },
    { type: 'ticket_response', label: 'Ticket response alert', to: ['vendor', 'buyer'], subject: 'Ticket {ref} has a new response' },
    { type: 'material_rejection', label: 'Material rejection', to: ['vendor', 'buyer'], subject: 'Material rejected: {ref}' },
    { type: 'short_qty', label: 'Short quantity receipt', to: ['vendor', 'buyer'], subject: 'Short quantity received: {ref}' },
  ];

  PH.defaultConfig = function () {
    const cats = [
      ['C1', 'Trading of Catalogue Items'], ['C2', 'Services'], ['C3', 'Manufactured to Company Drawing / Print'],
      ['C4', 'Manufactured to Supplier Drawing / Print'], ['C5', 'Contract Manufacturing / Outsourcing'],
      ['C6', 'Standard Sourced Finished Goods'], ['C7', 'Engineering Sourced Finished Goods'], ['C8', 'Capital Goods'],
    ].map(([id, name]) => ({ id, name }));
    const ALL = cats.map((c) => c.id);
    const q = (id, section, text, type, weight, critical) => ({ id, section, text, type, weight, critical: !!critical });
    return {
      company: { name: 'Demo Company', short: 'Demo Company', city: '' },
      supplierCategories: cats,
      poCategories: [{ id: 'PO1', name: 'Standard Purchase Order' }, { id: 'PO2', name: 'Service Purchase Order' }, { id: 'PO3', name: 'Capital Purchase Order' }, { id: 'PO4', name: 'Subcontracting Purchase Order' }],
      paymentTerms: [
        { id: 'PT30', label: 'Net 30 days', days: 30, advance: 0 }, { id: 'PT45', label: 'Net 45 days', days: 45, advance: 0 },
        { id: 'PT60', label: 'Net 60 days', days: 60, advance: 0 }, { id: 'PT90', label: 'Net 90 days', days: 90, advance: 0 },
        { id: 'PT15', label: 'Net 15 days', days: 15, advance: 0 }, { id: 'ADV10', label: '10% advance, balance Net 30', days: 30, advance: 10 },
        { id: 'ADV30', label: '30% advance, balance Net 45', days: 45, advance: 30 },
      ],
      incoterms: ['EXW', 'FCA', 'FOB', 'CIF', 'DAP', 'DDP'].map((x) => ({ id: x, label: x })),
      taxStructures: [
        { id: 'GST18', label: 'GST 18% (IGST)', rate: 18 }, { id: 'GST18L', label: 'GST 18% (CGST + SGST)', rate: 18 },
        { id: 'GST12', label: 'GST 12%', rate: 12 }, { id: 'GST5', label: 'GST 5%', rate: 5 }, { id: 'GST0', label: 'Exempt / Nil rated', rate: 0 },
      ],
      uoms: ['EA', 'KG', 'M', 'SET', 'LOT', 'NOS'],
      businessUnits: [
        { id: 'HEV', name: 'Heavy Engineering', head: 'BU Head – Heavy Engineering' },
        { id: 'PRC', name: 'Precision Components', head: 'BU Head – Precision Components' },
        { id: 'IND', name: 'Industrial Solutions', head: 'BU Head – Industrial Solutions' },
      ],
      commodities: ['Forgings', 'Castings', 'Fasteners', 'Machined Parts', 'Electronics', 'Hydraulics', 'Capital Equipment', 'Services'],
      currencies: ['INR', 'USD', 'EUR'],

      // ----- onboarding configuration -----
      reviewMatrix: { // which departments must review each supplier category (union applies when multi-category)
        C1: ['purchase'], C2: ['purchase'], C3: ['purchase', 'quality'], C4: ['purchase', 'quality', 'design'],
        C5: ['finance', 'design', 'purchase', 'quality', 'operations'], C6: ['finance', 'purchase', 'quality', 'operations'],
        C7: ['finance', 'design', 'purchase', 'quality'], C8: ['finance', 'design', 'purchase', 'quality', 'operations'],
      },
      reviewOrder: ['purchase', 'finance', 'quality', 'design', 'operations'],
      questionnaire: {
        passMark: 70,
        sections: [
          { id: 'S1', name: 'Strategic Direction', cats: ALL, hint: 'Leadership, strategy, key customers and market focus' },
          { id: 'S2', name: 'Operational Capability', cats: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8'], hint: 'Facilities, workforce, equipment and production capability' },
          { id: 'S3', name: 'Process & Engineering Capability', cats: ['C3', 'C4', 'C5', 'C7', 'C8'], hint: 'Manufacturing processes, SOPs and work instructions' },
          { id: 'S4', name: 'Technical Documentation & Traceability', cats: ['C3', 'C4', 'C5', 'C7'], hint: 'PPAP, FAI, process qualification and traceability' },
          { id: 'S5', name: 'Technology & Automation', cats: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8'], hint: 'ERP usage, manufacturing technology and automation' },
          { id: 'S6', name: 'Procurement & Supply Chain Practices', cats: ['C5', 'C6', 'C7', 'C8'], hint: 'Sub-supplier evaluation, material certification, controls' },
          { id: 'S7', name: 'Workforce Capability', cats: ALL, hint: 'Training, skill levels and competency management' },
        ],
        questions: [
          q('Q1', 'S1', 'Is there a documented leadership structure with defined responsibilities?', 'yesno', 5),
          q('Q2', 'S1', 'Rate the maturity of your business strategy and 3-year plan', 'rating', 5),
          q('Q3', 'S1', 'Do you serve at least two recognised customers in this sector?', 'yesno', 5),
          q('Q4', 'S2', 'Rate your plant and equipment availability against our typical demand', 'rating', 10, true),
          q('Q5', 'S2', 'Rate your production capability (capacity headroom)', 'rating', 8),
          q('Q6', 'S3', 'Are SOPs and work instructions documented and controlled?', 'yesno', 8, true),
          q('Q7', 'S3', 'Rate your process engineering capability', 'rating', 8),
          q('Q8', 'S4', 'Do you maintain PPAP / First Article Inspection records?', 'yesno', 8),
          q('Q9', 'S4', 'Rate the strength of your batch / heat-lot traceability practices', 'rating', 8, true),
          q('Q10', 'S5', 'Is an ERP system used for planning and production?', 'yesno', 5),
          q('Q11', 'S5', 'Rate your level of automation / CNC capability', 'rating', 5),
          q('Q12', 'S6', 'Do you evaluate your own sub-suppliers periodically?', 'yesno', 6),
          q('Q13', 'S6', 'Are material test certificates obtained for every lot?', 'yesno', 8, true),
          q('Q14', 'S7', 'Do you run a structured training programme for operators?', 'yesno', 5),
          q('Q15', 'S7', 'Rate your workforce skill levels and competency management', 'rating', 5),
        ],
      },
      onboardingWeights: { self: 30, internal: 30, thirdParty: 20, audit: 20 },
      auditChecklist: [
        { id: 'A1', text: 'Facility layout, housekeeping and material flow' }, { id: 'A2', text: 'Calibration status of measuring equipment' },
        { id: 'A3', text: 'Material storage, FIFO and identification' }, { id: 'A4', text: 'In-process control and process monitoring' },
        { id: 'A5', text: 'Inspection and test facilities' }, { id: 'A6', text: 'Non-conformance and corrective action handling' },
        { id: 'A7', text: 'Safety, health and environment practices' }, { id: 'A8', text: 'Document and record control' },
      ],
      inspectionChecklist: [
        { id: 'I1', text: 'Dimensional check against drawing' }, { id: 'I2', text: 'Visual and surface finish' },
        { id: 'I3', text: 'Material test certificate verification' }, { id: 'I4', text: 'Functional / hardness / NDT test' },
        { id: 'I5', text: 'Marking, identification and traceability' }, { id: 'I6', text: 'Packing and preservation' },
      ],
      docRequirements: { // onboarding documents by supplier category ('*' applies to all)
        '*': ['PAN card', 'GST certificate', 'Cancelled cheque', 'Latest balance sheet', 'Signed NDA'],
        C3: ['ISO 9001 certificate'], C4: ['ISO 9001 certificate'], C5: ['ISO 9001 certificate', 'Process capability report'],
        C7: ['ISO 9001 certificate'], C8: ['OEM authorisation letter'],
      },
      qapDocs: { Forgings: ['QAP', 'Material test certificate', 'Heat-treatment record'], Castings: ['QAP', 'Material test certificate', 'NDT report'], default: ['QAP', 'Inspection report'] },
      rfqTemplates: [
        { id: 'T1', name: 'Standard Material RFQ', docs: ['Technical Drawing', 'Specification', 'Terms & Conditions'], paymentTerm: 'PT45', incoterm: 'DAP' },
        { id: 'T2', name: 'Services RFQ', docs: ['Scope of Work', 'Terms & Conditions'], paymentTerm: 'PT30', incoterm: 'DAP' },
        { id: 'T3', name: 'Capital Equipment RFQ', docs: ['Technical Specification', 'Scope of Supply', 'Terms & Conditions', 'Supporting Attachment'], paymentTerm: 'ADV10', incoterm: 'DDP' },
      ],

      // ----- commercial approval matrix (PAN) -----
      approvalLevels: ['Commodity Lead', 'Group Material Head', 'Program Manager', 'Business Unit Head', 'Finance Controller', 'SCM Head', 'CFO', 'CEO & President'],
      approvalMatrix: [ // value bands (INR, evaluated PO value) → level indexes
        { upTo: 1000000, levels: [0, 1] }, { upTo: 5000000, levels: [0, 1, 2, 3] },
        { upTo: 20000000, levels: [0, 1, 2, 3, 4, 5] }, { upTo: 100000000, levels: [0, 1, 2, 3, 4, 5, 6] }, { upTo: null, levels: [0, 1, 2, 3, 4, 5, 6, 7] },
      ],
      approvalConditions: { advanceAddsLevel: 4, advanceHighPct: 20, advanceHighAddsLevel: 6, shortTermDays: 30, shortTermAddsLevel: 5 },
      approvers: { 'Commodity Lead': 'Commodity Lead', 'Group Material Head': 'Group Material Head', 'Program Manager': 'Program Manager', 'Finance Controller': 'Finance Controller', 'SCM Head': 'SCM Head', CFO: 'CFO', 'CEO & President': 'CEO & President', 'Head Design': 'Head Design', 'Head QC': 'Head QC', 'Head Finance': 'Head Finance' },
      approvalSlaDays: 2,

      // ----- governance & rules -----
      rules: {
        dormantMonths: 6, closedMonths: 12, maxNegotiationRounds: 3, minQuotesForPan: 3, lowPerformerBelow: 60,
        consecutiveHighRfqBlock: 7, msmeDeadlineMonth: 12, msmeDeadlineDay: 31, msmeExpiryNoticeDays: 45,
        msmeTermsCompliant: 30, msmeTermsNonCompliant: 60, deliveryDueDays: 7, rfqDefaultAccessDays: 30, ticketSlaDays: 2,
      },
      perfWeights: { delivery: 25, quality: 25, commercial: 15, participation: 10, responsiveness: 10, compliance: 10, engagement: 5 },
      ticketCategories: [
        { id: 'general', name: 'General', owner: 'buyer' }, { id: 'rfq', name: 'RFQ / Commercial', owner: 'buyer' },
        { id: 'drawing', name: 'Drawing / Technical', owner: 'design', forward: ['PMO', 'Head of Design', 'Head of BU'] }, { id: 'po', name: 'Purchase Order', owner: 'buyer' },
        { id: 'grn', name: 'GRN / Receipt', owner: 'buyer' }, { id: 'invoice', name: 'Invoice & Payment', owner: 'finance' },
        { id: 'compliance', name: 'Compliance / MSME', owner: 'finance' }, { id: 'onboarding', name: 'Onboarding', owner: 'buyer' },
      ],
      notifications: Object.fromEntries(PH.EVENTS.map((e) => [e.type, { enabled: true, cc: '' }])),
      flowMode: 'auto',
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
