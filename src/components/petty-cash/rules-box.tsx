'use client';
import { useState } from 'react';
import { ListChecks, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate, money, TONE_VAR, type PettyReport } from '@/lib/petty-cash-report';

/** The order ReconAI works in. It is the same for every invoice, so nobody has to guess why one was treated differently. */
export const DECISION_ORDER = [
  'Read the parsed invoice: the total, the VAT and the seller’s VAT number, citing the page and the box they came from.',
  'Decode the ZATCA QR code (two scanners): it confirms the invoice, or fills what the invoice is missing.',
  'VAT is accepted from the invoice, the QR or a person; a receipt with no VAT figure claims none. A vendor’s VAT number is used on all its invoices.',
  'Only when ReconAI cannot find or calculate it, or two sources disagree: ask a person to read the invoice or scan the QR with a phone.',
  'Match to the card statement on the exact amount; a difference is accepted only by the rounding rule below or by a person.',
  'Match to the ledger; where the ledger has no line for it, say so.',
];

/** The rules box: the decision order, the fixed checks, and the rounding rule a person sets (off until someone sets it). */
export function RulesBox({ report, kbId, onChanged }: { report: PettyReport; kbId: string; onChanged: () => void }) {
  const a = report.meta.audit;
  const rule = a?.rules?.rounding;
  const [max, setMax] = useState(rule ? String(rule.max) : '');
  const [applies, setApplies] = useState<'card_less' | 'either'>(rule?.applies ?? 'card_less');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const differences = report.rows.filter(r => r.difference);
  const limit = Number(max);
  const wouldCover = Number.isFinite(limit) && limit > 0
    ? differences.filter(r => Math.abs(r.difference!) <= limit + 1e-9 && (applies === 'either' || r.difference! < 0)).length : 0;

  const save = async (value: string) => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/petty-cash/${kbId}/rules`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ max: value || '0', applies }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not save (HTTP ${res.status})`);
      setMsg({ tone: 'ok', text: Number(value) > 0 ? 'Rule saved, signed as Reviewer (app). Re-run to apply it.' : 'Rule turned off. Re-run to apply.' });
      onChanged();
    } catch (e) {
      setMsg({ tone: 'bad', text: e instanceof Error ? e.message : 'Could not save' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <details className="rounded-xl border border-border bg-card">
      <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-sm font-medium">
        <ListChecks className="size-4 text-muted-foreground" /> How ReconAI decides, and the rules
        <span className="ml-auto text-xs font-normal text-muted-foreground">
          Rounding rule: {rule && rule.max > 0 ? `up to ${money(rule.max)} SAR ${rule.applies === 'either' ? 'either way' : 'below the invoice'}` : 'off'}
        </span>
      </summary>
      <div className="grid gap-6 border-t border-border px-5 py-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">The order, every invoice</h4>
          <ol className="list-decimal space-y-1 pl-5 text-sm">{DECISION_ORDER.map(s => <li key={s}>{s}</li>)}</ol>
          <p className="text-xs text-muted-foreground">
            Fixed checks: an AI read below {a?.confidence_min?.toFixed(2) ?? '0.70'} confidence is not used; VAT must add up to within {money(a?.vat_tolerance ?? 0.02)} SAR;
            a QR signature that cannot be checked is never called invalid. ReconAI proposes; only a person decides.
          </p>
        </div>
        <div className="space-y-3">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Rounding rule</h4>
          <p className="text-sm">
            Shops often drop the halalas: the card pays 313.00 on a 313.95 invoice. Set how much difference counts as rounding. Matching lines are
            marked &ldquo;accepted by the rounding rule&rdquo;, with your name, never as matched. Larger differences stay with a person.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-xs text-muted-foreground">Up to (SAR)
              <input value={max} onChange={e => setMax(e.target.value)} inputMode="decimal" placeholder="0.99"
                className="h-9 w-24 rounded-lg border border-input bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
            </label>
            <label className="space-y-1 text-xs text-muted-foreground">When
              <select value={applies} onChange={e => setApplies(e.target.value as 'card_less' | 'either')}
                className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring">
                <option value="card_less">the card paid less than the invoice</option>
                <option value="either">the card paid less or more</option>
              </select>
            </label>
            <Button size="sm" disabled={busy} onClick={() => save(max)}>{busy && <Loader2 className="size-3.5 animate-spin" />}Save rule</Button>
            {rule && rule.max > 0 && <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setMax(''); save('0'); }}>Turn off</Button>}
          </div>
          <p className="text-xs text-muted-foreground">
            {Number.isFinite(limit) && limit > 0 ? `With this limit, ${wouldCover} of the ${differences.length} payments that differ from their invoice would be accepted.` : `${differences.length} payments differ from their invoice.`}
            {rule?.by && <> Current rule set by {rule.by}{rule.at ? `, ${fmtDate(rule.at)}` : ''}.</>}
          </p>
          {msg && <p role="status" className="text-xs" style={{ color: TONE_VAR[msg.tone] }}>{msg.text}</p>}
        </div>
      </div>
    </details>
  );
}
