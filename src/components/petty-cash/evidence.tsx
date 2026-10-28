'use client';
import { Bot, Cpu, FileWarning, GitCompareArrows, ScrollText, ShieldCheck, UserRound, type LucideIcon } from 'lucide-react';
import { TONE_VAR, type Basis, type EvidenceItem, type Strength, type Tone } from '@/lib/petty-cash-report';

/** How much weight each source carries, said in words: colour never carries the meaning alone. */
export const STRENGTH: Record<Strength, { word: string; tone: Tone; Icon: LucideIcon }> = {
  machine: { word: 'Machine-read', tone: 'ok', Icon: Cpu },
  rule: { word: 'Rule', tone: 'ok', Icon: ScrollText },
  human: { word: 'Person', tone: 'ok', Icon: UserRound },
  ai: { word: 'AI', tone: 'review', Icon: Bot },
  unattributed: { word: 'No author', tone: 'warn', Icon: FileWarning },
  missing: { word: 'Missing', tone: 'bad', Icon: FileWarning },
  conflict: { word: 'Conflict', tone: 'bad', Icon: GitCompareArrows },
};

export const BASIS: Record<Basis, { word: string; line: string; tone: Tone }> = {
  agreed: { word: 'Sources agree', line: 'Independent sources agree exactly; no judgement was needed.', tone: 'ok' },
  rule: { word: 'Accepted by a rule', line: 'A difference inside a rule a person set, such as the rounding rule.', tone: 'ok' },
  human: { word: 'Decided by a person', line: 'A named person made this call.', tone: 'ok' },
  proposed: { word: 'Proposal', line: 'ReconAI has a suggestion, but a person must accept it before it counts.', tone: 'review' },
  needs_evidence: { word: 'Needs evidence', line: 'Something is missing, so ReconAI makes no call.', tone: 'bad' },
};

export function BasisTag({ basis }: { basis?: Basis }) {
  if (!basis) return null;
  const b = BASIS[basis];
  return (
    <span title={b.line} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium"
      style={{ color: TONE_VAR[b.tone], background: `color-mix(in srgb, ${TONE_VAR[b.tone]} 10%, transparent)` }}>
      <ShieldCheck className="size-3" aria-hidden="true" />{b.word}
    </span>
  );
}

/** "How we know": every fact behind a verdict, its source, and how much it can be trusted. */
export function EvidenceTrail({ items, basis, title = 'How we know' }: { items: EvidenceItem[]; basis?: Basis; title?: string }) {
  if (!items.length) return null;
  return (
    <section aria-label={title} className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h4>
        <BasisTag basis={basis} />
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
        {items.map((e, i) => {
          const s = STRENGTH[e.strength] ?? STRENGTH.ai;
          return (
            <li key={i} className="flex items-start gap-3 px-3 py-2 text-sm">
              <span className="mt-0.5 inline-flex w-[6.5rem] shrink-0 items-center gap-1 text-[11px] font-medium" style={{ color: TONE_VAR[s.tone] }}>
                <s.Icon className="size-3.5 shrink-0" aria-hidden="true" />{s.word}
              </span>
              <span className="min-w-0 flex-1">
                {e.text}
                {e.reason && <span className="block text-xs text-muted-foreground">Why: {e.reason}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
