'use client';
import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { ArrowRight, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  acct, fmtDate, money, monthEnd, paneSources, pct, severityCounts, TONE_VAR,
  type Evidence, type Finding, type Go, type PaymentSource, type PaymentSources, type PettyReport, type ReconBasis, type ReconItem, type Reconciliation, type Selection,
  type Severity, type Tone,
} from '@/lib/petty-cash-report';
import { CitationChip } from './chips';
import { useDisplay } from './display';

export const SEVERITY: Record<Severity, { word: string; tone: Tone }> = {
  high: { word: 'Urgent', tone: 'bad' },
  medium: { word: 'Important', tone: 'warn' },
  low: { word: 'Minor', tone: 'muted' },
};

/** The button that takes the reader to where a finding or a reconciling line is fixed. */
export function GoButton({ go, onGo }: { go?: Go; onGo?: (g: Go) => void }) {
  if (!go || !onGo) return null;
  return (
    <Button size="sm" variant="outline" onClick={e => { e.stopPropagation(); onGo(go); }} className="shrink-0">
      {go.label} <ArrowRight className="size-3.5" />
    </Button>
  );
}
const BASIS: Record<ReconBasis, { word: string; tone: Tone }> = {
  documents: { word: 'From documents', tone: 'ok' },
  review: { word: 'From receipt review', tone: 'review' },
  open: { word: 'Open', tone: 'warn' },
};

export function Tag({ word, tone, className }: { word: string; tone: Tone; className?: string }) {
  const c = TONE_VAR[tone];
  return (
    <span
      className={cn('inline-flex h-5 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-[11px] font-semibold', className)}
      style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      {word}
    </span>
  );
}

/** A section that folds under its summary line in the one-page layout, or stands as plain content when it has a page of its own. */
function Fold({ bare, summary, children, id, className, ...details }: { bare: boolean; summary: ReactNode; children: ReactNode } & ComponentProps<'details'>) {
  if (bare) return <section id={id} className={className}>{children}</section>;
  return <details id={id} className={className} {...details}>{summary}{children}</details>;
}

type Pick = { selection: Selection | null; onSelect: (s: Selection) => void };
/** What a selection points at, ignoring which source tab is showing. */
const selKey = (s: Selection) => (s.kind === 'row' ? `row:${s.ref}` : s.kind === 'receipt' ? `receipt:${s.id}` : `ledger:${s.code}`);

/** The source buttons for one piece of evidence: whichever of statement row, receipt page and ledger cell it has. */
function EvidenceChips({ report, e, selection, onSelect }: { report: PettyReport; e: Evidence } & Pick) {
  const sel = e.select;
  const src = sel ? paneSources(report, sel) : null;
  if (!sel || !src) return null;
  const same = (source: Selection['source'], index = 0) =>
    selection != null && selKey(selection) === selKey(sel) && selection.source === source
    && (source !== 'receipt' || (selection.kind === 'row' ? selection.index ?? 0 : 0) === index);
  const open = (source: Selection['source'], index?: number) =>
    onSelect(sel.kind === 'row' ? { ...sel, source, index } : { ...sel, source });
  return (
    <div className="flex flex-wrap justify-end gap-1">
      {src.statement.length > 0
        ? <CitationChip label="Stmt" title="Card statement row" active={same('statement')} onClick={() => open('statement')} />
        // a receipt with no card row: say so, rather than leave the reader wondering where the statement went
        : sel.kind === 'receipt' && (
          <span title="No card transaction matches this receipt" className="inline-flex h-6 items-center whitespace-nowrap rounded-md border border-dashed border-border px-2 font-mono text-[11px] text-muted-foreground">
            Not on card
          </span>
        )}
      {/* one chip per page: a page with two cited boxes (slip and receipt) shows both boxes when opened */}
      {src.receipts.map((c, i) => (src.receipts.findIndex(x => x.page === c.page) === i
        ? <CitationChip key={`${c.group_id}-${c.page}`} label={`Receipt p${c.page}`} title={c.group_id} active={same('receipt', i)} onClick={() => open('receipt', i)} />
        : null))}
      {src.ledger && <CitationChip label={`Ledger ${src.ledger.cell}`} title={src.ledger.code} active={same('ledger')} onClick={() => open('ledger')} />}
    </div>
  );
}

