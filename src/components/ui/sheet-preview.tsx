'use client';
import { useEffect, useState } from 'react';
import { Loader2, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { buildSheetGrids, colLabel, type SheetGrid, type SheetSegment } from '@/lib/sheet-table';

/**
 * Spreadsheet preview for the Files tab, laid out like a sheet: tabs per
 * sheet, column letters, row numbers, gridlines. Built from DocAI's parsed
 * segments (what reconciliation sees), not from the workbook bytes — cells
 * are rendered as text, never as HTML.
 */
export function SheetPreview({ fileId, filename, onClose, className, style }: {
  fileId: string;
  filename: string;
  onClose?: () => void;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [sheets, setSheets] = useState<SheetGrid[]>([]);
  const [active, setActive] = useState(0);

  // Mounted with key={fileId} by the caller, so a file change remounts and
  // the initial 'loading' state is correct without a setState in the effect.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/docai/files/${fileId}/segments`)
      .then(async res => {
        if (!res.ok) throw new Error(`Segments HTTP ${res.status}`);
        const data = await res.json();
        const segs: SheetSegment[] = Array.isArray(data) ? data : data.segments || data.items || [];
        return buildSheetGrids(segs);
      })
      .then(g => { if (!cancelled) { setSheets(g); setStatus('ready'); } })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [fileId]);

  const sheet = sheets[active];
  const cols = sheet ? Array.from({ length: sheet.maxCol }, (_, i) => i + 1) : [];

  return (
    <div
      className={`flex h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm ${className ?? ''}`}
      style={style}
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="truncate font-mono text-xs text-foreground">{filename}</span>
        {onClose && (
          <Button variant="ghost" size="sm" className="px-1.5 text-muted-foreground hover:text-foreground" title="Close pane" onClick={onClose}>
            <XIcon className="size-3.5" />
          </Button>
        )}
      </div>

      {sheets.length > 1 && (
        <div className="flex shrink-0 flex-wrap gap-1.5 border-b border-border/60 bg-muted/15 px-3 py-1.5">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-md border px-2 py-0.5 text-xs ${
                i === active
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/50 bg-background text-muted-foreground hover:text-foreground'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {status === 'loading' && <Loader2 className="mx-auto mt-10 size-6 animate-spin text-muted-foreground" />}
        {status === 'error' && (
          <p className="mt-10 text-center text-xs text-muted-foreground">Failed to load the parsed sheet.</p>
        )}
        {status === 'ready' && !sheet && (
          <p className="mt-10 text-center text-xs text-muted-foreground">No sheet data in this file.</p>
        )}
        {sheet && (
          <table className="border-collapse text-xs">
            <thead className="sticky top-0 z-10 bg-muted/60">
              <tr>
                <th className="sticky left-0 z-20 border-b border-r border-border/50 bg-muted/80 px-2 py-1 text-right font-semibold text-muted-foreground">#</th>
                {cols.map(c => (
                  <th key={c} className="min-w-[120px] border-b border-r border-border/40 px-3 py-1 text-left font-semibold text-muted-foreground">
                    {colLabel(c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.cells.map((row, r) => (
                <tr key={r}>
                  <td className="sticky left-0 z-10 border-r border-border/40 bg-muted/20 px-2 py-1 text-right font-mono text-[11px] text-muted-foreground">
                    {r + 1}
                  </td>
                  {row.map((cell, c) => (
                    <td key={c} className="border-r border-t border-border/30 bg-background px-3 py-1 align-top">
                      <span className="whitespace-pre-wrap break-words">{cell}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
