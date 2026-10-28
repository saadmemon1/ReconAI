'use client';
import { ArrowRight, BadgePercent, CreditCard, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money, pct, TONE_VAR, type Finding, type Go, type PettyReport, type Reconciliation, type Tone } from '@/lib/petty-cash-report';
import { MoneyCheck } from './money-check';
import { SEVERITY } from './reconciliation';

/** The first page anyone sees: is the month in order, what ReconAI did, and a numbered list of what still needs a person, each with
 *  the button that takes them to the exact place to do it. Plain words throughout. */
export function Overview({ report, rec, fs, onGo, queueOpen }: {
  report: PettyReport; rec: Reconciliation; fs: Finding[]; onGo: (g: Go) => void; queueOpen: number;
}) {
  const todo = fs.filter(f => f.go && f.severity !== 'low');
  const minor = fs.filter(f => f.go && f.severity === 'low');
  const purchases = report.rows.filter(r => r.kind === 'purchase');
  const withReceipt = purchases.filter(r => r.receipt_ids.length);
  const vatOk = report.receipts.filter(g => g.vat?.status === 'reclaimable');
  const vatAmt = vatOk.reduce((a, g) => a + (g.vat?.amount ?? 0), 0);
  const vatOpen = report.receipts.filter(g => g.vat?.status === 'not_verified' || g.vat?.status === 'check').length;
  const cash = rec.cash.amount, other = rec.otherCard.amount;
  const ready = todo.length === 0;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium"
          style={{ color: TONE_VAR[ready ? 'ok' : 'warn'], background: `color-mix(in srgb, ${TONE_VAR[ready ? 'ok' : 'warn']} 10%, transparent)` }}>
          <span className="size-1.5 rounded-full" style={{ background: TONE_VAR[ready ? 'ok' : 'warn'] }} aria-hidden="true" />
          {ready ? 'Ready to sign off' : 'Not ready to sign off yet'}
        </span>
        <h2 className="text-2xl font-semibold tracking-tight">
          {ready ? `${report.meta.month_label} checks out.` : `${todo.length} ${todo.length === 1 ? 'thing needs' : 'things need'} you before ${report.meta.month_label} can be signed off.`}
        </h2>
        <p className="max-w-[80ch] text-sm text-muted-foreground">
          ReconAI checked {purchases.length} card payments, {report.receipts.length} receipts and the ledger. It matched {withReceipt.length} payments to their
          receipts on its own. Everything below links to the page where it is fixed.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-3">
        <Tile icon={CreditCard} tone="ok" label="Card payments with a receipt" value={`${withReceipt.length} of ${purchases.length}`}
          sub={`${pct(withReceipt.reduce((a, r) => a + r.amount, 0), purchases.reduce((a, r) => a + r.amount, 0))} of the money spent on the card`}
          onClick={() => onGo({ label: '', section: 'transactions', tab: 'transactions', filter: 'ALL' })} />
        <Tile icon={BadgePercent} tone={vatOpen ? 'review' : 'ok'} label="VAT you can reclaim" value={`${money(vatAmt)} SAR`}
          sub={`${vatOk.length} invoices${vatOpen ? ` · ${vatOpen} need a check` : ''}`} onClick={() => onGo({ label: '', section: 'vat' })} />
        <Tile icon={Wallet} tone={other ? 'bad' : 'muted'} label="Paid outside the petty-cash card" value={`${money(cash + other)} SAR`}
          sub={`cash ${money(cash)} · someone else's card ${money(other)}`} onClick={() => onGo({ label: '', section: 'payments' })} />
      </div>

      {todo.length > 0 && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold">What needs you, most urgent first</h3>
          <ol className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {todo.map((f, n) => (
              <li key={f.key} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                  style={{ color: TONE_VAR[SEVERITY[f.severity].tone], background: `color-mix(in srgb, ${TONE_VAR[SEVERITY[f.severity].tone]} 12%, transparent)` }}>
                  {n + 1}
                </span>
                <div className="min-w-[14rem] flex-1">
                  <div className="font-medium">{f.title}{f.amount != null && <span className="ml-2 font-mono text-sm font-normal tabular-nums text-muted-foreground">{money(f.amount)} SAR</span>}</div>
                  <div className="text-sm text-muted-foreground">{f.action}</div>
                </div>
                <button type="button" onClick={() => onGo(f.go!)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90">
                  {f.go!.label} <ArrowRight className="size-4" />
                </button>
              </li>
            ))}
          </ol>
          {(minor.length > 0 || queueOpen > 0) && (
            <p className="text-xs text-muted-foreground">
              {minor.map(f => f.title).join(' · ')}{minor.length > 0 && ' · '}
              <button type="button" onClick={() => onGo({ label: '', section: 'findings' })} className="font-medium text-primary underline-offset-4 hover:underline">See all findings</button>
            </p>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-sm font-semibold">Does the card agree with the ledger?</h3>
        <MoneyCheck rec={rec} month={report.meta.month} onOpen={() => onGo({ label: '', section: 'reconciliation' })} />
      </section>
    </div>
  );
}

function Tile({ icon: Icon, tone, label, value, sub, onClick }: { icon: LucideIcon; tone: Tone; label: string; value: string; sub: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('group flex flex-col gap-1 rounded-xl border border-border bg-card px-5 py-4 text-left transition-colors hover:bg-muted/40')}>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="flex size-6 items-center justify-center rounded-md" style={{ color: TONE_VAR[tone], background: `color-mix(in srgb, ${TONE_VAR[tone]} 12%, transparent)` }}>
          <Icon className="size-3.5" />
        </span>
        {label}
        <ArrowRight className="ml-auto size-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </span>
      <span className="text-2xl font-semibold tabular-nums tracking-tight">{value}</span>
      <span className="text-xs text-muted-foreground">{sub}</span>
    </button>
  );
}

