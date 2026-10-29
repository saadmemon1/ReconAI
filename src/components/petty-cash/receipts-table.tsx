'use client';
import { useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import {
  countByStatus, filterReceipts, imageUrl, money, RECEIPT_FILTERS, rowByRef, statusMeta,
  type PettyReport, type ReceiptGroup, type Selection,
} from '@/lib/petty-cash-report';
import { CitationChip, FilterChip, StatusChip } from './chips';
import { useDisplay } from './display';

/** `compact` drops the Receipt date column and the merchant part of candidate chips so the table fits beside the docked pane. */
export function ReceiptsTable({ report, kbId, selection, onSelect, compact = false, initialStatus = 'ALL' }: { report: PettyReport; kbId: string; selection: Selection | null; onSelect: (s: Selection) => void; compact?: boolean; initialStatus?: string }) {
  const { headBand, date } = useDisplay();
  const [status, setStatus] = useState(initialStatus);
  const counts = useMemo(() => countByStatus(report.receipts), [report.receipts]);
  const visible = useMemo(() => filterReceipts(report.receipts, status), [report.receipts, status]);
  const selectedId = selection?.kind === 'receipt' ? selection.id : null;

  // One chip per statement row a group points at; a review candidate also carries its score.
  const rowChip = (ref: string, score?: number) => {
    const row = rowByRef(report, ref);
    const label = row
      ? `${date(row.date)} · ${money(row.amount)}${score === undefined ? '' : compact ? ` · score ${score}` : ` · ${row.merchant.slice(0, 24)} · score ${score}`}`
      : ref;
    return (
      <CitationChip
        key={`${ref}-${score ?? ''}`}
        label={label}
        title={row ? `${row.merchant} · ${ref}` : ref}
        onClick={() => onSelect({ kind: 'row', ref, source: 'statement' })}
      />
    );
  };
  const statementCell = (g: ReceiptGroup) => {
    if (g.status === 'REVIEW') {
      return g.review.length
        ? g.review.map(([ref, score]) => rowChip(ref, score))
        : <span className="text-xs text-muted-foreground">its candidates were taken by other receipts</span>;
    }
    return g.refs.length ? g.refs.map(ref => rowChip(ref)) : <span className="text-xs text-muted-foreground">{g.reason}</span>;
  };
  const amountCell = (g: ReceiptGroup) => {
    if (typeof g.total === 'number') return money(g.total);
    if (g.amounts.length) return g.amounts.slice(0, 3).map(money).join(', ');
    return <span className="text-muted-foreground">no amount read</span>;
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        {RECEIPT_FILTERS.map(f => (
          <FilterChip key={f.key} label={f.label} count={counts[f.key] ?? 0} active={status === f.key} onClick={() => setStatus(f.key)}
            tone={f.key === 'ALL' ? undefined : statusMeta(f.key).tone} />
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={headBand}>Status</TableHead>
              <TableHead className={headBand}>Receipt</TableHead>
              {!compact && <TableHead className={headBand}>Receipt date</TableHead>}
              <TableHead className={cn(headBand, 'text-right')}>Amount</TableHead>
              <TableHead className={headBand}>Merchant</TableHead>
              <TableHead className={headBand}>Statement rows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.length === 0 && (
              <TableRow>
                <TableCell colSpan={compact ? 5 : 6} className="py-6 text-center text-muted-foreground">No receipts match</TableCell>
              </TableRow>
            )}
            {visible.map(g => (
              <TableRow
                key={g.id}
                aria-selected={selectedId === g.id}
                onClick={() => onSelect({ kind: 'receipt', id: g.id, source: 'receipt' })}
                className={cn('cursor-pointer', selectedId === g.id ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/40')}
              >
                <TableCell><StatusChip status={g.status} /></TableCell>
                <TableCell>
                  {/* A real button: an orphan receipt has no statement chip, so this is the keyboard route into the pane. */}
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      onSelect({ kind: 'receipt', id: g.id, source: 'receipt' });
                    }}
                    className="flex items-center gap-2 rounded-md text-left hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    {g.crop && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={imageUrl(kbId, g.crop)} alt="" loading="lazy" className="h-10 w-auto max-w-16 rounded border border-border bg-white object-cover object-top" />
                    )}
                    <span className="font-mono text-xs">p{g.page} · {g.id}</span>
                  </button>
                </TableCell>
                {!compact && <TableCell className="font-mono text-xs">{g.date ? date(g.date) : <span className="text-muted-foreground">no date</span>}</TableCell>}
                <TableCell className="text-right font-mono text-xs tabular-nums">{amountCell(g)}</TableCell>
                <TableCell className="max-w-[220px]">
                  {g.merchant ? <div className="truncate" title={g.merchant}>{g.merchant}</div> : <span className="text-muted-foreground">no merchant read</span>}
                </TableCell>
                <TableCell><div className="flex flex-wrap gap-1">{statementCell(g)}</div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
