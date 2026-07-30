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
