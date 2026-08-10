'use client';
import { useState } from 'react';
import { Eye } from 'lucide-react';
import { ReconciliationReport, Finding, /* LineItem (disabled with the line-items table), */ ReconciliationGroup, DocumentClassification } from '@/engine/reconcile';
import { renderInlineFormatting } from '@/lib/format-inline';
import { cn } from '@/lib/utils';
import { attributeCitations, roleLabel, type MindmapFileNode } from '@/lib/evidence-utils';
import { EvidenceMindmap } from './ui/evidence-mindmap';
import { EvidencePdfViewer } from './ui/evidence-pdf-viewer';
import { Card } from './ui/card';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { Dialog, DialogContent, DialogTitle } from './ui/dialog';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
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
  medium: 'text-blue-600',
  low: 'text-muted-foreground',
};

// Persistent filled pills for the findings table status badges — always
// visible (no hover dependency), with a distinct color per severity.
const severityBadgeColors: Record<string, string> = {
  critical: 'bg-destructive/15 text-destructive border-destructive/40',
  high: 'bg-warning/15 text-warning border-warning/40',
  medium: 'bg-blue-500/15 text-blue-600 border-blue-500/40',
  low: 'bg-muted text-muted-foreground border-border',
};

// Solid dot colors for the 3-pane compact rail (severity → dot fill).
const DOT_COLORS: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-blue-500',
  low: 'bg-slate-400',
};