/** One finding: a single scannable line, with why, what to do and the evidence one click away. */
/** Evidence lines with their source chips; the polished layout shows a line's explanation, when it has one, in place of its note. */
function EvidenceTable({ evidence, report, selection, onSelect }: { evidence: Evidence[]; report: PettyReport } & Pick) {
  const { date, polished } = useDisplay();
  return (
    <div className="max-h-72 overflow-auto rounded-lg border border-border">
      <table className="w-full text-xs">
        <tbody>
          {evidence.map((e, i) => {
            const note = polished && e.explain ? e.explain : e.note;
            return (
              <tr key={i} className="border-t border-border first:border-t-0 align-top">
                <td className="px-3 py-2">
                  <div>{e.date && `${date(e.date)} · `}{e.label}</div>
                  {note && <div className="text-muted-foreground">{note}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right font-mono tabular-nums">{money(e.amount)}</td>
                <td className="px-3 py-1.5"><EvidenceChips report={report} e={e} selection={selection} onSelect={onSelect} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** `focus` names the finding the parent wants open (a "Decisions needed" click); its nonce reopens it on every click. */
type Focus = { key: string; n: number } | null;

function FindingRow({ f, report, selection, onSelect, focus, onGo }: { f: Finding; report: PettyReport; focus?: Focus; onGo?: (g: Go) => void } & Pick) {
  const s = SEVERITY[f.severity];
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (focus?.key === f.key && ref.current) ref.current.open = true;
  }, [focus, f.key]);
  return (
    <details ref={ref} id={`finding-${f.key}`} className="group scroll-mt-20 border-t border-border first:border-t-0">
      {/* wraps beside the docked pane: the amount drops under the title rather than squeezing it */}
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-3 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
        <Tag word={s.word} tone={s.tone} className="w-16 justify-center" />
        <span className="min-w-[12rem] flex-1 text-sm font-medium">{f.title}</span>
        <span className="whitespace-nowrap font-mono text-sm tabular-nums">{f.amount == null ? '' : `${acct(f.amount)} SAR`}</span>
        <GoButton go={f.go} onGo={onGo} />
      </summary>
      <div className="space-y-3 pb-4 pl-7 text-sm">
        <p className="max-w-[70ch] text-muted-foreground">{f.why}</p>
        <div className="flex flex-wrap items-center gap-3">
          <p className="max-w-[70ch]"><span className="font-medium">What to do: </span>{f.action}</p>
        </div>
        {f.evidence.length > 0 && <EvidenceTable evidence={f.evidence} report={report} selection={selection} onSelect={onSelect} />}
      </div>
    </details>
  );
}

/** The full reconciliation statement for whoever wants to check the arithmetic; collapsed unless the parent opens it. */
export function ReconciliationStatement({ rec, month, open, onOpenChange, bare = false }: {
  rec: Reconciliation; month: string; open: boolean; onOpenChange: (open: boolean) => void; bare?: boolean;
}) {
  const AMT = 'whitespace-nowrap py-2 pl-4 text-right font-mono tabular-nums';
  const reconciled = rec.unreconciled === 0;
  const { polished } = useDisplay();
  const [y, m] = month.split('-').map(Number);
  const end = polished ? fmtDate(new Date(Date.UTC(y, m, 0)).toISOString()) : monthEnd(month);
  return (
    <Fold bare={bare}
      id="reconciliation-statement"
      open={open}
      onToggle={e => e.target === e.currentTarget && onOpenChange(e.currentTarget.open)}
      className={cn('group scroll-mt-20 rounded-xl bg-card px-5 ring-1 ring-foreground/10 sm:px-6', bare && 'pt-3')}
      summary={
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        Reconciliation statement
        <span className="font-normal text-muted-foreground">· how card and ledger tie, item by item</span>
      </summary>}>
      <div className="overflow-x-auto pb-4">
        <table className="w-full min-w-[520px] text-sm">
          <tbody>
            <tr><td className="py-2">Balance per card statement at {end}</td><td /><td className={AMT}>{acct(rec.cardClosing)}</td></tr>
            <tr><td className="py-2">Balance per general ledger at {end}</td><td /><td className={AMT}>{acct(rec.ledgerClosing)}</td></tr>
            <tr className="border-t border-border font-semibold"><td className="py-2">Difference (card minus ledger)</td><td /><td className={AMT}>{acct(rec.difference)}</td></tr>
            <tr><td colSpan={3} className="pt-4 pb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Reconciling items</td></tr>
            {rec.items.map(i => (
              <tr key={i.key} className={cn(i.amount === 0 && 'text-muted-foreground')}>
                <td className="py-2 pl-4">
                  <div>{i.label}</div>
                  <div className="text-xs text-muted-foreground">{i.detail}</div>
                </td>
                <td className="py-2 pl-4 align-top"><Tag word={BASIS[i.basis].word} tone={BASIS[i.basis].tone} /></td>
                <td className={cn(AMT, 'align-top')}>{acct(i.amount)}</td>
              </tr>
            ))}
            <tr className="border-t border-border"><td className="py-2">Total reconciling items</td><td /><td className={AMT}>{acct(rec.explained)}</td></tr>
            <tr className="font-semibold" style={{ color: TONE_VAR[reconciled ? 'ok' : 'warn'] }}>
              <td className="py-2">Unreconciled difference</td>
              <td className="py-2 pl-4">{!reconciled && <Tag word={BASIS.open.word} tone={BASIS.open.tone} />}</td>
              <td className={cn(AMT, 'border-b-4 border-double border-current')}>{acct(rec.unreconciled)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Fold>
  );
}

const GAP_PART: Record<ReconItem['key'], { label: string; color: string }> = {
  unpaid: { label: 'Receipts the card didn\u2019t pay', color: TONE_VAR.bad },
  no_receipt: { label: 'Card payments with no receipt', color: TONE_VAR.warn },
  differences: { label: 'Invoice above card payment', color: 'var(--muted-foreground)' },
  cash: { label: 'Cash beyond ATM withdrawals', color: TONE_VAR.bad },
  other_card: { label: 'Paid with other cards', color: `color-mix(in srgb, ${TONE_VAR.bad} 50%, var(--card))` },
  other_credits: { label: 'Ledger entries not on the card', color: TONE_VAR.review },
  money_in: { label: 'Card loads vs ledger top-ups', color: `color-mix(in srgb, ${TONE_VAR.review} 45%, var(--card))` },
  opening: { label: 'Opening balances', color: 'var(--muted-foreground)' },
};
/** Cash below zero means the ATMs gave out more cash than the receipts show was spent in cash, not cash spent beyond them. */
const partLabel = (i: ReconItem) => (i.key === 'cash' && i.amount < 0 ? 'ATM cash with no cash receipt' : GAP_PART[i.key].label);
const STRIPES = `repeating-linear-gradient(135deg, ${TONE_VAR.warn} 0 6px, color-mix(in srgb, ${TONE_VAR.warn} 55%, var(--card)) 6px 12px)`;

/** The card-to-ledger gap in one glance: what is still unreconciled, large, and a bar splitting the gap into what explains it.
 *  The bar is drawn only when every part runs the same way as the gap; otherwise the parts are listed with their signs. */
export function GapBreakdown({ rec, action, onOpen }: { rec: Reconciliation; action?: string; onOpen?: () => void }) {
  const open = rec.unreconciled !== 0;
  const tone: Tone = open ? 'warn' : 'ok';
  const parts = rec.items.filter(i => i.amount !== 0);
  const all = [...parts.map(i => i.amount), rec.unreconciled];
  const drawable = rec.difference > 0 && all.every(a => a >= 0);
  const width = (a: number) => `${(a / rec.difference) * 100}%`;
  const share = explainedShare(rec);
  return (
    <section aria-label="Unreconciled difference" className="space-y-4 rounded-xl border bg-card px-5 py-4"
      style={{ borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 35%, transparent)`, boxShadow: `inset 4px 0 0 ${TONE_VAR[tone]}` }}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="space-y-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: TONE_VAR[tone] }}>
            {open ? 'Unreconciled' : 'Fully reconciled'}
          </div>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl font-semibold tabular-nums tracking-tight" style={{ color: TONE_VAR[tone] }}>{acct(rec.unreconciled)} SAR</span>
            <span className="text-sm text-muted-foreground">
              {open ? 'still unexplained in' : 'left in'} the <span className="font-medium text-foreground">{money(rec.difference)} SAR</span> gap between card and ledger
              {share != null && <> · {pct(rec.explained, rec.difference)} explained</>}
            </span>
          </div>
        </div>
        {onOpen && (
          <button type="button" onClick={onOpen} className="inline-flex items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline">
            See the reconciliation <ChevronRight className="size-4" />
          </button>
        )}
      </div>

      {drawable && (
        <div className="flex h-3 overflow-hidden rounded-full bg-muted" role="img"
          aria-label={[...parts.map(i => `${partLabel(i)} ${money(i.amount)}`), `unreconciled ${money(rec.unreconciled)}`].join(', ')}>
          {parts.map(i => <span key={i.key} title={`${partLabel(i)}: ${money(i.amount)}`} style={{ width: width(i.amount), background: GAP_PART[i.key].color }} />)}
          {open && <span title={`Unreconciled: ${money(rec.unreconciled)}`} style={{ width: width(rec.unreconciled), background: STRIPES }} />}
        </div>
      )}
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-xs">
        {parts.map(i => (
          <li key={i.key} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: GAP_PART[i.key].color }} aria-hidden="true" />
            <span className="text-muted-foreground">{partLabel(i)}</span>
            <span className="font-medium tabular-nums">{acct(i.amount)}</span>
          </li>
        ))}
        {open && (
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: STRIPES }} aria-hidden="true" />
            <span className="font-medium" style={{ color: TONE_VAR.warn }}>Unreconciled</span>
            <span className="font-semibold tabular-nums" style={{ color: TONE_VAR.warn }}>{acct(rec.unreconciled)}</span>
          </li>
        )}
      </ul>
      {open && action && (
        <p className="border-t border-border pt-3 text-sm"><span className="font-medium">Next step: </span>{action}</p>
      )}
    </section>
  );
}

/** The month's health from its findings: any high-risk finding needs attention, medium ones are worth watching. */
export function verdictFor(fs: Finding[]): { word: string; tone: Tone; line: string } {
  const counts = severityCounts(fs);
  return counts.high
    ? { word: 'Needs attention', tone: 'bad', line: `${counts.high} ${counts.high === 1 ? 'finding needs' : 'findings need'} a decision this month.` }
    : counts.medium
      ? { word: 'Keep an eye on it', tone: 'warn', line: 'No high-risk findings; a few items to tidy up.' }
      : { word: 'Healthy', tone: 'ok', line: 'Card, receipts and ledger agree.' };
}

/** The share of the card-to-ledger difference the reconciling items explain, or null while it cannot be stated. */
export function explainedShare(rec: Reconciliation): number | null {
  const share = rec.difference ? rec.explained / rec.difference : 1;
  return rec.undecided === 0 && share >= 0 && share <= 1 ? share : null;
}

/** Spending that never touched the petty-cash card: cash beyond the ATM withdrawals, and other cards. */
export const spentOutsideCard = (rec: Reconciliation) => Math.max(0, rec.cash.amount - rec.atmCash) + rec.otherCard.amount;

/** The month's verdict in one glance: health, the count of findings by risk, and the two numbers behind it. */
export function Verdict({ report, rec, fs }: { report: PettyReport; rec: Reconciliation; fs: Finding[] }) {
  const counts = severityCounts(fs);
  const { kpis } = report;
  const verdict = verdictFor(fs);
  const shareKnown = explainedShare(rec) != null;
  const outside = spentOutsideCard(rec);
  const { polished } = useDisplay();
  return (
    <Card className="gap-3 px-5 py-5 sm:px-6" style={{ boxShadow: `inset 4px 0 0 ${TONE_VAR[verdict.tone]}` }}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: TONE_VAR[verdict.tone] }} aria-hidden="true" />
          <span className="text-lg font-semibold" style={{ color: TONE_VAR[verdict.tone] }}>{verdict.word}</span>
          <span className="text-base">{verdict.line}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(['high', 'medium', 'low'] as const).map(s => (
            <Tag key={s} word={`${counts[s]} ${SEVERITY[s].word.toLowerCase()}`} tone={counts[s] ? SEVERITY[s].tone : 'muted'} />
          ))}
        </div>
      </div>
      {polished ? (
        // the cards below carry the gap and the receipt coverage; the banner says only what they don't
        <p className="max-w-[90ch] text-sm text-muted-foreground">
          {shareKnown && `${pct(rec.explained, rec.difference)} of the card-to-ledger gap is explained. `}
          {outside > 0 && <span className="font-medium text-foreground">{money(outside)} SAR was spent outside the card.</span>}
        </p>
      ) : (
        <p className="max-w-[90ch] text-sm text-muted-foreground">
          The ledger and the card are {money(Math.abs(rec.difference))} SAR apart at month end
          {shareKnown ? `; ${pct(rec.explained, rec.difference)} of that is explained` : ''}.
          {outside > 0 && <> <span className="font-medium text-foreground">{money(outside)} SAR was spent outside the card.</span></>}
          {' '}Receipts back {pct(kpis.evidenced_amount, kpis.purchases_amount)} of card purchases.
        </p>
      )}
    </Card>
  );
}

/** Risk-ranked findings; evidence chips open the parent's citation pane, the same one the tables use. */
const TOP_FINDINGS = 3;

/** Risk-ranked findings in one foldable section (the summary line keeps the counts in view when folded); evidence chips open
 *  the parent's citation pane, the same one the tables use. */
export function FindingsList({ report, fs, selection, onSelect, open, onOpenChange, focus = null, bare = false, onGo }: {
  report: PettyReport; fs: Finding[]; open: boolean; onOpenChange: (open: boolean) => void; focus?: Focus; bare?: boolean; onGo?: (g: Go) => void;
} & Pick) {
  const ledgerLines = report.ledger.filter(l => l.month === report.meta.month).length;
  const { polished } = useDisplay();
  const [all, setAll] = useState(false);
  // on a page of its own the list is the point, so it shows every finding; in the one-page layout it shows the top three
  const shown = polished && !bare && !all ? fs.slice(0, TOP_FINDINGS) : fs;
  const counts = severityCounts(fs);
  return (
    <Fold bare={bare} id="report-findings" open={open} onToggle={e => e.target === e.currentTarget && onOpenChange(e.currentTarget.open)} className="group/findings scroll-mt-20 space-y-2" summary={
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/findings:rotate-90" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {fs.length} findings · most urgent first
          <span className="group-open/findings:inline hidden"> · each button takes you where to fix it; open a finding to see its receipts</span>
        </span>
        <span className="flex gap-1 group-open/findings:hidden">
          {(['high', 'medium', 'low'] as const).map(s => counts[s] > 0 && <Tag key={s} word={`${counts[s]} ${SEVERITY[s].word.toLowerCase()}`} tone={SEVERITY[s].tone} />)}
        </span>
      </summary>}>
      <Card className="gap-0 px-4 py-0 sm:px-5">
        {fs.length === 0
          ? <p className="py-4 text-sm text-muted-foreground">No findings this month.</p>
          : shown.map(f => <FindingRow key={f.key} f={f} report={report} selection={selection} onSelect={onSelect} focus={focus} onGo={onGo} />)}
        {polished && !bare && fs.length > TOP_FINDINGS && (
          <button type="button" onClick={() => setAll(a => !a)} className="w-full border-t border-border py-2.5 text-sm font-medium text-primary hover:underline">
            {all ? 'Show the top three' : `Show all ${fs.length} findings`}
          </button>
        )}
      </Card>
      <p className="text-xs text-muted-foreground">
        Checked this month: {report.rows.length} card transactions, {report.receipts.length} receipts on {report.meta.page_images.receipts.length} pages,
        and {ledgerLines} ledger entries, each matched to its source page.
      </p>
    </Fold>
  );
}

const SOURCE_TONE: Record<PaymentSource['kind'], Tone> = { card: 'review', cash: 'warn', other_card: 'bad' };

/** How the month's spending was paid: the petty-cash card, cash, other cards, each with its total and the slips or
 *  withdrawals behind it, and how the sum compares with the ledger's roll-up. */
export function PaymentSourcesSection({ report, paid, selection, onSelect, open, onOpenChange, bare = false }: {
  report: PettyReport; paid: PaymentSources; open: boolean; onOpenChange: (open: boolean) => void; bare?: boolean;
} & Pick) {
  return (
    <Fold bare={bare} id="report-payments" open={open} onToggle={e => e.target === e.currentTarget && onOpenChange(e.currentTarget.open)} className="group/paid scroll-mt-20 space-y-2" summary={
      <summary className="flex cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open/paid:rotate-90" />
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">How it was paid · cards and cash</span>
      </summary>}>
      <Card className="gap-0 px-4 py-0 sm:px-5">
        {paid.sources.map(src => (
          <details key={src.key} className="group border-t border-border first:border-t-0">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
              <span className="size-2 shrink-0 rounded-full" style={{ background: TONE_VAR[SOURCE_TONE[src.kind]] }} aria-hidden="true" />
              <span className="min-w-[12rem] flex-1">
                <span className="text-sm font-medium">{src.label}</span>
                {src.number && <span className="ml-2 font-mono text-xs text-muted-foreground">{src.number}</span>}
                {src.network && <span className="ml-2"><Tag word={src.network} tone="muted" /></span>}
                <span className="block text-xs text-muted-foreground">{src.count}</span>
              </span>
              <span className="whitespace-nowrap font-mono text-sm tabular-nums">{money(src.amount)} SAR</span>
            </summary>
            <div className="space-y-3 pb-4 pl-7 text-sm">
              <p className="max-w-[70ch] text-muted-foreground">{src.tie}</p>
              {src.evidence.length > 0 && <EvidenceTable evidence={src.evidence} report={report} selection={selection} onSelect={onSelect} />}
            </div>
          </details>
        ))}
      </Card>
      <p className="text-xs text-muted-foreground">
        Spending found: <span className="font-medium text-foreground">{money(paid.found)} SAR</span> (card purchases, cash and other cards)
        against the ledger roll-up of {money(paid.rollup)}; {money(Math.abs(paid.notFound))} {paid.notFound === 0 ? 'left over' : 'not found'}.
      </p>
    </Fold>
  );
}

export function SignOff({ builtAt, bare = false, queue, onOpenQueue }: {
  builtAt: string; bare?: boolean;
  /** The review queue's state: sign-off waits until nothing is left to decide or waiting. */
  queue?: { open: number; asked: number; total: number }; onOpenQueue?: () => void;
}) {
  const { polished } = useDisplay();
  const built = polished ? fmtDate(builtAt) : new Date(builtAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  return (
    <Fold bare={bare} id="report-signoff" className={cn('group scroll-mt-20 rounded-xl bg-card px-5 ring-1 ring-foreground/10 sm:px-6', bare && 'pt-5')} summary={
      <summary className="flex cursor-pointer list-none items-center gap-2 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" />
        Sign-off
      </summary>}>
      {queue && queue.total > 0 && (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-lg px-4 py-3 text-sm" style={{ background: `color-mix(in srgb, ${TONE_VAR[queue.open + queue.asked ? 'warn' : 'ok']} 8%, transparent)` }}>
          <span className="size-1.5 rounded-full" style={{ background: TONE_VAR[queue.open + queue.asked ? 'warn' : 'ok'] }} aria-hidden="true" />
          {queue.open + queue.asked
            ? <>Not ready to sign: {queue.open + queue.asked} of {queue.total} review items are still open.</>
            : <>Ready to sign: all {queue.total} review items are cleared.</>}
          {onOpenQueue && queue.open + queue.asked > 0 && (
            <button type="button" onClick={onOpenQueue} className="font-medium text-primary underline-offset-4 hover:underline">Open the review queue</button>
          )}
        </p>
      )}
      <div className="grid gap-6 pb-5 text-sm sm:grid-cols-2">
        <div className="space-y-1">
          <div className="text-muted-foreground">Prepared by</div>
          <div>ReconAI · {built}</div>
        </div>
        <div className="space-y-1">
          <div className="text-muted-foreground">Reviewed by</div>
          <div className="h-6 border-b border-border" />
          <div className="pt-2 text-muted-foreground">Date</div>
          <div className="h-6 border-b border-border" />
        </div>
      </div>
    </Fold>
  );
}
