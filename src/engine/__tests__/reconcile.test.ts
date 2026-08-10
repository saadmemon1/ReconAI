import { describe, test, expect } from 'bun:test';
import { reconcile } from '../reconcile';

const mockLLM = (report: object) => async () => JSON.stringify(report);

test('validates minimum 2 documents', async () => {
  await expect(reconcile({ documents: [{ segments: [], fileName: 'a.pdf' }], modelId: 'x' }, mockLLM({})))
    .rejects.toThrow('Need at least 2');
});

test('handles valid multi-group report', async () => {
  const report = {
    documentClassifications: [
      { document: 1, type: 'purchase_order', fileName: 'po.pdf' },
      { document: 2, type: 'invoice', fileName: 'inv.pdf' },
      { document: 3, type: 'receipt', fileName: 'rec.pdf' },
      { document: 4, type: 'purchase_order', fileName: 'po2.pdf' },
      { document: 5, type: 'invoice', fileName: 'inv2.pdf' },
    ],
    groups: [
      { id: 'g1', documents: [1,2,3], description: 'Set A', kpis: { totalPO: 100, totalReceipt: 100, totalInvoice: 100, matchedLineItems: 5, mismatchedLineItems: 0, missingLineItems: 0, extraLineItems: 0, matchRate: 100, overbillingAmount: 0, unsupportedCharges: 0, evidenceGaps: 0 }, findings: [], lineItems: [] },
      { id: 'g2', documents: [4,5], description: 'Set B (no receipt)', kpis: { totalPO: 50, totalReceipt: 0, totalInvoice: 55, matchedLineItems: 0, mismatchedLineItems: 1, missingLineItems: 0, extraLineItems: 0, matchRate: 0, overbillingAmount: 5, unsupportedCharges: 0, evidenceGaps: 0 }, findings: [], lineItems: [] },
    ],
    unmatchedDocuments: [5],
    summary: 'Two sets reconciled.',
  };
  
  const result = await reconcile(
    { documents: Array(5).fill({ segments: [{ index: 0, content: 'test' }], fileName: 'doc.pdf' }), modelId: 'x' },
    mockLLM(report)
  );
  
  expect(result.report.groups).toHaveLength(2);
  expect(result.report.unmatchedDocuments).toEqual([5]);
  expect(result.report.documentClassifications).toHaveLength(5);
});

// --- Payable derivation (engine-authored from KPIs) ---

const derivationDocs = () =>
  Array(5).fill({ segments: [{ index: 0, content: 'test' }], fileName: 'doc.pdf' });

test('appends the engine-computed payable derivation to the summary', async () => {
  const report = {
    documentClassifications: [],
    groups: [
      { id: 'g1', documents: [1, 2, 3], description: 'A', kpis: { totalInvoice: 100, overbillingAmount: 0, unsupportedCharges: 0 }, findings: [], lineItems: [] },
      { id: 'g2', documents: [4, 5], description: 'B', kpis: { totalInvoice: 55, overbillingAmount: 5, unsupportedCharges: 0 }, findings: [], lineItems: [] },
    ],
    unmatchedDocuments: [],
    summary: 'Two sets reconciled.',
    currency: 'PKR',
  };

  const { report: r } = await reconcile({ documents: derivationDocs(), modelId: 'x' }, mockLLM(report));
  // 100 + 55 billed, 5 overbilled → 150 payable (bold + color = engine-formatted)
  expect(r.summary).toContain('Billed **PKR 155** − Overbilled **[danger]PKR 5** = Recommended payable **[success]PKR 150**');
  expect(r.summary).toContain('Two sets reconciled.');
});

