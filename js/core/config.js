/* Source2Pay – default configuration & masters (all editable from Admin) */
(function (g) {
  const PH = (g.PH = g.PH || {});

  PH.ROLES = {
    buyer: { label: 'Procurement', internal: true },
    quality: { label: 'Quality', internal: true },
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
      ['C1', 'General supplies & consumables'], ['C2', 'Services'], ['C3', 'Raw materials'],
      ['C4', 'Components & parts'], ['C5', 'Contract manufacturing / outsourcing'],
      ['C6', 'Finished goods'], ['C7', 'Packaging materials'], ['C8', 'Capital equipment'],
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
        { id: 'MFG', name: 'Manufacturing', head: 'BU Head – Manufacturing' },
        { id: 'RTL', name: 'Retail & Distribution', head: 'BU Head – Retail & Distribution' },
        { id: 'COR', name: 'Corporate Services', head: 'BU Head – Corporate Services' },
      ],
      commodities: ['Raw materials', 'Components', 'Packaging', 'General supplies', 'Capital equipment', 'Services', 'Electronics', 'Logistics'],
      currencies: ['INR', 'USD', 'EUR'],

      // ----- onboarding configuration -----
      reviewMatrix: { // which departments must review each supplier category (union applies when multi-category)
        C1: ['purchase'], C2: ['purchase'], C3: ['purchase', 'quality'], C4: ['purchase', 'quality', 'operations'],
        C5: ['purchase', 'finance', 'quality', 'operations'], C6: ['purchase', 'finance', 'quality', 'operations'],
        C7: ['purchase', 'finance', 'quality'], C8: ['purchase', 'finance', 'quality', 'operations'],
      },
      reviewOrder: ['purchase', 'finance', 'quality', 'operations'],
      questionnaire: {
        passMark: 70,
        sections: [
          { id: 'S1', name: 'Company & governance', cats: ALL, hint: 'Management, stability and customer base' },
          { id: 'S2', name: 'Capacity & delivery', cats: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8'], hint: 'Ability to meet volumes and delivery dates' },
          { id: 'S3', name: 'Quality management', cats: ['C3', 'C4', 'C5', 'C6', 'C7', 'C8'], hint: 'Quality system and checks before dispatch' },
          { id: 'S4', name: 'Process & documentation', cats: ['C4', 'C5', 'C6', 'C8'], hint: 'Procedures and traceability' },
          { id: 'S5', name: 'Financial & commercial', cats: ALL, hint: 'Financial standing and pricing stability' },
          { id: 'S6', name: 'Ethics, safety & sustainability', cats: ALL, hint: 'Conduct, safety and environment' },
          { id: 'S7', name: 'Systems & continuity', cats: ['C2', 'C4', 'C5', 'C6', 'C8'], hint: 'Systems and continuity planning' },
        ],
        questions: [
          q('Q1', 'S1', 'Is there a documented management structure with defined responsibilities?', 'yesno', 5),
          q('Q2', 'S1', 'Rate the stability of your business over the last three years', 'rating', 5),
          q('Q3', 'S1', 'Do you currently supply at least two other recognised customers?', 'yesno', 5),
          q('Q4', 'S2', 'Rate your capacity to meet our expected order volumes', 'rating', 10, true),
          q('Q5', 'S2', 'Rate your on-time delivery track record', 'rating', 8),
          q('Q6', 'S3', 'Do you have a documented quality management system?', 'yesno', 8, true),
          q('Q7', 'S3', 'Rate how consistently you check goods before dispatch', 'rating', 8),
          q('Q8', 'S4', 'Are standard operating procedures documented and kept up to date?', 'yesno', 8),
          q('Q9', 'S4', 'Rate the traceability of your orders from source to delivery', 'rating', 8, true),
          q('Q10', 'S5', 'Are audited financial statements available for the last two years?', 'yesno', 5),
          q('Q11', 'S5', 'Rate your ability to offer competitive and stable pricing', 'rating', 5),
          q('Q12', 'S6', 'Do you have a written code of conduct covering ethics and anti-bribery?', 'yesno', 6),
          q('Q13', 'S6', 'Do you comply with applicable safety and environmental regulations?', 'yesno', 8, true),
          q('Q14', 'S7', 'Do you have a business continuity plan for supply disruptions?', 'yesno', 5),
          q('Q15', 'S7', 'Rate the maturity of the systems you use to manage orders and stock', 'rating', 5),
        ],
      },
      onboardingWeights: { self: 30, internal: 30, thirdParty: 20, audit: 20 },
      auditChecklist: [
        { id: 'A1', text: 'Premises, housekeeping and layout' }, { id: 'A2', text: 'Equipment and tool maintenance' },
        { id: 'A3', text: 'Storage, handling and identification' }, { id: 'A4', text: 'Process controls and monitoring' },
        { id: 'A5', text: 'Checking and testing facilities' }, { id: 'A6', text: 'Handling of complaints and corrective action' },
        { id: 'A7', text: 'Health, safety and environment practices' }, { id: 'A8', text: 'Document and record control' },
      ],
      inspectionChecklist: [
        { id: 'I1', text: 'Quantity and specification match the order' }, { id: 'I2', text: 'Visual condition and finish' },
        { id: 'I3', text: 'Certificates and documents verified' }, { id: 'I4', text: 'Sample / functional test' },
        { id: 'I5', text: 'Labelling and traceability' }, { id: 'I6', text: 'Packing and preservation' },
      ],
      docRequirements: { // onboarding documents by supplier category ('*' applies to all)
        '*': ['PAN card', 'GST certificate', 'Cancelled cheque', 'Latest balance sheet', 'Signed NDA'],
        C3: ['Quality certification'], C4: ['Quality certification'], C5: ['Quality certification', 'Capability statement'],
        C6: ['Quality certification'], C7: ['Quality certification'], C8: ['Authorised dealer letter'],
      },
      qapDocs: { 'Raw materials': ['Quality plan', 'Test certificate', 'Batch record'], Packaging: ['Quality plan', 'Test certificate', 'Sample approval'], default: ['Quality plan', 'Inspection report'] },
      rfqTemplates: [
        { id: 'T1', name: 'Standard goods RFQ', docs: ['Specification', 'Quality requirements', 'Terms & Conditions'], paymentTerm: 'PT45', incoterm: 'DAP' },
        { id: 'T2', name: 'Services RFQ', docs: ['Scope of Work', 'Terms & Conditions'], paymentTerm: 'PT30', incoterm: 'DAP' },
        { id: 'T3', name: 'Capital equipment RFQ', docs: ['Technical Specification', 'Scope of Supply', 'Terms & Conditions', 'Supporting Attachment'], paymentTerm: 'ADV10', incoterm: 'DDP' },
      ],

      // ----- commercial approval matrix (PAN) -----
      approvalLevels: ['Category Manager', 'Procurement Manager', 'Project Owner', 'Business Unit Head', 'Finance Manager', 'Head of Procurement', 'CFO', 'Managing Director'],
      approvalMatrix: [ // value bands (INR, evaluated PO value) → level indexes
        { upTo: 1000000, levels: [0, 1] }, { upTo: 5000000, levels: [0, 1, 2, 3] },
        { upTo: 20000000, levels: [0, 1, 2, 3, 4, 5] }, { upTo: 100000000, levels: [0, 1, 2, 3, 4, 5, 6] }, { upTo: null, levels: [0, 1, 2, 3, 4, 5, 6, 7] },
      ],
      approvalConditions: { advanceAddsLevel: 4, advanceHighPct: 20, advanceHighAddsLevel: 6, shortTermDays: 30, shortTermAddsLevel: 5 },
      approvers: { 'Category Manager': 'Category Manager', 'Procurement Manager': 'Procurement Manager', 'Project Owner': 'Project Owner', 'Finance Manager': 'Finance Manager', 'Head of Procurement': 'Head of Procurement', CFO: 'CFO', 'Managing Director': 'Managing Director', 'Head Operations': 'Head of Operations', 'Head Quality': 'Head of Quality', 'Head Procurement': 'Head of Procurement', 'Head Finance': 'Head of Finance' },
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
        { id: 'technical', name: 'Technical / specification', owner: 'quality', forward: ['Project office', 'Head of Quality', 'Head of BU'] }, { id: 'po', name: 'Purchase Order', owner: 'buyer' },
        { id: 'grn', name: 'GRN / Receipt', owner: 'buyer' }, { id: 'invoice', name: 'Invoice & Payment', owner: 'finance' },
        { id: 'compliance', name: 'Compliance / MSME', owner: 'finance' }, { id: 'onboarding', name: 'Onboarding', owner: 'buyer' },
      ],
      notifications: Object.fromEntries(PH.EVENTS.map((e) => [e.type, { enabled: true, cc: '' }])),
      flowMode: 'auto',
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
