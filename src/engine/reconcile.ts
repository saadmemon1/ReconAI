// === Types ===

export interface Segment {
  index: number;
  content: string;
  type?: string;
}

export interface ReconciliationDocument {
  segments: Segment[];
  fileName: string;
}

export interface ReconciliationInput {
  documents: ReconciliationDocument[];  // LLM will identify which is PO/Receipt/Invoice
  modelId: string;
  tolerancePercent?: number;
  currency?: string;
}

export interface KPIs {
  totalPO: number;
  totalReceipt: number;
  totalInvoice: number;
  matchedLineItems: number;
  mismatchedLineItems: number;
  missingLineItems: number;
  extraLineItems: number;
  matchRate: number;
  overbillingAmount: number;
  unsupportedCharges: number;
  evidenceGaps: number;
}

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type FindingCategory =
  | 'overbilling'
  | 'quantity_mismatch'
  | 'price_mismatch'
  | 'missing_item'
  | 'extra_item'
  | 'unsupported_charge'
  | 'evidence_gap'
  | 'calculation_error';

export interface Finding {
  id: string;
  severity: Severity;
  category: FindingCategory;
  document: string;
  description: string;
  expected?: string;
  actual?: string;
  sourceCitations: string[];
}

export interface LineItem {
  description: string;
  poQuantity?: number;
  poUnitPrice?: number;
  poTotal?: number;
  receiptQuantity?: number;
  invoiceQuantity?: number;
  invoiceUnitPrice?: number;
  invoiceTotal?: number;
  status: 'matched' | 'partial' | 'mismatched' | 'missing_in_receipt' | 'missing_in_invoice';
  findingIds: string[];
}

export interface DocumentClassification {
  document: number;
  type: 'purchase_order' | 'receipt' | 'invoice' | 'other';
  fileName: string;
}

export interface ReconciliationGroup {
  id: string;
  documents: number[];
  description: string;
  kpis: KPIs;
  findings: Finding[];
  lineItems: LineItem[];
}

export interface ReconciliationReport {
  documentClassifications: DocumentClassification[];
  groups: ReconciliationGroup[];
  unmatchedDocuments: number[];
  summary: string;
  modelUsed: string;
  timestamp: string;
}

export interface ReconciliationResult {
  report: ReconciliationReport;
  parseDuration: number;
  reconcileDuration: number;
}

// === Prompt Builder ===

function buildReconciliationPrompt(input: ReconciliationInput): string {
  const tolerance = input.tolerancePercent ?? 5;
  const currency = input.currency ?? 'USD';

  const docSections = input.documents.map((doc, i) => {
    const content = doc.segments
      .sort((a, b) => a.index - b.index)
      .map(s => s.content)
      .join('\n\n');
    return `[DOCUMENT ${i + 1}: ${doc.fileName}]\n${content}`;
  }).join('\n\n---\n\n');

  return `You are a financial document reconciliation auditor. Reconcile the following documents.

${docSections}

## Instructions

1. **Classify** each document by type: Purchase Order, Goods Receipt/Receiving Report, Invoice, or Other. Classify based on content (PO numbers, receipt confirmations, invoice/billing language, tax lines, payment terms).

2. **Group** related documents. Match Purchase Orders to their corresponding Invoices and Receipts by cross-referencing PO numbers, vendor names, dates, and line items. Documents that don't clearly relate to others should be flagged as unmatched.

3. **Extract** all line items from every document. For each line item, capture: description, quantity, unit price, and total amount.

4. **Match** line items across documents within each group. Use fuzzy matching for minor wording differences.

5. **Compare** quantities, prices, and totals within each document group.

6. **Flag** discrepancies in these categories:

### Finding Categories
- **overbilling**: Invoice charges exceed PO agreed prices
- **quantity_mismatch**: Quantities differ between documents
- **price_mismatch**: Unit prices differ between documents
- **missing_item**: Item in PO but not in receipt or invoice
- **extra_item**: Item in invoice that has no corresponding PO line
- **unsupported_charge**: Invoice line item with no PO match at all
- **evidence_gap**: Invoice quantity exceeds what was actually received
- **calculation_error**: quantity × unit_price ≠ total on any document

### Severity Rules
- **critical**: Overbilling > 10%, unsupported charges, items billed but not received
- **high**: Quantity or price mismatch > ${tolerance}%
- **medium**: Discrepancies between ${tolerance / 2}% and ${tolerance}%
- **low**: Minor formatting, rounding < ${tolerance / 2}%, or informational

### Source Citations
For EVERY finding, include EXACT quotes from the document text as evidence. Format as: "doc_name: line X: 'quoted text'"

### Tolerances
- Price and quantity differences under ${tolerance}% of PO value are considered acceptable
- Rounding differences under $0.50 are acceptable
- Currency: ${currency}

## Output Format

Return ONLY valid JSON in this EXACT structure (no markdown, no explanation outside the JSON):

\`\`\`json
{
  "documentClassifications": [
    { "document": 1, "type": "purchase_order" | "receipt" | "invoice" | "other", "fileName": "..." },
    ...
  ],
  "groups": [
    {
      "id": "group_1",
      "documents": [1, 2, 3],
      "description": "PO-456 / Receipt / Invoice - Vendor ABC",
      "kpis": { ... same KPI structure ... },
      "findings": [ ... findings for this group ... ],
      "lineItems": [ ... line items for this group ... ]
    }
  ],
  "unmatchedDocuments": [5],
  "summary": "..."
}
\`\`\`

Remember: Return ONLY the JSON object. No additional text, no markdown code blocks.`;
}

