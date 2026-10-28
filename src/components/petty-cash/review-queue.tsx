'use client';
import { useMemo, useState } from 'react';
import { Check, FileSearch, Loader2, PenLine, RefreshCw, Sparkles, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { imageUrl, money, TONE_VAR, type PettyReport, type Selection, type Tone } from '@/lib/petty-cash-report';
import {
  DECISIONS, exceptionQueue, itemState, KIND_WORD, queueCounts, type DecisionKey, type ExceptionItem, type QueueState, type Reviews,
} from '@/lib/review-queue';
import { useDisplay } from './display';
import { EvidenceTrail } from './evidence';
import { ManualEntry } from './manual-entry';
import { RulesBox } from './rules-box';
import { Tag } from './reconciliation';

const TABS: Array<{ key: QueueState; label: string }> = [
  { key: 'open', label: 'To decide' },
  { key: 'asked', label: 'Waiting' },
  { key: 'cleared', label: 'Cleared' },
];
const STATE_TONE: Record<QueueState, Tone> = { open: 'review', asked: 'warn', cleared: 'ok' };

/** The review queue, laid out like a bank-reconciliation screen: what is left to decide on the left, one item on the right with the
 *  card line and the receipt side by side, ReconAI's suggestion, and the decision buttons. A decision moves on to the next item. */
export function ReviewQueue({ report, kbId, reviews, onDecide, onSelect, rerunNeeded, onRerun, rerunBusy, compact, onChanged }: {
  report: PettyReport;
  kbId: string;
  reviews: Reviews;
  onDecide: (id: string, decision: DecisionKey | null, note?: string) => Promise<void>;
  onSelect: (s: Selection) => void;
  /** A receipt verdict was saved that the figures do not show until the matcher runs again. */
  rerunNeeded: boolean;
  onRerun?: () => void;
  rerunBusy?: boolean;
  /** The evidence pane is docked beside the queue: stack the list above the item. */
  compact: boolean;
  /** A reading or a rule was saved: the figures change after a re-run. */
  onChanged: () => void;
}) {
  const items = useMemo(() => exceptionQueue(report), [report]);
  const counts = queueCounts(items, reviews);
  const [tab, setTab] = useState<QueueState>(counts.open ? 'open' : counts.asked ? 'asked' : 'cleared');
  const shown = items.filter(i => itemState(i, reviews) === tab);
  const [currentId, setCurrentId] = useState<string | null>(shown[0]?.id ?? null);
  // The selection stays on the tab that is showing: an item that has left it (decided, or another tab picked) gives way to the first.
  const current = shown.find(i => i.id === currentId) ?? shown[0] ?? null;

  const decide = async (item: ExceptionItem, decision: DecisionKey | null, note?: string) => {
    const index = shown.findIndex(i => i.id === item.id);
    await onDecide(item.id, decision, note);
    // move to the item that was below this one, which is the next one still to decide
    const next = shown.filter(i => i.id !== item.id)[Math.min(index, shown.length - 2)];
    setCurrentId(next?.id ?? null);
  };

  const done = counts.cleared;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-border bg-card px-5 py-3.5">
        <div className="min-w-48 flex-1 space-y-1.5">
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-medium">{counts.open + counts.asked === 0 ? 'Every item is cleared' : `${done} of ${counts.total} cleared`}</span>
            <span className="text-xs text-muted-foreground">{counts.open} to decide · {counts.asked} waiting on the card holder</span>
          </div>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span style={{ width: `${(done / Math.max(counts.total, 1)) * 100}%`, background: TONE_VAR.ok }} />
            <span style={{ width: `${(counts.asked / Math.max(counts.total, 1)) * 100}%`, background: TONE_VAR.warn }} />
          </div>
        </div>
        {rerunNeeded && (
          <div className="flex items-center gap-3 text-xs">
            <span className="text-muted-foreground">Saved decisions, readings and rules change the figures after a re-run.</span>
            {onRerun && (
              <Button size="sm" variant="outline" onClick={onRerun} disabled={rerunBusy}>
                {rerunBusy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Re-run
              </Button>
            )}
          </div>
        )}
      </div>

      <RulesBox report={report} kbId={kbId} onChanged={onChanged} />

      <div className={cn('grid gap-4', !compact && 'lg:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]')}>
        <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div role="tablist" className="m-1.5 flex gap-1 rounded-lg bg-muted/60 p-1">
            {TABS.map(t => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors',
                  tab === t.key ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t.label} <span className="tabular-nums opacity-70">{counts[t.key]}</span>
              </button>
            ))}
          </div>
          <ul className={cn('divide-y divide-border overflow-y-auto border-t border-border', compact ? 'max-h-64' : 'lg:max-h-[calc(100vh-15rem)]')}>
            {shown.map(it => (
              <QueueRow key={it.id} item={it} reviews={reviews} active={current?.id === it.id} onClick={() => setCurrentId(it.id)} />
            ))}
            {shown.length === 0 && (
              <li className="px-4 py-10 text-center text-sm text-muted-foreground">
                {tab === 'open' ? 'Nothing left to decide.' : tab === 'asked' ? 'No questions out with the card holder.' : 'Nothing cleared yet.'}
              </li>
            )}
          </ul>
        </div>

        {current
          ? <ItemDetail key={current.id} item={current} kbId={kbId} reviews={reviews} onDecide={decide} onSelect={onSelect} onChanged={onChanged} />
          : (
            <div className="flex min-h-64 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-sm text-muted-foreground">
              <Check className="size-5" style={{ color: TONE_VAR.ok }} />
              {counts.open + counts.asked === 0 ? 'The review is complete. The month is ready for sign-off.' : 'Pick an item on the left.'}
            </div>
          )}
      </div>
    </div>
  );
}

