'use client';
import { cn } from '@/lib/utils';
import { statusMeta, TONE_VAR, type Tone } from '@/lib/petty-cash-report';

/** Status as glyph + word in its tone; the word is always present so colour never carries the meaning alone. */
export function StatusChip({ status }: { status: string | null }) {
  const { word, glyph, tone } = statusMeta(status);
  const c = TONE_VAR[tone];
  return (
    <span
      className="inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 text-[11px] font-semibold"
      style={{ color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` }}
    >
      <b aria-hidden="true">{glyph}</b>
      {word}
    </span>
  );
}

/** A small mono button naming one source ("Receipt p82"); opens that source in the pane. */
export function CitationChip({ label, onClick, active = false, title }: { label: string; onClick: () => void; active?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={e => {
        e.stopPropagation();
        onClick();
      }}
      className={cn(
        'inline-flex h-6 items-center whitespace-nowrap rounded-md border px-2 font-mono text-[11px] transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-card text-muted-foreground hover:border-primary/50 hover:text-foreground'
      )}
    >
      {label}
    </button>
  );
}

/** Pill filter with its count; counts come from the unfiltered list. A `tone` adds a status dot and a tinted count;
 *  an empty filter is dimmed so the eye goes to the ones with rows in them. */
export function FilterChip({ label, count, active, onClick, tone }: { label: string; count: number; active: boolean; onClick: () => void; tone?: Tone }) {
  const c = tone ? TONE_VAR[tone] : undefined;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary text-primary-foreground shadow-sm'
          : 'border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted',
        !active && count === 0 && 'opacity-50'
      )}
    >
      {c && !active && <span aria-hidden="true" className="size-1.5 rounded-full" style={{ background: c }} />}
      {label}
      <span
        className={cn('min-w-5 rounded-full px-1.5 text-center text-[11px] tabular-nums', active ? 'bg-white/20' : 'bg-muted')}
        style={c && !active && count ? { color: c, background: `color-mix(in srgb, ${c} 12%, transparent)` } : undefined}
      >
        {count}
      </span>
    </button>
  );
}