export function ReportViewer({ report }: { report: ReconciliationReport }) {
  const { documentClassifications, groups, unmatchedDocuments, summary, timestamp } = report;
  const [activeSeverities, setActiveSeverities] = useState<Set<string>>(new Set());

  const allFindings = groups.flatMap(g => g.findings);
  const sortedFindings = [...allFindings].sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  // Severity filter: empty set = show all; clicking toggles membership
  const toggleSeverity = (sev: string) => {
    setActiveSeverities(prev => {
      const next = new Set(prev);
      if (next.has(sev)) next.delete(sev);
      else next.add(sev);
      return next;
    });
  };
  const filteredFindings = activeSeverities.size === 0
    ? sortedFindings
    : sortedFindings.filter(f => activeSeverities.has(f.severity));

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
        <p className="text-base leading-relaxed whitespace-pre-wrap">{renderInlineFormatting(summary)}</p>

        <div className="text-xs text-secondary mt-4 space-y-1">
          <p>Generated: {new Date(timestamp).toLocaleString()}</p>
        </div>
      </Card>

      {/* Findings Summary */}
      <Card className="p-6">
        <h3 className="text-h3 mb-4">Findings by Severity</h3>
        <div className="flex gap-4 mb-6">
          <SeverityBadge label="Critical" count={criticalCount} severity="critical" active={activeSeverities.has('critical')} onClick={() => toggleSeverity('critical')} />
          <SeverityBadge label="High" count={highCount} severity="high" active={activeSeverities.has('high')} onClick={() => toggleSeverity('high')} />
          <SeverityBadge label="Medium" count={mediumCount} severity="medium" active={activeSeverities.has('medium')} onClick={() => toggleSeverity('medium')} />
          <SeverityBadge label="Low" count={lowCount} severity="low" active={activeSeverities.has('low')} onClick={() => toggleSeverity('low')} />
        </div>
        {activeSeverities.size > 0 && (
          <button
            onClick={() => setActiveSeverities(new Set())}
            className="text-xs text-secondary underline mb-3 hover:text-foreground transition-colors"
          >
            Clear filter ({filteredFindings.length} shown)
          </button>
        )}

        <div className="space-y-3">
          {filteredFindings.length === 0 ? (
            <p className="text-sm text-secondary">
              {activeSeverities.size > 0 ? 'No findings match the selected severities.' : 'No discrepancies found.'}
            </p>
          ) : (
            <FindingsTable findings={filteredFindings} groups={groups} classifications={documentClassifications} />
          )}
        </div>
      </Card>

      {/* Per-Group Line Items — TEMPORARILY DISABLED: the fixed 3-way column
          set (PO/Rec/Inv) doesn't fit non-purchase docs (e.g. logistics).
          Being reworked as a dynamic-columns table; see the LineItemsTable
          component below (also commented out).
      {groups.map((group, gi) => (
        <div key={group.id} className="animate-fade-up" style={{ animationDelay: `${gi * 60}ms` }}>
          <Card className="p-6">
          <h3 className="text-h3 mb-1">Line Items</h3>
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
      */}

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

const FINDING_COLUMNS = ['Status', 'Doc', 'Description', 'Expected', 'Actual', 'Evidence'] as const;

function FindingsTable({ findings, groups, classifications }: {
  findings: Finding[];
  groups: ReconciliationGroup[];
  classifications: DocumentClassification[];
}) {
  const [search, setSearch] = useState('');
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    [...FINDING_COLUMNS.filter(c => c !== 'Doc')]
  );

  // Finding → group lookup (findings carry unique ids; each belongs to one group)
  const groupByFinding = new Map<string, ReconciliationGroup>(
    groups.flatMap(g => g.findings.map(f => [f.id, g] as const))
  );

  const toggleColumn = (col: string) => {
    setVisibleColumns(prev =>
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  const filtered = search.trim()
    ? findings.filter(f =>
        f.description.toLowerCase().includes(search.toLowerCase()) ||
        f.document.toLowerCase().includes(search.toLowerCase()))
    : findings;

  return (
    <div className="rounded-lg border border-border bg-background shadow-sm">
      {/* Sticky filter bar — pins just below the sticky tab bar (--tabbar-h)
          while the page scrolls (table has NO fixed height; it grows naturally
          and the whole page scrolls, so sticky works against the page, not an
          inner scrollbox) */}
      <div className="sticky top-[var(--tabbar-h)] z-10 flex flex-wrap gap-4 items-center justify-between px-4 py-3 border-b border-border bg-background rounded-t-lg">
        <div className="flex gap-2 flex-wrap">
          <Input
            placeholder="Filter findings..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-56"
          />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-secondary">{filtered.length} of {findings.length}</span>
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
              Columns
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-48">
              {FINDING_COLUMNS.map(col => (
                <DropdownMenuCheckboxItem
                  key={col}
                  checked={visibleColumns.includes(col)}
                  onCheckedChange={() => toggleColumn(col)}
                >
                  {col}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <Table className="w-full" wrapperClassName="">
        <TableHeader className="sticky top-[calc(var(--tabbar-h)+61px)] z-10 bg-background">
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            {visibleColumns.includes('Status') && <TableHead className="w-[110px]">Status</TableHead>}
            {visibleColumns.includes('Doc') && <TableHead className="w-[140px]">Doc</TableHead>}
            {visibleColumns.includes('Description') && <TableHead>Description</TableHead>}
            {visibleColumns.includes('Expected') && <TableHead className="w-[100px] text-right">Expected</TableHead>}
            {visibleColumns.includes('Actual') && <TableHead className="w-[100px] text-right">Actual</TableHead>}
            {visibleColumns.includes('Evidence') && <TableHead className="w-[130px] text-right">Evidence</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.length ? (
            filtered.map(f => (
              <TableRow key={f.id}>
                {visibleColumns.includes('Status') && (
                  <TableCell className="whitespace-nowrap">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger render={<Badge variant="outline" />} className={`uppercase text-xs ${severityBadgeColors[f.severity] ?? severityBadgeColors.low}`}>
                          {f.severity}
                        </TooltipTrigger>
                        <TooltipContent>{f.category.replace(/_/g, ' ')}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                )}
                {visibleColumns.includes('Doc') && (
                  <TableCell className="whitespace-nowrap">
                    <span className="text-xs text-secondary font-mono">{f.document}</span>
                  </TableCell>
                )}
                {visibleColumns.includes('Description') && (
                  <TableCell className="min-w-[260px] text-sm leading-relaxed">{f.description}</TableCell>
                )}
                {visibleColumns.includes('Expected') && (
                  <TableCell className="text-right font-mono whitespace-nowrap">{f.expected ?? '-'}</TableCell>
                )}
                {visibleColumns.includes('Actual') && (
                  <TableCell className="text-right font-mono whitespace-nowrap">{f.actual ?? '-'}</TableCell>
                )}
                {visibleColumns.includes('Evidence') && (
                  <TableCell className="text-right whitespace-nowrap">
                    <EvidenceButton finding={f} group={groupByFinding.get(f.id) || null} classifications={classifications} />
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={visibleColumns.length} className="text-center py-6">
                No results found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function EvidenceButton({ finding, group, classifications }: {
  finding: Finding;
  group: ReconciliationGroup | null;
  classifications: DocumentClassification[];
}) {
  const [open, setOpen] = useState(false);
  // Selected files for panes, most-recent-first, capped at MAX_PANES.
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Build the mindmap file nodes from the finding's group + classifications,
  // then attribute each source citation to the file it mentions.
  const files: MindmapFileNode[] = (group?.documents || []).map(idx => {
    const cls = classifications.find(c => c.document === idx);
    return {
      id: idx,
      title: cls?.fileName || `Doc ${idx}`,
      role: roleLabel(cls?.type || 'other'),
      fileId: cls?.fileId || '',
      citations: [],
    };
  });
  const { byFile, unassigned } = attributeCitations(finding.sourceCitations, files);
  for (const f of files) f.citations = byFile[f.id] || [];
  // Only files with at least one attributed citation orbit the center.
  const citedFiles = files.filter(f => f.citations.length > 0);

  const selectedSet = new Set(selectedIds);
  // The pane grid shows the most-recently-selected files (cap 3); clicking
  // an orbit node when full swaps the newest in and drops the oldest.
  const MAX_PANES = 3;
  const visibleFiles = selectedIds
    .map(id => citedFiles.find(f => f.id === id))
    .filter((f): f is MindmapFileNode => Boolean(f));
  const viewerOpen = visibleFiles.length > 0;
  const multi = viewerOpen && visibleFiles.length >= 2;
  // 3 panes: the orbit collapses to a slim severity dot-rail (option 1).
  const threePanes = visibleFiles.length >= 3;
  const hiddenCited = citedFiles.filter(f => !selectedSet.has(f.id));

  const toggleFile = (id: number) => {
    setSelectedIds(prev => {
      const next = prev.filter(x => x !== id);
      if (next.length === prev.length) {
        // Not present → add as the newest pane (drop the oldest if full).
        next.unshift(id);
        return next.slice(0, MAX_PANES);
      }
      return next; // present → removed
    });
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          // No file pre-selected — the viewer opens dynamically when a node
          // is clicked in the orbit.
          setSelectedIds([]);
          setOpen(true);
        }}
        disabled={finding.sourceCitations.length === 0}
      >
        <Eye className="h-3.5 w-3.5 mr-1" />
        {finding.sourceCitations.length > 0 ? 'Evidences' : 'None'}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        {/* Near full screen: width = viewport − 2rem, height capped at
            viewport − 2rem with internal scroll (the base sm:max-w-sm is
            overridden via the sm: prefix; max-h needs the sm: prefix to
            survive twMerge too). */}
        <DialogContent
          className={cn(
            // flex-col (overriding the base grid): the title row stays
            // content-sized and the content row fills the rest of the
            // near-full-screen height.
            'sm:max-w-[calc(100vw-2rem)] sm:h-[calc(100vh-2rem)] flex flex-col overflow-y-auto',
          )}
        >
          <DialogTitle className="text-h3 font-semibold leading-6">Evidences Mindmap</DialogTitle>
          {/* Split: orbit stays square on the left (compacts for panes); the
              pane grid slides in on the right. Single pane = full-width pane
              exactly like the old single viewer. min-h-0 lets the row shrink
              inside the near-full-height dialog. */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
            <div
              className={cn(
                'transition-all duration-300',
                viewerOpen ? 'shrink-0' : 'w-full',
                // Progressive compaction: 1 pane = full square orbit,
                // 2 panes = compact square, 3 panes = slim dot-rail.
                threePanes
                  ? 'lg:w-14'
                  : multi
                    ? 'lg:w-[380px]'
                    : viewerOpen
                      ? 'lg:w-[600px]'
                      : ''
              )}
            >
              {threePanes ? (
                /* Dot-rail: each cited file is a severity-colored dot; the
                    ring marks files open as panes. Same toggle semantics as
                    the orbit nodes, at a fraction of the width. */
                <div className="flex h-full w-full flex-col items-center gap-2.5 border-r border-border py-3">
                  {citedFiles.map(f => {
                    const selected = selectedSet.has(f.id);
                    return (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => toggleFile(f.id)}
                        title={`${f.title} — ${selected ? 'click to close' : 'click to open'}`}
                        aria-label={`Toggle ${f.title}`}
                        aria-pressed={selected}
                        className={cn(
                          'size-3 shrink-0 cursor-pointer rounded-full transition-all',
                          DOT_COLORS[finding.severity] ?? 'bg-slate-400',
                          selected
                            ? 'opacity-100 ring-2 ring-foreground ring-offset-2 ring-offset-background'
                            : 'opacity-50 hover:opacity-100'
                        )}
                      />
                    );
                  })}
                  <span className="mt-auto text-[10px] tabular-nums text-secondary">
                    {visibleFiles.length}/{citedFiles.length}
                  </span>
                </div>
              ) : (
                <EvidenceMindmap
                  finding={finding}
                  files={citedFiles}
                  unassignedCount={unassigned.length}
                  selectedFileIds={selectedSet}
                  onToggleFile={toggleFile}
                  onClearSelection={() => setSelectedIds([])}
                  compact={multi}
                />
              )}
            </div>
            <div
              className={cn(
                'min-h-0 min-w-0 overflow-hidden transition-all duration-300',
                viewerOpen ? 'lg:opacity-100' : 'lg:w-0 lg:opacity-0',
                // The pane always fills the space beside the orbit (single or
                // multi) — no fixed 520px cap that leaves dead space right.
                viewerOpen && 'lg:flex-1'
              )}
            >
              {viewerOpen && (
                <div className="h-full">
                  <div
                    className={cn(
                      'grid h-full gap-3',
                      visibleFiles.length === 1
                        ? 'grid-cols-1'
                        : visibleFiles.length === 2
                          ? 'grid-cols-2'
                          : 'grid-cols-3'
                    )}
                  >
                    {visibleFiles.map(f => (
                      <EvidencePdfViewer key={f.id} file={f} onClose={() => toggleFile(f.id)} className="h-full" />
                    ))}
                  </div>
                  {hiddenCited.length > 0 && (
                    <p className="mt-2 text-xs text-secondary">
                      {hiddenCited.length} more file{hiddenCited.length === 1 ? '' : 's'} in this finding —
                      click their orbit nodes or file dots to swap panes.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* LineItemsTable — TEMPORARILY DISABLED with the line-items section above;
   being reworked into a manifest-driven dynamic-columns table.
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
*/

function SeverityBadge({ label, count, severity, active, onClick }: { 
  label: string; count: number; severity: string; active: boolean; onClick: () => void 
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`Filter by ${label} findings`}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all duration-150 ${
        active
          ? 'border-foreground bg-foreground text-background'
          : 'bg-muted/40 border-border hover:border-foreground/50'
      }`}
    >
      <span className={`text-sm font-semibold ${active ? '' : severityColors[severity]}`}>{label}</span>
      <span className="text-sm font-mono">{count}</span>
    </button>
  );
}
