'use client';
import { ReconciliationReport, Finding, LineItem } from '@/engine/reconcile';
import { Card } from './ui/card';

const severityColors: Record<string, string> = {
  critical: 'text-destructive',
  high: 'text-warning',
  medium: 'text-secondary',
  low: 'text-muted-foreground',
};

const severityBg: Record<string, string> = {
  critical: 'bg-destructive/5 border-destructive/20',
  high: 'bg-warning/5 border-warning/20',
  medium: 'bg-secondary/5 border-secondary/20',
  low: 'bg-muted/5 border-muted/20',
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

  const totalItems = aggKPIs.matchedLineItems + aggKPIs.mismatchedLineItems;
  const matchRate = totalItems > 0 ? (aggKPIs.matchedLineItems / totalItems * 100) : 0;

  return (
    <div className="space-y-8">
      {/* Aggregated KPIs */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Key Performance Indicators</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KPIBox label="Match Rate" value={`${matchRate.toFixed(1)}%`} />
          <KPIBox label="Matched Items" value={aggKPIs.matchedLineItems} />
          <KPIBox label="Mismatches" value={aggKPIs.mismatchedLineItems} />
          <KPIBox label="Overbilling" value={`$${aggKPIs.overbillingAmount.toFixed(2)}`} />
          <KPIBox label="Total PO" value={`$${aggKPIs.totalPO.toFixed(2)}`} />
          <KPIBox label="Total Receipt" value={`$${aggKPIs.totalReceipt.toFixed(2)}`} />
          <KPIBox label="Total Invoice" value={`$${aggKPIs.totalInvoice.toFixed(2)}`} />
          <KPIBox label="Unsupported Charges" value={`$${aggKPIs.unsupportedCharges.toFixed(2)}`} />
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
          {sortedFindings.map(f => (
            <FindingCard key={f.id} finding={f} />
          ))}
        </div>
      </Card>

      {/* Per-Group Line Items */}
      {groups.map(group => (
        <Card key={group.id} className="p-6">
          <h3 className="text-h3 mb-1">{group.description}</h3>
          <p className="text-xs text-secondary mb-4">
            {group.documents.map(d => {
              const cls = documentClassifications.find(c => c.document === d);
              return cls ? `${cls.fileName} (${cls.type.replace(/_/g, ' ')})` : `Doc ${d}`;
            }).join(' · ')}
          </p>
          <LineItemsTable lineItems={group.lineItems} />
        </Card>
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

      {/* Summary */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Summary</h3>
        <p className="text-sm whitespace-pre-wrap">{summary}</p>
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

      {/* LLM Reasoning (collapsible) */}
      {(report as any).llmReasoning && (
        <details className="group">
          <summary className="cursor-pointer text-sm font-medium text-secondary hover:text-foreground select-none py-2">
            <span className="inline-flex items-center gap-2">
              <span className="text-xs transition-transform group-open:rotate-90">▶</span>
              LLM Reasoning (thinking process)
            </span>
          </summary>
          <Card className="p-4 mt-2 bg-muted/50">
            <pre className="text-xs whitespace-pre-wrap font-mono text-secondary leading-relaxed max-h-96 overflow-y-auto">
              {(report as any).llmReasoning}
            </pre>
          </Card>
        </details>
      )}
    </div>
  );
}

function KPIBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="bg-muted rounded-lg p-3">
      <p className="text-xs text-secondary mb-1">{label}</p>
      <p className="text-h2 font-mono">{value}</p>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  return (
    <div className={`border rounded-lg p-4 ${severityBg[finding.severity]}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <span className={`text-xs font-semibold uppercase ${severityColors[finding.severity]}`}>
            {finding.severity}
          </span>
          <span className="text-xs text-secondary ml-2">· {finding.category.replace(/_/g, ' ')}</span>
          <span className="text-xs text-secondary ml-2">· {finding.document}</span>
        </div>
        <span className="text-xs text-secondary font-mono">{finding.id}</span>
      </div>
      <p className="text-sm mb-2">{finding.description}</p>
      {finding.expected && finding.actual && (
        <div className="text-xs text-secondary mb-2">
          Expected: {finding.expected} → Actual: {finding.actual}
        </div>
      )}
      {finding.sourceCitations.length > 0 && (
        <div className="mt-2">
          <p className="text-xs font-medium text-secondary mb-1">Source Evidence:</p>
          {finding.sourceCitations.map((cite, i) => (
            <blockquote key={i} className="text-xs text-secondary border-l-2 border-border pl-2 mb-1 italic">
              {cite}
            </blockquote>
          ))}
        </div>
      )}
    </div>
  );
}

function LineItemsTable({ lineItems }: { lineItems: LineItem[] }) {
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
              <td className="text-right py-2 px-2">{li.poUnitPrice != null ? `$${li.poUnitPrice.toFixed(2)}` : '-'}</td>
              <td className="text-right py-2 px-2">{li.receiptQuantity ?? '-'}</td>
              <td className="text-right py-2 px-2">{li.invoiceQuantity ?? '-'}</td>
              <td className="text-right py-2 px-2">{li.invoiceUnitPrice != null ? `$${li.invoiceUnitPrice.toFixed(2)}` : '-'}</td>
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
    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${severityBg[severity]}`}>
      <span className={`text-sm font-semibold ${severityColors[severity]}`}>{label}</span>
      <span className="text-sm font-mono">{count}</span>
    </div>
  );
}