test('replaces an LLM-written derivation with the engine-computed one', async () => {
  const report = {
    documentClassifications: [],
    groups: [
      { id: 'g1', documents: [1, 2, 3], description: 'A', kpis: { totalInvoice: 100, overbillingAmount: 0, unsupportedCharges: 0 }, findings: [], lineItems: [] },
      { id: 'g2', documents: [4, 5], description: 'B', kpis: { totalInvoice: 55, overbillingAmount: 5, unsupportedCharges: 0 }, findings: [], lineItems: [] },
    ],
    unmatchedDocuments: [],
    // Model ignored the instruction and wrote a wrong derivation
    summary: 'Two sets reconciled.\n\nBilled PKR 100 − Overbilled PKR 0 = Recommended payable PKR 100',
  };

  const { report: r } = await reconcile({ documents: derivationDocs(), modelId: 'x' }, mockLLM(report));
  expect(r.summary).toContain('Billed **155** − Overbilled **[danger]5** = Recommended payable **[success]150**');
  expect(r.summary).not.toContain('Billed PKR 100');
});

test('formats thousands separators and clamps payable at zero', async () => {
  const report = {
    documentClassifications: [],
    groups: [
      { id: 'g1', documents: [1, 2], description: 'A', kpis: { totalInvoice: 8874, overbillingAmount: 1674, unsupportedCharges: 0 }, findings: [], lineItems: [] },
      { id: 'g2', documents: [3, 4], description: 'B', kpis: { totalInvoice: 50, overbillingAmount: 80, unsupportedCharges: 0 }, findings: [], lineItems: [] },
    ],
    unmatchedDocuments: [],
    summary: 'x',
    currency: 'PKR',
  };

  const { report: r } = await reconcile({ documents: derivationDocs(), modelId: 'x' }, mockLLM(report));
  expect(r.summary).toContain('Billed **PKR 8,924** − Overbilled **[danger]PKR 1,754** = Recommended payable **[success]PKR 7,170**');
  expect(r.summary).not.toContain('− PKR'); // currency appears per-figure, not doubled
});

test('stamps fileId onto classifications from the input document order', async () => {
  const report = {
    documentClassifications: [
      { document: 1, type: 'purchase_order', fileName: 'po.pdf' },
      { document: 2, type: 'invoice', fileName: 'inv.pdf' },
      { document: 3, type: 'receipt', fileName: 'rec.pdf' },
    ],
    groups: [{
      id: 'g1', documents: [1, 2, 3], description: 'Set', kpis: {
        totalPO: 100, totalReceipt: 100, totalInvoice: 100, matchedLineItems: 3,
        mismatchedLineItems: 0, missingLineItems: 0, extraLineItems: 0, matchRate: 100,
        overbillingAmount: 0, unsupportedCharges: 0, evidenceGaps: 0,
      }, findings: [], lineItems: [],
    }],
    unmatchedDocuments: [],
    summary: 's',
  };

  const result = await reconcile(
    {
      documents: [
        { fileId: 'FILE-A', segments: [{ index: 0, content: 'x' }], fileName: 'po.pdf' },
        { fileId: 'FILE-B', segments: [{ index: 0, content: 'x' }], fileName: 'inv.pdf' },
        { fileId: 'FILE-C', segments: [{ index: 0, content: 'x' }], fileName: 'rec.pdf' },
      ],
      modelId: 'x',
    },
    mockLLM(report)
  );

  expect(result.report.documentClassifications.map(c => c.fileId)).toEqual(['FILE-A', 'FILE-B', 'FILE-C']);
});

test('out-of-range classification index clamps to a safe document', async () => {
  const report = {
    documentClassifications: [
      { document: 99, type: 'purchase_order', fileName: 'po.pdf' },
      { document: -3, type: 'invoice', fileName: 'inv.pdf' },
    ],
    groups: [],
    unmatchedDocuments: [],
    summary: 's',
  };

  const result = await reconcile(
    {
      documents: [
        { fileId: 'FILE-A', segments: [{ index: 0, content: 'x' }], fileName: 'a.pdf' },
        { fileId: 'FILE-B', segments: [{ index: 0, content: 'x' }], fileName: 'b.pdf' },
      ],
      modelId: 'x',
    },
    mockLLM(report)
  );

  // 99 clamps to the last document (FILE-B), -3 clamps to the first (FILE-A).
  expect(result.report.documentClassifications.map(c => c.fileId)).toEqual(['FILE-B', 'FILE-A']);
});

// --- Supplier emails + email drafts ---

