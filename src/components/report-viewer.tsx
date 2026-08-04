'use client';
import { ReconciliationReport, Finding, LineItem } from '@/engine/reconcile';
import { Card } from './ui/card';
import {
  overbillingTone,
  recommendedPayable,
  overbilledPercent,
  Tone,
} from '@/lib/kpi-utils';

function formatCurrency(currency: string): string {
  // Use the currency code itself (PKR, USD) — auto-detected by the LLM
  return `${currency} `;
}

const severityColors: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  medium: 'text-secondary',
  low: 'text-muted-foreground',
};

export function ReportViewer({ report }: { report: ReconciliationReport }) {
  const { documentClassifications, groups, unmatchedDocuments, summary, timestamp } = report;

  const allFindings = groups.flatMap(g => g.findings);
  const sortedFindings = [...allFindings].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  const criticalCount = sortedFindings.filter(f => f.severity === 'critical').length;
  const highCount = sortedFindings.filter(f => f.severity === 'high').length;
  const mediumCount = sortedFindings.filter(f => f.severity === 'medium').length;
  const lowCount = sortedFindings.filter(f => f.severity === 'low').length;

  // Aggregate KPIs
  const aggKPIs = groups.reduce((acc, g) => ({
    totalPO: acc.totalPO + (g.kpis.totalPO || 0),
    totalReceipt: acc.totalReceipt + (g.kpis.totalReceipt || 0),
    totalInvoice: acc.totalInvoice + (g.kpis.totalInvoice || 0),
    matchedLineItems: acc.matchedLineItems + (g.kpis.matchedLineItems || 0),
    mismatchedLineItems: acc.mismatchedLineItems + (g.kpis.mismatchedLineItems || 0),
    overbillingAmount: acc.overbillingAmount + (g.kpis.overbillingAmount || 0),
    unsupportedCharges: acc.unsupportedCharges + (g.kpis.unsupportedCharges || 0),
    evidenceGaps: acc.evidenceGaps + (g.kpis.evidenceGaps || 0),
  }), { totalPO: 0, totalReceipt: 0, totalInvoice: 0, matchedLineItems: 0, mismatchedLineItems: 0, overbillingAmount: 0, unsupportedCharges: 0, evidenceGaps: 0 });

  const totalBilled = aggKPIs.totalInvoice;
  const totalOverbilled = aggKPIs.overbillingAmount + aggKPIs.unsupportedCharges;
  const payable = recommendedPayable(totalBilled, aggKPIs.overbillingAmount, aggKPIs.unsupportedCharges);
  const obPercent = overbilledPercent(totalOverbilled, totalBilled);
  const currency = report.currency || 'USD';

  const formatMoney = (n: number) => `${formatCurrency(currency)}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

  return (
    <div className="space-y-8">
      {/* Core KPIs: Billed / Payable / Overbilled */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Key Results</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="animate-scale-in"><KPIBox label="Total Billed" value={formatMoney(totalBilled)} tone="neutral" /></div>
          <div className="animate-scale-in" style={{ animationDelay: '60ms' }}>
            <KPIBox 
              label="Recommended Payable" 
              value={formatMoney(payable)}
              tone={payable < totalBilled ? 'good' : 'neutral'}
            />
          </div>
          <div className="animate-scale-in" style={{ animationDelay: '120ms' }}>
            <KPIBox 
              label="Total Overbilled" 
              value={formatMoney(totalOverbilled)} 
              tone={overbillingTone(totalOverbilled)}
              sub={obPercent === null ? undefined : `${obPercent.toFixed(1)}% of billed`}
            />
          </div>
        </div>
      </Card>

      {/* Summary (executive summary, directly under KPIs) */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Summary</h3>
        <p className="text-base leading-relaxed whitespace-pre-wrap">{summary}</p>
        <div className="text-xs text-secondary mt-4 space-y-1">
          <p>
            Classification: {documentClassifications.map(c => (
              <span key={c.document}>
                Doc {c.document} → <strong className="capitalize">{c.type.replace(/_/g, ' ')}</strong>
                {c !== documentClassifications[documentClassifications.length - 1] ? ' · ' : ''}
              </span>
            ))}
          </p>
          <p>Model: {report.modelUsed}</p>
          <p>Generated: {new Date(timestamp).toLocaleString()}</p>
        </div>
      </Card>

      {/* Findings Summary */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Findings by Severity</h3>
        <div className="flex gap-4 mb-6">
          <SeverityBadge label="Critical" count={criticalCount} severity="critical" />
          <SeverityBadge label="High" count={highCount} severity="high" />
          <SeverityBadge label="Medium" count={mediumCount} severity="medium" />
          <SeverityBadge label="Low" count={lowCount} severity="low" />
        </div>

        <div className="space-y-3">
          {sortedFindings.length === 0 ? (
            <p className="text-sm text-secondary">No discrepancies found.</p>
          ) : (
            <FindingsTable findings={sortedFindings} />
          )}
        </div>
      </Card>

      {/* Per-Group Line Items */}
      {groups.map((group, gi) => (
        <div key={group.id} className="animate-fade-up" style={{ animationDelay: `${gi * 60}ms` }}>
          <Card className="p-6">
          <h3 className="text-h3 mb-1">{group.description}</h3>
          <p className="text-xs text-secondary mb-4">
            {group.documents.map(d => {
              const cls = documentClassifications.find(c => c.document === d);
              return cls ? `${cls.fileName} (${cls.type.replace(/_/g, ' ')})` : `Doc ${d}`;
            }).join(' · ')}
          </p>
          <LineItemsTable lineItems={group.lineItems} currency={currency} />
          </Card>
        </div>
      ))}

      {/* Unmatched */}
      {unmatchedDocuments.length > 0 && (
        <Card className="p-6 border-warning/20">
          <h3 className="text-h3 mb-4 text-warning">Unmatched Documents</h3>
          <p className="text-sm text-secondary">
            These documents could not be grouped with any others:
          </p>
          <ul className="list-disc pl-4 mt-2 text-sm">
            {unmatchedDocuments.map(d => {
              const cls = documentClassifications.find(c => c.document === d);
              return <li key={d}>{cls?.fileName || `Doc ${d}`}</li>;
            })}
          </ul>
        </Card>
      )}

    </div>
  );
}

function KPIBox({ label, value, sub, tone }: { 
  label: string; 
  value: string | number; 
  sub?: string;
  tone?: Tone 
}) {
  const toneClasses: Record<Tone, string> = {
    good: 'text-success',
    warn: 'text-warning',
    bad: 'text-destructive',
    neutral: '',
  };
  return (
    <div className="bg-muted rounded-lg p-3 border border-border">
      <p className="text-xs text-secondary mb-1">{label}</p>
      <p className={`text-h2 font-mono ${tone ? toneClasses[tone] : ''}`}>{value}</p>
      {sub && <p className="text-xs text-secondary mt-1">{sub}</p>}
    </div>
  );
}

function FindingsTable({ findings }: { findings: Finding[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium">Severity</th>
            <th className="text-left py-2 px-2 font-medium">Category</th>
            <th className="text-left py-2 px-2 font-medium">Doc</th>
            <th className="text-left py-2 px-2 font-medium">Description</th>
            <th className="text-left py-2 px-2 font-medium">Expected → Actual</th>
            <th className="text-left py-2 pl-2 font-medium">Evidence</th>
          </tr>
        </thead>
        <tbody>
          {findings.map(f => (
            <tr key={f.id} className="border-b border-border align-top">
              <td className={`py-3 pr-4 font-semibold uppercase text-xs ${severityColors[f.severity]}`}>
                {f.severity}
              </td>
              <td className="py-3 px-2 text-xs text-secondary whitespace-nowrap">
                {f.category.replace(/_/g, ' ')}
              </td>
              <td className="py-3 px-2 text-xs text-secondary font-mono">
                {f.document}
              </td>
              <td className="py-3 px-2 text-base leading-relaxed">{f.description}</td>
              <td className="py-3 px-2 text-sm text-secondary whitespace-nowrap">
                {f.expected && f.actual ? `${f.expected} → ${f.actual}` : '-'}
              </td>
              <td className="py-3 pl-2">
                {f.sourceCitations.length > 0 ? (
                  <ul className="space-y-1">
                    {f.sourceCitations.map((cite, i) => (
                      <li key={i} className="text-sm text-secondary border-l-2 border-border pl-2 italic">
                        {cite}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-sm text-secondary">-</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LineItemsTable({ lineItems, currency }: { lineItems: LineItem[]; currency: string }) {
  const fmt = (n: number) => `${formatCurrency(currency)}${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium">Item</th>
            <th className="text-right py-2 px-2 font-medium">PO Qty</th>
            <th className="text-right py-2 px-2 font-medium">PO Price</th>
            <th className="text-right py-2 px-2 font-medium">Rec Qty</th>
            <th className="text-right py-2 px-2 font-medium">Inv Qty</th>
            <th className="text-right py-2 px-2 font-medium">Inv Price</th>
            <th className="text-right py-2 pl-2 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((li, i) => (
            <tr key={i} className="border-b border-border">
              <td className="py-2 pr-4">{li.description}</td>
              <td className="text-right py-2 px-2">{li.poQuantity ?? '-'}</td>
              <td className="text-right py-2 px-2">{li.poUnitPrice != null ? fmt(li.poUnitPrice) : '-'}</td>
              <td className="text-right py-2 px-2">{li.receiptQuantity ?? '-'}</td>
              <td className="text-right py-2 px-2">{li.invoiceQuantity ?? '-'}</td>
              <td className="text-right py-2 px-2">{li.invoiceUnitPrice != null ? fmt(li.invoiceUnitPrice) : '-'}</td>
              <td className="text-right py-2 pl-2">
                <span className={`text-xs ${
                  li.status === 'matched' ? 'text-success' : 'text-warning'
                }`}>
                  {(li.status || 'unknown').replace(/_/g, ' ')}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SeverityBadge({ label, count, severity }: { 
  label: string; count: number; severity: string 
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border bg-muted/40`}>
      <span className={`text-sm font-semibold ${severityColors[severity]}`}>{label}</span>
      <span className="text-sm font-mono">{count}</span>
    </div>
  );
}
