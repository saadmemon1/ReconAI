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