const supplierFixture = (extra: object = {}) => ({
  documentClassifications: [
    { document: 1, type: 'purchase_order', fileName: 'po.pdf' },
    { document: 2, type: 'invoice', fileName: 'inv.pdf' },
  ],
  groups: [{
    id: 'g1', documents: [1, 2], description: 'Set', kpis: {
      totalPO: 100, totalReceipt: 100, totalInvoice: 120, matchedLineItems: 3,
      mismatchedLineItems: 1, missingLineItems: 0, extraLineItems: 0, matchRate: 90,
      overbillingAmount: 20, unsupportedCharges: 0, evidenceGaps: 0,
    },
    findings: [{
      id: 'F1', severity: 'high', category: 'price_mismatch', document: 'inv.pdf',
      description: 'Unit price charged is higher than PO agreed price',
      expected: '450', actual: '470', sourceCitations: [],
    }],
    lineItems: [],
  }],
  unmatchedDocuments: [],
  summary: 's',
  currency: 'PKR',
  supplierEmails: [
    { groupId: 'g1', businessName: 'ABC Trading', email: 'billing@abc.com' },
  ],
  ...extra,
});

const supplierDocs = () => [
  // The document text carries the supplier emails — supplierEmails entries
  // are verified against it (invented addresses are replaced/ dropped).
  { fileId: 'FILE-A', segments: [{ index: 0, content: 'x billing@abc.com ok@abc.com hi@other.com' }], fileName: 'po.pdf' },
  { fileId: 'FILE-B', segments: [{ index: 0, content: 'x' }], fileName: 'inv.pdf' },
];

test('supplierEmails: drops malformed, duplicate, and unknown-group entries', async () => {
  const report = supplierFixture({
    supplierEmails: [
      { groupId: 'g1', businessName: 'ABC Trading', email: 'billing@abc.com' },
      { groupId: 'g1', businessName: 'ABC Trading', email: 'billing@abc.com' }, // duplicate
      { groupId: 'g1', email: 'not-an-email' },                                 // malformed
      { groupId: 'nope', businessName: 'X', email: 'x@y.com' },                 // unknown group
      { groupId: 'g1', businessName: '  ', email: '  ok@abc.com  ' },           // trims, blank name
    ],
  });
  const { report: r } = await reconcile({ documents: supplierDocs(), modelId: 'x' }, mockLLM(report));
  expect(r.supplierEmails).toEqual([
    { groupId: 'g1', businessName: 'ABC Trading', email: 'billing@abc.com' },
    { groupId: 'g1', businessName: undefined, email: 'ok@abc.com' },
  ]);
});

test('verifies supplier emails against the documents and recovers the real address', async () => {
  // The LLM reported an invented .example address; the document actually
  // contains the real one — the engine must swap it in, not keep the fake.
  const docs = [
    { fileId: 'FILE-A', segments: [{ index: 0, content: 'Contact: sales@kpprint.com.pk' }], fileName: 'po.pdf' },
    { fileId: 'FILE-B', segments: [{ index: 0, content: 'x' }], fileName: 'inv.pdf' },
  ];
  const report = supplierFixture({
    supplierEmails: [{ groupId: 'g1', businessName: 'Karachi Print', email: 'sales@kpprint.example' }],
  });
  const { report: r } = await reconcile({ documents: docs, modelId: 'x' }, mockLLM(report));
  expect(r.supplierEmails).toEqual([
    { groupId: 'g1', businessName: 'Karachi Print', email: 'sales@kpprint.com.pk' },
  ]);
  // The draft targets the RECOVERED address, never the invented one.
  expect(r.emailDrafts![0].to).toBe('sales@kpprint.com.pk');
});

test('drops a supplier email when no address exists in the documents', async () => {
  const docs = [
    { fileId: 'FILE-A', segments: [{ index: 0, content: 'no email anywhere' }], fileName: 'po.pdf' },
    { fileId: 'FILE-B', segments: [{ index: 0, content: 'x' }], fileName: 'inv.pdf' },
  ];
  const report = supplierFixture({
    supplierEmails: [{ groupId: 'g1', businessName: 'X', email: 'made-up@nowhere.test' }],
  });
  const { report: r } = await reconcile({ documents: docs, modelId: 'x' }, mockLLM(report));
  expect(r.supplierEmails).toEqual([]);
  expect(r.emailDrafts).toEqual([]);
});

