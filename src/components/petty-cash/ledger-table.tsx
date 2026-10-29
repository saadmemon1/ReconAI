'use client';
import { useEffect, useRef, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { money, type LedgerLine, type PettyReport } from '@/lib/petty-cash-report';
import { FilterChip, StatusChip } from './chips';
import { useDisplay } from './display';

/** The ledger lines table; shared by the Ledger tab and the pane's Ledger source (which highlights one code). */
export function LedgerLines({ lines, highlightCode }: { lines: LedgerLine[]; highlightCode?: string }) {
  const { headBand, date } = useDisplay();
  const firstHit = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    const row = firstHit.current;
    // Scroll only the nearest scroll container (the pane body), never the document: scrollIntoView would move the page too.
    const scroller = row?.closest<HTMLElement>('[data-scroll-container]');
    if (!row || !scroller) return;
    const delta = row.getBoundingClientRect().top - scroller.getBoundingClientRect().top - scroller.clientHeight / 2 + row.offsetHeight / 2;
    scroller.scrollTop += delta;
  }, [highlightCode]);
  const firstHitIdx = highlightCode === undefined ? -1 : lines.findIndex(l => l.code === highlightCode);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={headBand}>Code</TableHead>
            <TableHead className={headBand}>Date</TableHead>
            <TableHead className={cn(headBand, 'text-right')}>Debit</TableHead>
            <TableHead className={cn(headBand, 'text-right')}>Credit</TableHead>
            <TableHead className={headBand}>Text</TableHead>
            <TableHead className={headBand}>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.length === 0 && (
            <TableRow>
              <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">No ledger lines</TableCell>
            </TableRow>
          )}
          {lines.map((l, i) => {
            const hit = highlightCode !== undefined && l.code === highlightCode;
            const ref = i === firstHitIdx ? firstHit : undefined;
            return (
              <TableRow key={`${l.row}-${l.code}`} ref={ref} aria-current={hit ? 'true' : undefined} className={cn(hit && 'bg-primary/10 hover:bg-primary/10')}>
                <TableCell className="whitespace-nowrap font-mono text-xs">{l.code}</TableCell>
                <TableCell className="whitespace-nowrap font-mono text-xs">{date(l.date)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{money(l.debit)}</TableCell>
                <TableCell className="text-right font-mono text-xs tabular-nums">{money(l.credit)}</TableCell>
                <TableCell className="max-w-[360px] text-xs"><div className="truncate" title={l.text}>{l.text}</div></TableCell>
                <TableCell>{l.status ? <StatusChip status={l.status} /> : <span className="text-muted-foreground">—</span>}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function LedgerTable({ report }: { report: PettyReport }) {
  const [all, setAll] = useState(false);
  const thisMonth = report.ledger.filter(l => l.month === report.meta.month);
  const t = report.tieout;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1">
        <FilterChip label="This month" count={thisMonth.length} active={!all} onClick={() => setAll(false)} />
        <FilterChip label="All months" count={report.ledger.length} active={all} onClick={() => setAll(true)} />
      </div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Loads vs top-ups: {money(t.loads_vs_topups.statement)} vs {money(t.loads_vs_topups.ledger)} (diff {money(t.loads_vs_topups.diff)}).</p>
        <p>ATM cash: {money(t.atm_vs_withdrawals.statement)} on the card, {money(t.atm_vs_withdrawals.ledger)} withdrawn in the ledger.</p>
        <p>Card spend {money(t.purchases_vs_rollup.statement)} vs roll-up {money(t.purchases_vs_rollup.ledger)}: diff {money(t.purchases_vs_rollup.diff)}.</p>
      </div>
      <LedgerLines lines={all ? report.ledger : thisMonth} />
    </div>
  );
}