// === JSON Parser (robust against LLM wrapping in markdown) ===

function extractJSON(text: string): string {
  // Strip markdown code blocks if present
  const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) return jsonMatch[1].trim();
  
  // Try to find JSON object boundaries
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return text.slice(start, end + 1);
  }
  
  return text.trim();
}

// === Validation ===

function validateReport(data: unknown): ReconciliationReport {
  const r = data as ReconciliationReport;
  
  if (!r.documentClassifications || !Array.isArray(r.groups) || !r.summary) {
    throw new Error('Reconciliation report missing required fields (documentClassifications, groups, summary)');
  }
  
  // Sanitize each group's KPIs — fill missing with 0, coerce types
  const requiredKPIs = ['totalPO', 'totalReceipt', 'totalInvoice', 'matchedLineItems', 
    'mismatchedLineItems', 'missingLineItems', 'extraLineItems', 'matchRate', 
    'overbillingAmount', 'unsupportedCharges', 'evidenceGaps'];
  
  for (const group of r.groups) {
    if (!group.kpis) {
      group.kpis = {} as any;
    }
    for (const kpi of requiredKPIs) {
      const val = (group.kpis as any)[kpi];
      if (typeof val !== 'number') {
        (group.kpis as any)[kpi] = parseFloat(val) || 0;
      }
    }
    
    // Validate findings
    for (const f of (group.findings || [])) {
      if (!f.severity || !f.category || !f.description) {
        throw new Error(`Group "${group.id}": finding missing required fields`);
      }
      f.id = f.id || `F${String(Math.random()).slice(2, 8)}`;
    }
    
    // Assign findingIds to line items
    group.lineItems = (group.lineItems || []).map(li => ({
      ...li,
      findingIds: li.findingIds || [],
    }));
  }
  
  return r;
}

// === Main Engine ===

export async function reconcile(
  input: ReconciliationInput,
  llmCall: (prompt: string) => Promise<string>
): Promise<ReconciliationResult> {
  const parseStart = Date.now();
  
  // Validate input
  if (input.documents.length < 2) {
    throw new Error('Need at least 2 documents to reconcile');
  }

  const parseDuration = Date.now() - parseStart;
  const reconcileStart = Date.now();
  
  // Build prompt
  const prompt = buildReconciliationPrompt(input);
  
  // Call LLM
  const response = await llmCall(prompt);
  
  // Parse JSON
  const json = extractJSON(response);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error(`Failed to parse LLM response as JSON. Response starts with: ${response.slice(0, 200)}`);
  }
  
  // Validate
  const report = validateReport(parsed);
  report.modelUsed = input.modelId;
  report.timestamp = new Date().toISOString();
  
  const reconcileDuration = Date.now() - reconcileStart;
  
  return { report, parseDuration, reconcileDuration };
}
