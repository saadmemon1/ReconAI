'use client';
import { Check, CircleAlert, CircleHelp } from 'lucide-react';
import { acct, fmtDate, money, pct, TONE_VAR, type Go, type Reconciliation } from '@/lib/petty-cash-report';
import { GoButton } from './reconciliation';

/** The card-versus-ledger check in one card: the two month-end balances, how far apart they are, and how much of that ReconAI can
 *  explain. One bar, explained and not, so nobody has to add signed parts in their head. */
export function MoneyCheck({ rec, month, onOpen }: { rec: Reconciliation; month: string; onOpen?: () => void }) {
  const [y, m] = month.split('-').map(Number);
  const end = fmtDate(new Date(Date.UTC(y, m, 0)).toISOString());
  const share = rec.difference ? Math.min(1, Math.max(0, rec.explained / rec.difference)) : 1;
  const done = rec.unreconciled === 0;
  const tone = done ? 'ok' : 'warn';
  return (
    <section aria-label="Card and ledger check" className="space-y-4 rounded-xl border border-border bg-card px-5 py-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label={`Card statement on ${end}`} value={money(rec.cardClosing)} />
        <Figure label={`Ledger on ${end}`} value={acct(rec.ledgerClosing)} />
        <Figure label="They differ by" value={money(rec.difference)} strong />
      </div>
      <div className="space-y-2">
        <div className="flex h-2.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${pct(rec.explained, rec.difference)} explained`}>
          <span style={{ width: `${share * 100}%`, background: TONE_VAR.ok }} />
          {!done && <span style={{ width: `${(1 - share) * 100}%`, background: TONE_VAR.warn }} />}
        </div>
        <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
          <p>
            <span className="font-medium" style={{ color: TONE_VAR.ok }}>{money(rec.explained)} SAR explained</span>
            <span className="text-muted-foreground"> ({pct(rec.explained, rec.difference)}), each by a receipt, a card payment or a ledger entry</span>
            {!done && <> · <span className="font-medium" style={{ color: TONE_VAR[tone] }}>{money(rec.unreconciled)} SAR still unexplained</span></>}
          </p>
          {onOpen && (
            <button type="button" onClick={onOpen} className="text-sm font-medium text-primary underline-offset-4 hover:underline">See why, line by line</button>
          )}
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={strong ? 'text-2xl font-semibold tabular-nums' : 'text-xl tabular-nums'}>{value} <span className="text-xs font-normal text-muted-foreground">SAR</span></div>
    </div>
  );
}

/** The reconciliation as an explanation: every reason the card and the ledger differ, in a sentence, with what it adds up to and where
 *  to fix it; then what is left over, and what would explain it. */
export function ReconciliationExplained({ rec, onGo }: { rec: Reconciliation; onGo: (g: Go) => void }) {
  const lines = rec.items.filter(i => i.amount !== 0);
  const quiet = rec.items.filter(i => i.amount === 0);
  return (
    <section className="space-y-3">
      <p className="max-w-[80ch] text-sm text-muted-foreground">
        Each line below is a reason the two balances differ: something the ledger booked that the card never paid, or something the card paid
        that the ledger never booked. Together they explain {money(rec.explained)} of the {money(rec.difference)} SAR.
      </p>
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {lines.map(i => {
          const action = i.state === 'action';
          return (
            <div key={i.key} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4">
              <span className="mt-0.5" style={{ color: TONE_VAR[action ? 'warn' : 'ok'] }} aria-label={action ? 'Needs action' : 'Explained'}>
                {action ? <CircleAlert className="size-5" /> : <Check className="size-5" />}
              </span>
              <div className="min-w-[14rem] flex-1 space-y-0.5">
                <div className="font-medium">{i.label}</div>
                <p className="text-sm text-muted-foreground">{i.plain}</p>
                <p className="text-xs text-muted-foreground">{i.detail}</p>
              </div>
              <div className="text-right">
                <div className="font-mono text-base font-semibold tabular-nums">{money(Math.abs(i.amount))}</div>
                <div className="text-[11px] text-muted-foreground">
                  {i.key === 'opening' ? (i.amount > 0 ? 'the card started higher' : 'the ledger started higher')
                    : i.amount > 0 ? 'in the ledger, not on the card' : 'on the card, not in the ledger'}
                </div>
              </div>
              {action && <div className="flex w-full justify-end sm:w-auto"><GoButton go={i.go} onGo={onGo} /></div>}
            </div>
          );
        })}
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2 px-5 py-4" style={{ background: `color-mix(in srgb, ${TONE_VAR.warn} 7%, transparent)` }}>
          <span className="mt-0.5" style={{ color: TONE_VAR.warn }}><CircleHelp className="size-5" /></span>
          <div className="min-w-[14rem] flex-1 space-y-0.5">
            <div className="font-medium">Still unexplained</div>
            <p className="text-sm text-muted-foreground">
              {rec.rollupCodes.length
                ? `The ledger books the month as one total (${rec.rollupCodes.join(', ')}, ${money(rec.rollup)}). This part of it has no receipt or card payment behind it. The accountant's list of entries behind that total would show what it is.`
                : 'No receipt, card payment or ledger entry explains this part yet.'}
            </p>
          </div>
          <div className="text-right">
            <div className="font-mono text-base font-semibold tabular-nums" style={{ color: TONE_VAR.warn }}>{money(Math.abs(rec.unreconciled))}</div>
          </div>
        </div>
      </div>
      {quiet.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Checked and in agreement: {quiet.map(i => `${i.label.toLowerCase()} (${i.detail})`).join('; ')}.
        </p>
      )}
    </section>
  );
}