function QueueRow({ item, reviews, active, onClick }: { item: ExceptionItem; reviews: Reviews; active: boolean; onClick: () => void }) {
  const { date } = useDisplay();
  const state = itemState(item, reviews);
  const d = reviews.decisions[item.id];
  const status = d ? DECISIONS[d.decision].done : item.earlier?.word ?? item.label ?? KIND_WORD[item.kind];
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        aria-current={active ? 'true' : undefined}
        className={cn(
          'flex w-full items-start gap-3 border-l-2 px-4 py-3 text-left transition-colors',
          active ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-muted/40'
        )}
      >
        <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[STATE_TONE[state]] }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium" title={item.merchant}>{item.merchant}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.date ? `${date(item.date)} · ` : ''}{status}</span>
        </span>
        <span className="whitespace-nowrap text-sm tabular-nums">{money(item.amount)}</span>
      </button>
    </li>
  );
}

/** The card statement's line as text, with the scanned line under it at full size (it scrolls sideways) for anyone checking the read. */
function StatementLine({ line, crop, onOpen }: { line: NonNullable<ExceptionItem['statementLine']>; crop: string | null; onOpen: () => void }) {
  const { date } = useDisplay();
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="flex items-baseline justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Card statement</span>
        <span className="text-sm font-semibold tabular-nums">{money(line.amount)}</span>
      </div>
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 px-3 py-3 text-sm sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]">
        <div><dt className="text-[11px] text-muted-foreground">Date</dt><dd className="whitespace-nowrap">{date(line.date)}{line.time && <span className="text-muted-foreground"> · {line.time.slice(0, 5)}</span>}</dd></div>
        <div className="min-w-0"><dt className="text-[11px] text-muted-foreground">Description, as printed</dt><dd className="break-words font-mono text-[13px]">{line.description}</dd></div>
        <div><dt className="text-[11px] text-muted-foreground">Card ref</dt><dd className="font-mono text-[13px] tabular-nums">{line.ref}</dd></div>
        <div className="text-right"><dt className="text-[11px] text-muted-foreground">Amount</dt><dd className="font-medium tabular-nums">{money(line.amount)}</dd></div>
      </dl>
      {crop && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-muted-foreground">
            <span>Scanned line, enlarged · scroll sideways</span>
            <button type="button" onClick={onOpen} className="font-medium text-primary underline-offset-4 hover:underline">See it on the page</button>
          </div>
          <div className="overflow-x-auto px-3 pb-3 pt-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element -- served by the report route; the scan is ~18px tall, so it is drawn at twice that */}
            <img src={crop} alt="The statement line as scanned" className="h-9 w-auto max-w-none bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

function Crop({ label, src, amount, empty, onOpen }: { label: string; src: string | null; amount: number | null; empty: string; onOpen?: () => void }) {
  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-border">
      <div className="flex items-baseline justify-between gap-2 border-b border-border bg-muted/50 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{amount == null ? '—' : money(amount)}</span>
      </div>
      {src ? (
        <button type="button" onClick={onOpen} title="Open the full page" className="flex justify-center bg-white p-2 transition-opacity hover:opacity-90">
          {/* eslint-disable-next-line @next/next/no-img-element -- served by the report route, sized by the crop itself */}
          <img src={src} alt={label} className="max-h-80 w-full object-contain object-top" />
        </button>
      ) : (
        <div className="flex items-center justify-center px-3 py-8 text-center text-xs text-muted-foreground">{empty}</div>
      )}
    </div>
  );
}