test('keeps the LLM-drafted email when the report includes emailDrafts', async () => {
  const draft = {
    to: 'billing@abc.com',
    subject: 'Discrepancy review - KPP order',
    body: 'Dear ABC Trading,\n\nPlease review the invoice.\n\nBest regards,',
  };
  const { report: r } = await reconcile(
    { documents: supplierDocs(), modelId: 'x' },
    mockLLM(supplierFixture({ emailDrafts: [draft] }))
  );
  expect(r.emailDrafts).toEqual([draft]);
});

test('drops invalid emailDrafts and templates the missing supplier', async () => {
  const report = supplierFixture({
    emailDrafts: [
      { to: 'not-a-real@', subject: 'x', body: 'y' },                      // malformed recipient
      { to: 'other@x.com', subject: 'x', body: 'y' },                      // not a sanitized supplier
      { to: 'billing@abc.com', subject: '   ', body: 'y' },                // blank subject
      { to: 'billing@abc.com', subject: 'Good', body: 'Real draft body' }, // valid
    ],
  });
  const { report: r } = await reconcile({ documents: supplierDocs(), modelId: 'x' }, mockLLM(report));
  expect(r.emailDrafts).toEqual([{ to: 'billing@abc.com', subject: 'Good', body: 'Real draft body' }]);
});

test('single LLM call: drafts ride the same response as the report', async () => {
  let calls = 0;
  const spy = async () => {
    calls++;
    return JSON.stringify(supplierFixture({
      emailDrafts: [{ to: 'billing@abc.com', subject: 'S', body: 'B' }],
    }));
  };
  const { report: r } = await reconcile({ documents: supplierDocs(), modelId: 'x' }, spy);
  expect(calls).toBe(1);
  expect(r.emailDrafts).toEqual([{ to: 'billing@abc.com', subject: 'S', body: 'B' }]);
});

test('falls back to the template when the LLM omits emailDrafts', async () => {
  const { report: r } = await reconcile({ documents: supplierDocs(), modelId: 'x' }, mockLLM(supplierFixture()));
  expect(r.emailDrafts).toHaveLength(1);
  const d = r.emailDrafts![0];
  expect(d.to).toBe('billing@abc.com');
  expect(d.subject).toBe('Invoice discrepancies - inv');
  expect(d.body).toContain('Dear ABC Trading,');
  expect(d.body).toContain('[HIGH] Unit price charged is higher than PO agreed price');
  expect(d.body).toContain('(expected: PKR 450, actual: PKR 470)');
  expect(d.body).toContain('billed PKR 120; overbilled PKR 20');
  expect(d.body).toContain('Best regards,');
});

test('no supplierEmails → emailDrafts empty', async () => {
  const { report: r } = await reconcile(
    { documents: supplierDocs(), modelId: 'x' },
    mockLLM(supplierFixture({ supplierEmails: undefined }))
  );
  expect(r.emailDrafts).toEqual([]);
});

test('a supplier whose group has no findings gets no draft', async () => {
  const report = supplierFixture({
    supplierEmails: [
      { groupId: 'g1', businessName: 'ABC Trading', email: 'billing@abc.com' },
      { groupId: 'g2', businessName: 'Other Co', email: 'hi@other.com' },
    ],
    groups: [
      ...supplierFixture().groups,
      { id: 'g2', documents: [1, 2], description: 'Empty group', kpis: { totalPO: 0, totalReceipt: 0, totalInvoice: 0, matchedLineItems: 0, mismatchedLineItems: 0, missingLineItems: 0, extraLineItems: 0, matchRate: 0, overbillingAmount: 0, unsupportedCharges: 0, evidenceGaps: 0 }, findings: [], lineItems: [] },
    ],
  });
  const { report: r } = await reconcile({ documents: supplierDocs(), modelId: 'x' }, mockLLM(report));
  expect(r.emailDrafts).toEqual([{ to: 'billing@abc.com', subject: 'Invoice discrepancies - inv', body: expect.stringContaining('[HIGH]') }]);
});
