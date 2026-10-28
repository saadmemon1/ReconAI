'use client';
import { useState } from 'react';
import { Check, FileText, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { fmtDate, money, TONE_VAR, type PettyReport } from '@/lib/petty-cash-report';
import type { Reviews } from '@/lib/review-queue';

/** How the report was prepared, in words a finance team reads: the files it used, what ReconAI did, how each decision was made and the
 *  safeguards, the rules a person set, and the reviewer's own remarks. The technical record (code version, file fingerprints) stays
 *  available for IT and auditors, folded away. */
export function AuditTrail({ report, reviews, onSaveRemarks }: {
  report: PettyReport; reviews: Reviews; onSaveRemarks: (text: string) => Promise<void>;
}) {
  const a = report.meta.audit;
  if (!a) return null;
  const files = report.meta.files ?? {};
  const purchases = report.rows.filter(r => r.kind === 'purchase');
  const matched = purchases.filter(r => r.receipt_ids.length).length;
  const qr = report.receipts.filter(g => g.qr);
  const signed = qr.filter(g => g.qr?.signature === 'verified').length;
  const withheld = report.receipts.filter(g => g.unreadable).length;
  const byPerson = report.receipts.filter(g => g.amount_source === 'human' || g.seller_vat?.source === 'person').length
    + Object.keys(reviews.decisions).length;
  const proposals = [...purchases, ...report.receipts].filter(x => x.basis === 'proposed').length;
  const missing = [...purchases, ...report.receipts].filter(x => x.basis === 'needs_evidence').length;
  const agreed = [...purchases, ...report.receipts].filter(x => x.basis === 'agreed').length;
  const rule = a.rules?.rounding;
  const confidence = Math.round((a.confidence_min ?? 0.7) * 100);

  return (
    <section aria-label="How this report was prepared" className="space-y-5 rounded-xl border border-border bg-card px-5 py-5 sm:px-6">
      <h3 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-5" style={{ color: TONE_VAR.ok }} />How this report was prepared</h3>

      <Block title="What ReconAI worked from">
        <ul className="space-y-1">
          {files.statement && <li><FileText className="mr-1.5 inline size-3.5 text-muted-foreground" />Card statement: <span className="font-medium">{files.statement}</span></li>}
          {files.receipts && <li><FileText className="mr-1.5 inline size-3.5 text-muted-foreground" />Receipts: <span className="font-medium">{files.receipts}</span> ({report.meta.page_images.receipts.length} pages)</li>}
          {files.ledger && <li><FileText className="mr-1.5 inline size-3.5 text-muted-foreground" />Ledger: <span className="font-medium">{files.ledger}</span>{report.meta.sheet && <>, sheet &ldquo;{report.meta.sheet}&rdquo;</>}</li>}
        </ul>
      </Block>

      <Block title="What it did">
        <p>
          Read all {report.receipts.length} receipts and matched {matched} of the {purchases.length} card payments to their receipts.
          It read the ZATCA QR code on {qr.length} invoices{signed ? `, and on ${signed} of them confirmed the seller's digital signature, so those codes are genuine and unaltered` : ''}.
          It then compared the card statement with the ledger and listed every difference it could explain.
        </p>
      </Block>

      <Block title="How the decisions were made">
        <ul className="space-y-1.5">
          <Remark ok>{agreed} items needed no judgement: the receipt, the card statement and the ledger agree on their own.</Remark>
          {byPerson > 0 && <Remark ok>{byPerson} {byPerson === 1 ? 'decision was' : 'decisions were'} made by a person in the app, signed as theirs.</Remark>}
          <Remark>{proposals} {proposals === 1 ? 'item is' : 'items are'} ReconAI&apos;s suggestions: a possible match, or a cash or other-card call read from the receipt. Each is marked as a suggestion and waits for a person to accept or change it.</Remark>
          <Remark>{missing} items are missing something (a receipt, a VAT number, a total). ReconAI says so instead of filling the gap.</Remark>
          {withheld > 0 && <Remark>{withheld} {withheld === 1 ? 'receipt was' : 'receipts were'} too faded or handwritten to read with confidence. ReconAI left the amount out rather than guess.</Remark>}
          <Remark>ReconAI only uses what it read when it is at least {confidence}% sure; anything less goes to a person.</Remark>
        </ul>
      </Block>

      <Block title="Rules a person set">
        {rule && rule.max > 0
          ? <p>Rounding: a card payment up to {money(rule.max)} SAR {rule.applies === 'either' ? 'above or below' : 'below'} the invoice is accepted as rounding. Set by {rule.by ?? 'an unrecorded author'}{rule.at ? ` on ${fmtDate(rule.at)}` : ''}.</p>
          : <p className="text-muted-foreground">No rules set. Every difference between a card payment and its invoice goes to a person.</p>}
      </Block>

      <ReviewerRemarks reviews={reviews} onSave={onSaveRemarks} />

      <details className="rounded-lg border border-border px-4">
        <summary className="cursor-pointer py-2.5 text-sm text-muted-foreground">Technical details for IT and auditors</summary>
        <dl className="grid gap-x-6 gap-y-1.5 pb-3 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">
          <dt className="text-muted-foreground">Prepared</dt><dd>{fmtDate(report.meta.built_at)}</dd>
          <dt className="text-muted-foreground">Software version</dt><dd className="font-mono">{a.pipeline ?? 'not recorded'}</dd>
          <dt className="text-muted-foreground">QR reader</dt><dd className="font-mono">{a.qr_decoder ?? 'not run'}</dd>
          <dt className="text-muted-foreground">File fingerprints</dt>
          <dd className="space-y-0.5 font-mono">
            {Object.entries(a.inputs).map(([f, h]) => <div key={f}>{f} <span className="text-muted-foreground">{h}</span></div>)}
            <div className="pt-1 font-sans text-muted-foreground">If any input file changes, its fingerprint changes, so this report can be shown to come from exactly these files.</div>
          </dd>
        </dl>
      </details>
    </section>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 text-sm">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
      {children}
    </div>
  );
}

function Remark({ ok = false, children }: { ok?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-2">
      <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[ok ? 'ok' : 'review'] }} aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

/** The reviewer's own remarks for the file, saved with the month and shown to whoever opens the report next. */
function ReviewerRemarks({ reviews, onSave }: { reviews: Reviews; onSave: (text: string) => Promise<void> }) {
  const saved = reviews.remarks;
  const [text, setText] = useState(saved?.text ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const changed = text.trim() !== (saved?.text ?? '');
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSave(text);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-2 text-sm">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Reviewer&apos;s remarks</h4>
      <textarea value={text} onChange={e => { setText(e.target.value); setDone(false); }} rows={3} maxLength={2000}
        placeholder="e.g. Cash receipts confirmed with Ahmed on 30 Oct. Ledger detail for MISC/2026/09/0031 requested from the accountant."
        className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" />
      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" disabled={busy || !changed} onClick={save}>{busy && <Loader2 className="size-3.5 animate-spin" />}Save remarks</Button>
        {done && !changed && <span className="inline-flex items-center gap-1 text-xs" style={{ color: TONE_VAR.ok }}><Check className="size-3.5" />Saved</span>}
        {saved && <span className="text-xs text-muted-foreground">Last saved by {saved.by}, {fmtDate(saved.at)}</span>}
        {error && <span role="alert" className="text-xs" style={{ color: TONE_VAR.bad }}>{error}</span>}
      </div>
    </div>
  );
}
