'use client';
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CreditCard, FileSearch, Loader2, ReceiptText, Scale, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  acct, applyDisplay, findings, fmtDate, money, paneSources, paymentSources, pct, reconcile, rowNote, TONE_VAR,
  type Go, type PettyReport, type Selection, type StatementRow, type Tone,
} from '@/lib/petty-cash-report';
import { DisplayContext, displayFor } from './display';
import { setReportNav, useReportNav, type ReportSection } from '@/lib/report-nav';
import { CitationPane } from './citation-pane';
import { LedgerTable } from './ledger-table';
import { ReceiptsTable } from './receipts-table';
import {
  FindingsList, PaymentSourcesSection, ReconciliationStatement, SignOff, Verdict,
} from './reconciliation';
import { TransactionsTable } from './transactions-table';
import { ReviewQueue } from './review-queue';
import { VatRegister } from './vat-register';
import { Overview } from './overview';
import { MoneyCheck, ReconciliationExplained } from './money-check';
import { AuditTrail } from './audit-trail';
import { EMPTY_REVIEWS, exceptionQueue, queueCounts, type DecisionKey, type Reviews } from '@/lib/review-queue';

type Tab = 'transactions' | 'receipts' | 'ledger';

const TABS: Array<{ key: Tab; label: string; count: (r: PettyReport) => number }> = [
  { key: 'transactions', label: 'Transactions', count: r => r.rows.length },
  { key: 'receipts', label: 'Receipts', count: r => r.receipts.length },
  { key: 'ledger', label: 'Ledger', count: r => r.ledger.length },
];

/** A summary card that is also a shortcut: a light shade of its tone, and a click that opens the rows behind the number. */
function KpiCard({ label, value, sub, tone, icon: Icon, action, active, onClick, small = false }: {
  label: string; value: string; sub: string; tone: Tone; icon: LucideIcon; action: string; active: boolean; onClick: () => void; small?: boolean;
}) {
  const c = TONE_VAR[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group flex flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-all',
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
        active ? 'shadow-md' : 'shadow-sm'
      )}
      style={{
        background: `color-mix(in srgb, ${c} ${active ? 12 : 6}%, var(--card))`,
        borderColor: `color-mix(in srgb, ${c} ${active ? 55 : 20}%, transparent)`,
      }}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md" style={{ color: c, background: `color-mix(in srgb, ${c} 14%, transparent)` }}>
          <Icon className="size-3.5" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      </div>
      <div className={cn('font-semibold leading-tight tabular-nums', small ? 'text-[22px]' : 'text-[28px]')}>{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
      <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium" style={{ color: c }}>
        {action}
        <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
      </div>
    </button>
  );
}

