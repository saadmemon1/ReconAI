'use client';
import { useState } from 'react';
import { Loader2, ScanLine, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { money, TONE_VAR } from '@/lib/petty-cash-report';

const input = 'h-9 w-full rounded-lg border border-input bg-transparent px-3 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50';
const fmt = (n: number | null | undefined) => (n == null ? '' : n.toFixed(2));

export interface Prefill { total: number | null; vat: number | null; vatNo: string | null; vatNoNote?: string | null }

/** Edit what ReconAI read on an invoice: prefilled with its total, VAT and the seller's VAT number, so usually only the VAT number needs
 *  adding. Only what the person changes is saved, with them as the author; the reconciliation then re-runs so the invoice clears.
 *  QR text from a phone scan can be pasted instead: the server checks it like a decoded code. */
export function ManualEntry({ kbId, receiptId, prefill, onSaved, onClose }: {
  kbId: string; receiptId: string; prefill: Prefill; onSaved: () => void; onClose: () => void;
}) {
  const [total, setTotal] = useState(fmt(prefill.total));
  const [vat, setVat] = useState(fmt(prefill.vat));
  const [vatNo, setVatNo] = useState(prefill.vatNo ?? '');
  const [qr, setQr] = useState('');
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // a proposed number (not yet anyone's entry) is saved when the person saves it unchanged: saving is the confirmation
  const changed = {
    total: total.trim() !== fmt(prefill.total) ? total.trim() : undefined,
    vat: vat.trim() !== fmt(prefill.vat) ? vat.trim() : undefined,
    vat_no: vatNo.trim() !== (prefill.vatNo ?? '') || (prefill.vatNoNote && vatNo.trim()) ? vatNo.trim() : undefined,
    qr: qr.trim() || undefined,
  };
  const nothing = Object.values(changed).every(v => v === undefined || v === '');
  const t = Number(total), v = Number(vat);
  const expected = total && Number.isFinite(t) ? Math.round(t * 15 / 115 * 100) / 100 : null;
  const off = expected != null && vat !== '' && Number.isFinite(v) && v !== 0 && Math.abs(v - expected) > 0.02;

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/petty-cash/${kbId}/entry`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ receipt: receiptId, ...changed }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || `Could not save (HTTP ${res.status})`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Edit invoice {receiptId}</span>
        <Button size="icon-sm" variant="ghost" aria-label="Close" title="Close" onClick={onClose}><X className="size-4" /></Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">Seller VAT number
          <input className={input} inputMode="numeric" value={vatNo} onChange={e => setVatNo(e.target.value)} placeholder="3xxxxxxxxxxxxx3" autoFocus={!prefill.vatNo} />
          {prefill.vatNoNote && <span className="block text-[11px]" style={{ color: TONE_VAR.review }}>{prefill.vatNoNote}</span>}
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">Total (SAR)
          <input className={input} inputMode="decimal" value={total} onChange={e => setTotal(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">VAT (SAR)
          <input className={input} inputMode="decimal" value={vat} onChange={e => setVat(e.target.value)} />
        </label>
      </div>
      {off && <p className="text-xs" style={{ color: TONE_VAR.bad }}>15% VAT on {money(t)} is {money(expected)}: check the VAT figure.</p>}
      {showQr ? (
        <textarea value={qr} onChange={e => setQr(e.target.value)} rows={2} placeholder="Paste the text the phone camera shows when it scans the QR code"
          className="w-full resize-none rounded-lg border border-input bg-transparent px-3 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      ) : (
        <button type="button" onClick={() => setShowQr(true)} className="inline-flex items-center gap-1 text-xs text-primary underline-offset-4 hover:underline">
          <ScanLine className="size-3.5" /> Paste QR text instead
        </button>
      )}
      <div className="flex items-center gap-3">
        <Button size="sm" disabled={busy || nothing} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />}Save and clear</Button>
        <span className="text-xs text-muted-foreground">Saved as your entry, then the reconciliation re-runs.</span>
      </div>
      {error && <p role="alert" className="text-xs" style={{ color: TONE_VAR.bad }}>{error}</p>}
    </div>
  );
}