function ItemDetail({ item, kbId, reviews, onDecide, onSelect, onChanged }: {
  item: ExceptionItem; kbId: string; reviews: Reviews; onChanged: () => void;
  onDecide: (item: ExceptionItem, decision: DecisionKey | null, note?: string) => Promise<void>;
  onSelect: (s: Selection) => void;
}) {
  const { date } = useDisplay();
  const saved = reviews.decisions[item.id];
  const [note, setNote] = useState(saved?.note ?? '');
  const [busy, setBusy] = useState<DecisionKey | 'undo' | null>(null);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: DecisionKey | 'undo') => {
    setBusy(key);
    setError(null);
    try {
      await onDecide(item, key === 'undo' ? null : key, key === 'undo' ? undefined : note.trim() || undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(null);
    }
  };
  const diff = item.cardAmount != null && item.receiptAmount != null ? Math.round((item.cardAmount - item.receiptAmount) * 100) / 100 : null;
  const open = (source: 'statement' | 'receipt') => onSelect({ ...item.selection, source } as Selection);
  const ordered = [item.suggested, ...item.options.filter(o => o !== item.suggested)];

  return (
    <article aria-label={item.merchant} className="space-y-5 rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <Tag word={item.label ?? KIND_WORD[item.kind]} tone={item.kind === 'missing' ? 'bad' : item.kind === 'differ' ? 'warn' : 'review'} />
          <h3 className="truncate text-lg font-semibold tracking-tight" title={item.merchant}>{item.merchant}</h3>
          <p className="text-xs text-muted-foreground">
            {item.date ? date(item.date) : 'No date on the receipt'}
            {item.id.startsWith('row:') && <> · card ref {item.id.slice(4)}</>}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => open(item.kind === 'missing' ? 'statement' : 'receipt')}>
          <FileSearch className="size-3.5" /> Open evidence
        </Button>
      </header>

      <div className="space-y-3">
        {item.statementLine && (
          <StatementLine line={item.statementLine} crop={item.statementCrop && imageUrl(kbId, item.statementCrop)} onOpen={() => open('statement')} />
        )}
        <Crop label="Receipt" src={item.receiptCrops[0] ? imageUrl(kbId, item.receiptCrops[0]) : null} amount={item.receiptAmount}
          empty="No receipt in the pack matches this payment." onOpen={() => open('receipt')} />
      </div>

      <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
        {diff != null && diff !== 0 && (
          <>
            <dt className="text-muted-foreground">Difference</dt>
            <dd className="font-medium tabular-nums">{money(Math.abs(diff))} SAR, card {diff > 0 ? 'higher' : 'lower'}</dd>
          </>
        )}
        <dt className="text-muted-foreground">What we found</dt>
        <dd>{item.earlier?.note ?? item.problem}</dd>
        {item.ledger && (
          <>
            <dt className="text-muted-foreground">Ledger</dt>
            <dd>Booked inside {item.ledger.code} ({item.ledger.cell}), the month&apos;s roll-up, which has no line detail.</dd>
          </>
        )}
      </dl>

      <EvidenceTrail items={item.evidence} />

      {item.receiptIds[0] && (editing
        ? <ManualEntry kbId={kbId} receiptId={item.receiptIds[0]} prefill={item.read ?? { total: null, vat: null, vatNo: null }} onSaved={onChanged} onClose={() => setEditing(false)} />
        : (
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <PenLine className="size-3.5" /> Edit
          </Button>
        ))}

      {item.earlier && !saved ? (
        <p className="flex items-center gap-2 rounded-lg bg-muted/50 px-4 py-3 text-sm">
          <Check className="size-4 shrink-0" style={{ color: TONE_VAR.ok }} />
          Settled in an earlier review: <span className="font-medium">{item.earlier.word}</span>
          {item.earlier.by ? <span className="text-muted-foreground"> · decided by {item.earlier.by}</span> : '.'}
        </p>
      ) : saved ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg px-4 py-3 text-sm" style={{ background: `color-mix(in srgb, ${TONE_VAR[saved.decision === 'ask' ? 'warn' : 'ok']} 8%, transparent)` }}>
          <Check className="size-4 shrink-0" style={{ color: TONE_VAR[saved.decision === 'ask' ? 'warn' : 'ok'] }} />
          <span className="min-w-0 flex-1">
            <span className="font-medium">{DECISIONS[saved.decision].done}</span>
            {saved.note && <span className="text-muted-foreground"> · {saved.note}</span>}
            <span className="block text-xs text-muted-foreground">Decided {date(saved.at)}</span>
          </span>
          {saved.decision === 'ask' && item.options.filter(o => o !== 'ask').map(o => (
            <Button key={o} size="sm" variant="outline" disabled={busy !== null} onClick={() => run(o)}>
              {busy === o && <Loader2 className="size-3.5 animate-spin" />}{DECISIONS[o].label}
            </Button>
          ))}
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => run('undo')}>
            {busy === 'undo' ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />} Undo
          </Button>
        </div>
      ) : (
        <div className="space-y-3 border-t border-border pt-4">
          <p className="flex gap-2 text-sm">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" />
            <span><span className="font-medium">ReconAI suggests: </span>{item.suggestion}</span>
          </p>
          {item.proposal && (
            <p className="rounded-lg px-3 py-2 text-xs" style={{ background: `color-mix(in srgb, ${TONE_VAR.review} 8%, transparent)` }}>
              <span className="font-medium">Proposed{item.proposal.by ? ` by ${item.proposal.by}` : ' with no author recorded'}: {item.proposal.word}.</span>{' '}
              Not counted in the figures until you decide.
            </p>
          )}
          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Note for the file (optional), e.g. who you asked or what the receipt shows"
            className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <div className="flex flex-wrap gap-2">
            {ordered.map((o, i) => (
              <Button key={o} size="sm" variant={i === 0 ? 'primary' : 'outline'} disabled={busy !== null} onClick={() => run(o)}>
                {busy === o && <Loader2 className="size-3.5 animate-spin" />}{DECISIONS[o].label}
              </Button>
            ))}
          </div>
          {error && <p role="alert" className="text-xs" style={{ color: TONE_VAR.bad }}>{error}</p>}
        </div>
      )}
    </article>
  );
}
