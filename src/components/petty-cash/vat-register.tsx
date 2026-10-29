'use client';
import { Fragment, useMemo, useState } from 'react';
import { Cpu, Loader2, PenLine, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { acct, money, TONE_VAR, type PettyReport, type ReceiptGroup, type Selection, type Tone, type VatStatus } from '@/lib/petty-cash-report';
import { FilterChip } from './chips';
import { ManualEntry } from './manual-entry';
import { candidateNote } from '@/lib/review-queue';
import { useDisplay } from './display';

/** The VAT verdicts in words. Only a decoded ZATCA QR code makes VAT reclaimable; everything else says what is missing. */
export const VAT_WORD: Record<VatStatus['status'], { word: string; tone: Tone }> = {
  reclaimable: { word: 'Accepted', tone: 'ok' },
  not_verified: { word: 'Needs review', tone: 'bad' },
  check: { word: 'Does not add up', tone: 'warn' },
  no_vat: { word: 'No VAT', tone: 'muted' },
  excluded: { word: 'Not counted', tone: 'muted' },
};
const ORDER: Array<VatStatus['status']> = ['reclaimable', 'not_verified', 'check', 'no_vat', 'excluded'];
const SOURCE_WORD: Record<NonNullable<VatStatus['source']>, string> = { person: 'entered by a person', qr: 'from QR', parsed: 'from invoice', ai_page: 'read off the page by AI' };

export interface VatSummary { status: VatStatus['status']; count: number; vat: number }

export function vatSummary(report: PettyReport): VatSummary[] {
  return ORDER.map(status => {
    const gs = report.receipts.filter(g => g.vat?.status === status);
    return { status, count: gs.length, vat: Math.round(gs.reduce((a, g) => a + (g.vat?.amount ?? 0), 0) * 100) / 100 };
  });
}

/** The VAT register: one line per receipt with the supplier's VAT number and the VAT, taken from the invoice's ZATCA QR code. A line
 *  without a decoded code is "not verified", whatever the AI read; a page check of the code is shown as a finding with its author. */
export function VatRegister({ report, kbId, selection, onSelect, compact = false, rerunNeeded, onRerun, rerunBusy, onChanged }: {
  report: PettyReport; kbId: string; selection: Selection | null; onSelect: (s: Selection) => void; compact?: boolean;
  rerunNeeded: boolean; onRerun?: () => void; rerunBusy?: boolean; onChanged: () => void;
}) {
  const [entering, setEntering] = useState<string | null>(null);
  const { headBand } = useDisplay();
  const [status, setStatus] = useState<'ALL' | VatStatus['status']>('ALL');
  const lines = useMemo(() => report.receipts.filter(g => g.vat).sort((a, b) => a.page - b.page || a.id.localeCompare(b.id)), [report.receipts]);
  const summary = useMemo(() => vatSummary(report), [report]);
  const visible = status === 'ALL' ? lines : lines.filter(g => g.vat?.status === status);
  const selectedId = selection?.kind === 'receipt' ? selection.id : null;
  const reclaim = summary.find(s => s.status === 'reclaimable')!;
  const accepted = lines.filter(g => g.vat?.status === 'reclaimable');
  const by = (src: VatStatus['source']) => accepted.filter(g => g.vat?.source === src).length;
  const open = lines.filter(g => g.vat?.status === 'not_verified' || g.vat?.status === 'check');
  const lent = lines.filter(g => g.seller_vat?.source === 'vendor').length;

  if (!lines.length) {
    return <p className="rounded-xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">This report was built before VAT was checked. Re-run the reconciliation to build the VAT register.</p>;
  }
  return (
    <div className="space-y-5">
      <p className="flex gap-2 rounded-xl border border-border bg-card px-5 py-3.5 text-sm">
        <Cpu className="mt-0.5 size-4 shrink-0" style={{ color: TONE_VAR.ok }} aria-hidden="true" />
        <span>
          VAT is accepted from wherever it is found: the parsed invoice (any part of it), its ZATCA QR code, or a person&apos;s entry. A receipt with no VAT
          figure claims none. A vendor&apos;s VAT number, once read, is used on its other invoices. A person is asked only when ReconAI cannot find the VAT
          number or the total, or two sources disagree: use &ldquo;Edit&rdquo; on the line.
        </span>
      </p>

      <div className="grid overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
        <Figure label="VAT accepted" value={`${acct(reclaim.vat)} SAR`} sub={`${reclaim.count} invoices: ${by('parsed')} from the invoice, ${by('qr')} from QR${by('ai_page') ? `, ${by('ai_page')} read off the page by AI` : ''}${by('person') ? `, ${by('person')} entered` : ''}`} tone="ok" />
        <Figure label="Seller VAT numbers" value={`${lines.filter(g => g.seller_vat?.no).length} found`} sub={`${lent} carried from the same vendor's other invoices`} tone="review" border />
        <Figure label="Needs review" value={`${open.length} invoices`} sub="Total or the seller's VAT number not found, or sources disagree: use Edit" tone="bad" border />
      </div>

      {rerunNeeded && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-5 py-3 text-sm">
          <span className="text-muted-foreground">Your readings are saved. The register shows them after a re-run.</span>
          {onRerun && <Button size="sm" variant="outline" onClick={onRerun} disabled={rerunBusy}>{rerunBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Re-run</Button>}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1">
        <FilterChip label="All" count={lines.length} active={status === 'ALL'} onClick={() => setStatus('ALL')} />
        {summary.map(s => (
          <FilterChip key={s.status} label={VAT_WORD[s.status].word} count={s.count} active={status === s.status} onClick={() => setStatus(s.status)} tone={VAT_WORD[s.status].tone} />
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className={headBand}>VAT</TableHead>
              <TableHead className={headBand}>Invoice</TableHead>
              {!compact && <TableHead className={headBand}>Supplier VAT number</TableHead>}
              <TableHead className={cn(headBand, 'text-right')}>Total</TableHead>
              <TableHead className={cn(headBand, 'text-right')}>VAT</TableHead>
              <TableHead className={headBand}>Why</TableHead>
              <TableHead className={headBand}><span className="sr-only">Read it</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visible.map(g => (
              <Fragment key={g.id}>
                <VatLine g={g} compact={compact} selected={selectedId === g.id} onSelect={onSelect} entering={entering === g.id}
                  onEnter={() => setEntering(e => (e === g.id ? null : g.id))} />
                {entering === g.id && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={compact ? 6 : 7} className="bg-muted/30">
                      <ManualEntry kbId={kbId} receiptId={g.id} onSaved={onChanged} onClose={() => setEntering(null)}
                        prefill={{ total: g.total, vat: g.vat?.amount ?? g.vat_check?.vat ?? null, vatNo: g.seller_vat?.no ?? g.vat_no_candidate ?? null, vatNoNote: candidateNote(g) }} />
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function Figure({ label, value, sub, tone, border = false }: { label: string; value: string; sub: string; tone: Tone; border?: boolean }) {
  return (
    <div className={cn('flex flex-col gap-1 px-5 py-4', border && 'border-t border-border sm:border-l sm:border-t-0')}>
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-1.5 rounded-full" style={{ background: TONE_VAR[tone] }} aria-hidden="true" />{label}
      </span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

function VatLine({ g, compact, selected, onSelect, entering, onEnter }: {
  g: ReceiptGroup; compact: boolean; selected: boolean; onSelect: (s: Selection) => void; entering: boolean; onEnter: () => void;
}) {
  const v = g.vat!;
  const w = VAT_WORD[v.status];
  const total = g.qr?.total ?? g.total;
  return (
    <TableRow aria-selected={selected} onClick={() => onSelect({ kind: 'receipt', id: g.id, source: 'receipt' })}
      className={cn('cursor-pointer align-top', selected ? 'bg-primary/5 hover:bg-primary/5' : 'hover:bg-muted/40')}>
      <TableCell>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium" style={{ color: TONE_VAR[w.tone] }}>
          <span className="size-1.5 rounded-full" style={{ background: TONE_VAR[w.tone] }} aria-hidden="true" />{w.word}
        </span>
      </TableCell>
      <TableCell className="max-w-[220px]">
        <div className="truncate" title={g.qr?.seller || g.merchant || g.id}>{g.qr?.seller || g.merchant || g.id}</div>
        <div className="font-mono text-[11px] text-muted-foreground">p{g.page} · {g.id}</div>
      </TableCell>
      {!compact && (
        <TableCell className="font-mono text-xs tabular-nums">
          {g.seller_vat?.no ?? (g.qr && !g.qr.vat_no ? <span className="text-muted-foreground">none in QR</span> : <span className="text-muted-foreground">—</span>)}
          {g.seller_vat?.no && (
            <div className="font-sans text-[10px] text-muted-foreground" title={g.seller_vat.read_as ? `This invoice reads ${g.seller_vat.read_as}: a misread` : undefined}>
              {g.seller_vat.source === 'qr' ? 'from QR' : g.seller_vat.source === 'parsed' ? 'printed' : `same vendor, ${(g.seller_vat.from ?? []).join(', ')}`}
              {g.seller_vat.read_as && ' · misread here'}
            </div>
          )}
          {g.qr?.phase === 2 && (
            <div className="font-sans text-[10px]" style={{ color: TONE_VAR[g.qr.signature === 'verified' ? 'ok' : 'muted'] }}
              title={g.qr.signature === 'verified' ? `Signature verified: ${g.qr.signature_scheme}` : 'The signature could not be checked from the QR alone'}>
              Phase 2 · {g.qr.signature === 'verified' ? 'signature verified' : 'signature not checkable'}
            </div>
          )}
        </TableCell>
      )}
      <TableCell className="text-right font-mono text-xs tabular-nums">{total == null ? '—' : money(total)}</TableCell>
      <TableCell className="text-right font-mono text-xs tabular-nums">
        {v.amount == null ? '—' : money(v.amount)}
        {v.amount != null && v.source && <div className="text-[10px] font-sans text-muted-foreground">{SOURCE_WORD[v.source]}</div>}
      </TableCell>
      <TableCell className="max-w-[360px] text-xs">
        {v.why}
        {v.finding && (
          <div className="mt-1 text-muted-foreground">
            Page check{v.finding.by ? ` by ${v.finding.by}` : ''}{v.finding.proposed ? ' (a proposal, not confirmed by a person)' : ''}: {v.finding.text}
            {v.finding.reason && <>. {v.finding.reason}</>}
          </div>
        )}
      </TableCell>
      <TableCell className="text-right">
        {v.status !== 'reclaimable' && v.status !== 'excluded' && (
          <Button size="sm" variant={entering ? 'primary' : 'ghost'} onClick={e => { e.stopPropagation(); onEnter(); }} title="Edit the VAT number, total or VAT, or paste QR text">
            <PenLine className="size-3.5" /> Edit
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