const LG = '(min-width: 1024px)';
/** True at Tailwind's lg breakpoint and up (server render assumes large). */
function useIsLarge(): boolean {
  return useSyncExternalStore(
    onChange => {
      const m = window.matchMedia(LG);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(LG).matches,
    () => true
  );
}

/** The petty-cash report for one workspace: the verdict, KPI cards, risk-ranked findings and the reconciliation statement, then three
 *  tabbed tables, all beside one docked citation pane. */
const SECTION_HEAD: Record<ReportSection, { title: string; hint: string }> = {
  overview: { title: 'Overview', hint: 'The month at a glance: its health, the key numbers and the decisions waiting.' },
  review: { title: 'Review queue', hint: 'Items the matcher could not settle on its own, one at a time, with a suggested decision.' },
  findings: { title: 'Findings', hint: 'What the check found, highest risk first. Open one to see its receipts, statement lines and ledger cells.' },
  payments: { title: 'Payments', hint: "How the month's spending was paid: the petty-cash card, cash and other cards." },
  reconciliation: { title: 'Reconciliation', hint: 'How the card balance ties to the ledger, item by item.' },
  vat: { title: 'VAT register', hint: 'Each invoice’s VAT, verified from its ZATCA QR code, and what is missing where it is not.' },
  transactions: { title: 'Transactions', hint: 'Every card transaction with its receipt, ledger line and a note on how it was settled.' },
  signoff: { title: 'Sign-off', hint: 'Who prepared the reconciliation and who reviewed it.' },
};

/** `actions` is the runner's overflow menu, shown on the report's title row; `onRerun` re-runs the matcher after receipt decisions. */
export function PettyCashReport({ kbId, version, actions, onRerun, rerunBusy }: {
  kbId: string; version: number; actions?: ReactNode; onRerun?: () => void; rerunBusy?: boolean;
}) {
  const [state, setState] = useState<{ report: PettyReport | null; error: string | null }>({ report: null, error: null });
  const [reviews, setReviews] = useState<Reviews>(EMPTY_REVIEWS);
  // a receipt verdict saved since the report was built: the figures show it only after the next run
  const [rerunNeeded, setRerunNeeded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [tab, setTab] = useState<Tab>('transactions');
  const [selection, setSelection] = useState<Selection | null>(null);
  const [statementOpen, setStatementOpen] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [paymentsOpen, setPaymentsOpen] = useState(true);
  const [rowFilter, setRowFilter] = useState('ALL');
  const [receiptFilter, setReceiptFilter] = useState<{ status: string; n: number }>({ status: 'ALL', n: 0 });
  // A card click names the section to bring into view; the scroll waits for the commit, after the other sections have folded.
  const [scrollTarget, setScrollTarget] = useState<{ id: string; n: number } | null>(null);
  const [focusFinding] = useState<{ key: string; n: number } | null>(null);
  // A polished report is laid out as pages, one per section, picked in the sidebar (lib/report-nav).
  const { section } = useReportNav();
  useEffect(() => {
    const r = state.report;
    const rec = r ? reconcile(r) : null;
    const sectioned = Boolean(r?.meta.display?.polished && rec);
    setReportNav(sectioned && r && rec
      ? { sectioned, counts: { review: (q => q.open + q.asked)(queueCounts(exceptionQueue(r), reviews)), findings: findings(r, rec).length, transactions: r.rows.length,
                    vat: r.receipts.filter(g => g.vat?.status === 'not_verified' || g.vat?.status === 'check').length },
          sections: ['overview', 'review', 'findings', 'payments', 'reconciliation', 'vat', 'transactions', 'signoff'] }
      : { sectioned: false, counts: {}, sections: [] });
  }, [state.report, reviews]);
  useEffect(() => {
    if (scrollTarget) document.getElementById(scrollTarget.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [scrollTarget]);

  // `version` is the Run counter: a new run re-fetches; the previous report stays on screen until the new one lands.
  useEffect(() => {
    let cancelled = false;
    const reviewsFetch = fetch(`/api/petty-cash/${kbId}/reviews.json?v=${version}`, { cache: 'no-store' })
      .then(async r => (r.ok ? ((await r.json()) as Reviews) : EMPTY_REVIEWS))   // no decisions yet: the file does not exist
      .catch(() => EMPTY_REVIEWS);
    fetch(`/api/petty-cash/${kbId}/report.json?v=${version}`, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return applyDisplay((await r.json()) as PettyReport);
      })
      .then(async report => {
        const saved = await reviewsFetch;
        if (cancelled) return;
        setState({ report, error: null });
        setReviews(saved);
        setRerunNeeded(false);
        setSelection(s => (s && paneSources(report, s) ? s : null));
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ report: null, error: e instanceof Error ? e.message : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [kbId, version, attempt]);

  const decide = useCallback(async (id: string, decision: DecisionKey | null, note?: string) => {
    const res = await fetch(`/api/petty-cash/${kbId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, decision, note }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not save (HTTP ${res.status})`);
    setReviews(body.reviews);
    if (body.rerun) setRerunNeeded(true);
  }, [kbId]);
  const saveRemarks = useCallback(async (text: string) => {
    const res = await fetch(`/api/petty-cash/${kbId}/review`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ remarks: text }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Could not save (HTTP ${res.status})`);
    setReviews(body.reviews);
  }, [kbId]);
  const closePane = useCallback(() => setSelection(null), []);
  // a saved reading takes effect on the next run: start it straight away, so the invoice clears without another click
  const changedAndRerun = useCallback(() => {
    setRerunNeeded(true);
    onRerun?.();
  }, [onRerun]);
  const onSelect = useCallback((s: Selection) => setSelection(s), []);
  const isLarge = useIsLarge();
  const overlayOpen = Boolean(selection) && !isLarge;
  // The narrow overlay is modal: lock the document's scroll while it is up.
  useEffect(() => {
    if (!overlayOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [overlayOpen]);

  if (state.error) {
    return (
      <Card className="px-6 py-6 text-sm">
        <p className="mb-3">Couldn&apos;t load the petty-cash report ({state.error}).</p>
        <Button
          size="sm"
          onClick={() => {
            setState({ report: null, error: null });
            setAttempt(a => a + 1);
          }}
        >
          Retry
        </Button>
      </Card>
    );
  }
  const report = state.report;
  if (!report) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const sources = selection ? paneSources(report, selection) : null;
  const selectionKey = selection ? JSON.stringify(selection) : '';
  const k = report.kpis;
  const display = displayFor(Boolean(report.meta.display?.polished));
  const built = display.polished
    ? fmtDate(report.meta.built_at)
    : new Date(report.meta.built_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const picked = selection?.kind === 'row' ? report.rows.find(r => r.ref === selection.ref)
    : selection?.kind === 'receipt' ? report.receipts.find(g => g.id === selection.id) : undefined;
  const trail = picked?.evidence ? { items: picked.evidence, basis: picked.basis } : undefined;
  const pane = sources && selection
    ? <CitationPane key={selectionKey} report={report} kbId={kbId} sources={sources} initialSource={selection.source} onClose={closePane} autoFocusClose={!isLarge} trail={trail} />
    : null;

  const rec = reconcile(report);
  const fs = rec ? findings(report, rec) : [];
  // the payment breakdown and the plain-language notes are part of the polished layout (config.json display.polished)
  const paid = rec && display.polished ? paymentSources(report, rec) : null;
  const note = display.polished ? (r: StatementRow) => rowNote(r, report) : undefined;
  // Each card takes the reader to the rows or the statement behind its number and folds the other sections out of the way.
  const focus = (id: string, statement: boolean) => {
    setFindingsOpen(false);
    setPaymentsOpen(false);
    setStatementOpen(statement);
    setScrollTarget(t => ({ id, n: (t?.n ?? 0) + 1 }));
  };
  const paged = Boolean(display.polished && rec);
  const showRows = (status: string) => {
    setTab('transactions');
    setRowFilter(status);
    if (paged) setReportNav({ section: 'transactions' });
    else focus('report-tables', false);
  };
  const showsRows = (status: string) => tab === 'transactions' && rowFilter === status;
  const openStatement = () => (paged ? setReportNav({ section: 'reconciliation' }) : focus('reconciliation-statement', true));
  const compact = Boolean(sources);

  const polished = display.polished && rec;
  // a finding's or a reconciling line's button: the page where it is fixed, with the right table and filter
  const go = (g: Go) => {
    if (g.tab) setTab(g.tab);
    if (g.tab === 'transactions' && g.filter) setRowFilter(g.filter);
    if (g.tab === 'receipts') setReceiptFilter(f => ({ status: g.filter ?? 'ALL', n: f.n + 1 }));
    setReportNav({ section: g.section });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const kpiGrid = (
    <div className={cn('grid gap-3 sm:grid-cols-2', !compact && 'xl:grid-cols-4')}>
      <KpiCard label="Card spend" value={money(k.card_spend)} sub={`SAR · ${k.purchase_count} purchases + ${k.atm_count} ATM withdrawals`}
        tone={display.polished ? 'muted' : 'review'} icon={CreditCard} action="All transactions" small={Boolean(polished)}
        active={!display.polished && showsRows('ALL')} onClick={() => showRows('ALL')} />
      <KpiCard label="Evidenced" value={pct(k.evidenced_amount, k.purchases_amount)} sub={`${money(k.evidenced_amount)} of ${money(k.purchases_amount)} SAR has a receipt`}
        tone="ok" icon={ReceiptText} action="Matched purchases" small={Boolean(polished)} active={showsRows('MATCHED')} onClick={() => showRows('MATCHED')} />
      {rec && k.gap != null
        ? <KpiCard label="Gap: card vs ledger" value={money(k.gap)} sub={`card closing ${(display.polished ? acct : money)(rec.cardClosing)} minus ledger closing ${(display.polished ? acct : money)(rec.ledgerClosing)}`}
            tone="warn" icon={Scale} action="See how it ties" small={Boolean(polished)} active={statementOpen} onClick={openStatement} />
        : <KpiCard label="Open gap" value={money(k.open_gap)} sub={`ledger roll-up ${money(k.rollup)} minus card spend`}
            tone="warn" icon={Scale} action="View the ledger" active={tab === 'ledger'} onClick={() => { setTab('ledger'); focus('report-tables', false); }} />}
      <KpiCard label="Receipts to find" value={String(k.missing_count)} sub={`${money(k.missing_amount)} SAR without a receipt`}
        tone="bad" icon={FileSearch} action="Show them" small={Boolean(polished)} active={showsRows('MISSING_RECEIPT')} onClick={() => showRows('MISSING_RECEIPT')} />
    </div>
  );

  const tables = (
    <div id="report-tables" className="scroll-mt-20 space-y-3">
      <div role="tablist" className="inline-flex flex-wrap gap-1 rounded-full bg-muted p-1">
        {TABS.map(t => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'h-9 rounded-full px-4 text-sm font-medium transition-colors',
              tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
            )}
          >
            {t.label} <span className="tabular-nums opacity-70">{t.count(report)}</span>
          </button>
        ))}
      </div>
      {tab === 'transactions' && (
        <TransactionsTable rows={report.rows} selection={selection} onSelect={onSelect} status={rowFilter} onStatusChange={setRowFilter} compact={compact} note={note} />
      )}
      {tab === 'receipts' && <ReceiptsTable key={receiptFilter.n} initialStatus={receiptFilter.status} report={report} kbId={kbId} selection={selection} onSelect={onSelect} compact={compact} />}
      {tab === 'ledger' && <LedgerTable report={report} />}
    </div>
  );
  const dockedPane = pane && (isLarge
    ? <div className="lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]">{pane}</div>
    // Portal: the sidebar rail is a z-30 sticky element in the root stacking context, which the report's own context cannot climb above.
    : createPortal(
        <div role="dialog" aria-modal="true" aria-label="Evidence" className="fixed inset-0 z-50 bg-background/95 p-3">{pane}</div>,
        document.body
      ));
  const withPane = (body: ReactNode) => (
    // the evidence pane docks beside whatever is showing, so every source opens in the same place
    <div className={cn('gap-4', sources && isLarge && 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(420px,45%)]')}>
      <div className="min-w-0 space-y-5">{body}</div>
      {dockedPane}
    </div>
  );

  if (paged && rec) {
    const head = SECTION_HEAD[section];
    const queue = queueCounts(exceptionQueue(report), reviews);
    const openQueue = () => setReportNav({ section: 'review' });
    const page: Record<ReportSection, ReactNode> = {
      overview: <Overview report={report} rec={rec} fs={fs} onGo={go} queueOpen={queue.open + queue.asked} />,
      review: <ReviewQueue report={report} kbId={kbId} reviews={reviews} onDecide={decide} onSelect={onSelect}
        rerunNeeded={rerunNeeded} onRerun={onRerun} rerunBusy={rerunBusy} compact={Boolean(sources)} onChanged={changedAndRerun} />,
      findings: <FindingsList bare report={report} fs={fs} selection={selection} onSelect={onSelect} open onOpenChange={setFindingsOpen} focus={focusFinding} onGo={go} />,
      payments: paid && <PaymentSourcesSection bare report={report} paid={paid} selection={selection} onSelect={onSelect} open onOpenChange={setPaymentsOpen} />,
      reconciliation: <>
        <MoneyCheck rec={rec} month={report.meta.month} />
        <ReconciliationExplained rec={rec} onGo={go} />
        <details className="group rounded-xl border border-border bg-card px-5">
          <summary className="cursor-pointer py-3 text-sm font-medium text-muted-foreground">For the accountant: the formal reconciliation statement</summary>
          <ReconciliationStatement bare rec={rec} month={report.meta.month} open onOpenChange={setStatementOpen} />
        </details>
      </>,
      vat: <VatRegister report={report} kbId={kbId} selection={selection} onSelect={onSelect} compact={Boolean(sources)}
        rerunNeeded={rerunNeeded} onRerun={onRerun} rerunBusy={rerunBusy} onChanged={changedAndRerun} />,
      transactions: tables,
      signoff: <>
        <SignOff bare builtAt={report.meta.built_at} queue={queue} onOpenQueue={openQueue} />
        <AuditTrail report={report} reviews={reviews} onSaveRemarks={saveRemarks} />
      </>,
    };
    return (
      <DisplayContext.Provider value={display}>
        <div className="space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-0.5">
              <h2 className="text-2xl font-semibold tracking-tight" title={head.hint}>{head.title}</h2>
              <p className="text-sm text-muted-foreground">
                {report.meta.client} · Petty-cash reconciliation · <span className="text-foreground">{report.meta.month_label}</span>
              </p>
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-muted-foreground sm:inline">Built {built}</span>
              {actions}
            </div>
          </header>
          {/* keyed by section so each page starts fresh and the crossfade runs */}
          <div key={section} className="animate-crossfade">{withPane(page[section])}</div>
        </div>
      </DisplayContext.Provider>
    );
  }

  return (
    <DisplayContext.Provider value={display}>
      <div className="space-y-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-h3">{report.meta.client} · {report.meta.month_label}</h3>
            <p className="text-xs text-muted-foreground">Statement · receipts · ledger · built {built}</p>
          </div>
          {actions}
        </header>
        {withPane(<>
          {rec && <Verdict report={report} rec={rec} fs={fs} />}
          {kpiGrid}
          {rec && <FindingsList report={report} fs={fs} selection={selection} onSelect={onSelect} open={findingsOpen} onOpenChange={setFindingsOpen} focus={focusFinding} />}
          {paid && <PaymentSourcesSection report={report} paid={paid} selection={selection} onSelect={onSelect} open={paymentsOpen} onOpenChange={setPaymentsOpen} />}
          {rec && <ReconciliationStatement rec={rec} month={report.meta.month} open={statementOpen} onOpenChange={setStatementOpen} />}
          {tables}
          {rec && <SignOff builtAt={report.meta.built_at} />}
        </>)}
      </div>
    </DisplayContext.Provider>
  );
}
