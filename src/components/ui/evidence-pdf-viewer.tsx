'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink, Loader2, MapPin } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import type { CitationLocation, MindmapFileNode, SegmentLike } from '@/lib/evidence-utils';
import { locateCitations, normalizeMatchText } from '@/lib/evidence-utils';
import { cn } from '@/lib/utils';

// Per-session caches (re-selecting a file is instant).
const segmentsCache = new Map<string, SegmentLike[]>();
const pdfCache = new Map<string, Promise<PDFDocumentProxy>>();

// Render the page at ~420 CSS px wide (× devicePixelRatio for crispness).
const RENDER_WIDTH = 420;

let pdfjsPromise: Promise<typeof import('pdfjs-dist')> | null = null;
function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist').then(m => {
      // Turbopack-compatible worker URL (asset emitted from node_modules).
      m.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();
      return m;
    });
  }
  return pdfjsPromise;
}

async function fetchSegments(fileId: string): Promise<SegmentLike[]> {
  const cached = segmentsCache.get(fileId);
  if (cached) return cached;
  const res = await fetch(`/api/docai/files/${fileId}/segments`);
  if (!res.ok) throw new Error(`Segments HTTP ${res.status}`);
  const data = await res.json();
  let segments: SegmentLike[] = data.segments || data.items || [];
  if (!Array.isArray(segments)) segments = Array.isArray(data) ? data : [];
  if (segments.length === 0 && Array.isArray(data)) segments = data;
  segmentsCache.set(fileId, segments);
  return segments;
}

async function getPdfDoc(fileId: string): Promise<PDFDocumentProxy> {
  let promise = pdfCache.get(fileId);
  if (!promise) {
    promise = (async () => {
      const pdfjs = await getPdfJs();
      // One retry: the ngrok tunnel drops connections intermittently.
      const data = await fetchWithRetry(`/api/docai/files/${fileId}/content`);
      return pdfjs.getDocument({ data }).promise;
    })();
    pdfCache.set(fileId, promise);
  }
  return promise;
}

async function fetchWithRetry(url: string, attempts = 2): Promise<ArrayBuffer> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return await res.arrayBuffer();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (err) {
      lastError = err;
    }
    await new Promise(r => setTimeout(r, 500 * (i + 1)));
  }
  throw lastError;
}

export function EvidencePdfViewer({ file }: { file: MindmapFileNode | null }) {
  const [located, setLocated] = useState<CitationLocation[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [page, setPage] = useState<number | null>(null);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  // Refined highlight boxes (percentages of the rendered page) taken from the
  // PDF's own text layer — ground truth for where text actually sits. Falls
  // back to DocAI's boxes when the text layer can't be matched (scanned docs).
  const [refinements, setRefinements] = useState<Record<number, { x1: number; y1: number; x2: number; y2: number }>>({});
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // The parent remounts this component per file (key={file?.id}), so these
  // effects run once per file. All state writes happen inside a deferred
  // callback — the repo lint rejects synchronous setState in effects.
  useEffect(() => {
    if (!file) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      if (!file.fileId) {
        setLocated([]);
        setMisses(file.citations);
        setPdfStatus('idle');
        setPage(null);
        setRefinements({});
        return;
      }
      setPdfStatus('loading');
      setRefinements({});
      try {
        const segments = await fetchSegments(file.fileId);
        if (cancelled) return;
        const { located: locs, misses: miss } = locateCitations(file.citations, segments);
        if (cancelled) return;
        setLocated(locs);
        setMisses(miss);
        // Always show the PDF: the first located citation's page, or page 1
        // when nothing located (highlights are a bonus, the document isn't).
        setActiveIdx(0);
        setPage(locs.length > 0 ? locs[0].page : 1);
        await getPdfDoc(file.fileId); // warm the cache / surface errors
        if (cancelled) return;
        setPdfStatus('ready');
      } catch {
        if (cancelled) return;
        setPdfStatus('error');
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [file?.id, file?.fileId]);

  // Render the cited page to the canvas (imperative; overlays are % positioned).
  useEffect(() => {
    if (pdfStatus !== 'ready' || page == null || !file?.fileId || !canvasRef.current) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      try {
        const doc = await getPdfDoc(file.fileId!);
        const pdfPage = await doc.getPage(page);
        if (cancelled) return;
        const vp1 = pdfPage.getViewport({ scale: 1 });
        const dpr = window.devicePixelRatio || 1;
        const renderScale = (RENDER_WIDTH * dpr) / vp1.width;
        const viewport = pdfPage.getViewport({ scale: renderScale });
        const canvas = canvasRef.current!;
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        // pdfjs-dist v6: render takes the canvas element (not a 2d context).
        await pdfPage.render({ canvas, viewport }).promise;

        // Refine highlight boxes from the rendered page's own text layer —
        // the ground truth for where text actually sits. Isolated in its own
        // try/catch: text extraction must NEVER fail the PDF view (scanned/
        // handwritten docs have no text layer and fall back to DocAI boxes).
        try {
          const textContent = await pdfPage.getTextContent();
          if (cancelled) return;
          const items: Array<{ str: string; transform: number[]; width: number; height: number }> = [];
          for (const it of textContent.items) {
            if ('str' in it) items.push(it);
          }
          const refs: Record<number, { x1: number; y1: number; x2: number; y2: number }> = {};
          for (let i = 0; i < located.length; i++) {
            const loc = located[i];
            if (loc.page !== page) continue;
            // Needle tokens, numeric values first (they're the most distinctive).
            const tokens = (loc.needle || '')
              .split(/\s+/)
              .filter(t => t.length >= 2)
              .sort((a, b) => Number(/\d/.test(b)) - Number(/\d/.test(a)) || b.length - a.length);
            for (const tok of tokens) {
              const normTok = normalizeMatchText(tok);
              const item =
                items.find(it => normalizeMatchText(it.str) === normTok) ??
                items.find(it => normalizeMatchText(it.str).includes(normTok));
              if (!item || !item.width || !item.height) continue;
              const [aScale] = item.transform;
              if (aScale <= 0) continue; // rotated/scaled text runs — keep DocAI box
              // pdfjs v6: convertToViewportPoint returns a [x, y] tuple.
              const bl = vp1.convertToViewportPoint(item.transform[4], item.transform[5]);
              const tr = vp1.convertToViewportPoint(
                item.transform[4] + item.width,
                item.transform[5] - item.height
              );
              refs[i] = {
                x1: (Math.min(bl[0], tr[0]) / vp1.width) * 100,
                y1: (Math.min(bl[1], tr[1]) / vp1.height) * 100,
                x2: (Math.max(bl[0], tr[0]) / vp1.width) * 100,
                y2: (Math.max(bl[1], tr[1]) / vp1.height) * 100,
              };
              break;
            }
          }
          if (cancelled) return;
          setRefinements(refs);
        } catch {
          // Text layer unavailable — DocAI boxes (below) still apply.
        }
      } catch {
        if (cancelled) return;
        setPdfStatus('error');
      }
    }, 0);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [pdfStatus, page, located, file?.id, file?.fileId]);

  const activeLoc = located[activeIdx] ?? null;

  // Highlight box in percentages of the rendered page: text-layer refinement
  // when available, else the DocAI box (already divided by 10 → percent).
  const boxFor = (loc: CitationLocation, idx: number) =>
    refinements[idx] ?? { x1: loc.x1 / 10, y1: loc.y1 / 10, x2: loc.x2 / 10, y2: loc.y2 / 10 };

  // Scroll the page area so the active highlight is centered in view
  // (multipage documents don't require manual hunting).
  useEffect(() => {
    if (pdfStatus !== 'ready' || page == null || !activeLoc || activeLoc.page !== page) return;
    const id = setTimeout(() => {
      const canvas = canvasRef.current;
      const scroller = scrollRef.current;
      if (!canvas || !scroller) return;
      const box = boxFor(activeLoc, activeIdx);
      // Box is a percentage of the rendered canvas.
      const boxTop = (box.y1 / 100) * canvas.offsetHeight;
      const boxBottom = (box.y2 / 100) * canvas.offsetHeight;
      const boxHeight = boxBottom - boxTop;
      scroller.scrollTop = Math.max(0, boxTop - (scroller.clientHeight - boxHeight) / 2);
    }, 80);
    return () => clearTimeout(id);
  }, [pdfStatus, page, activeIdx, located, refinements, activeLoc]);

  return (
    <div className="flex h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-muted/30">
      {file ? (
        <>
          {/* Header: role badge + file name + full-doc escape hatch */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                {file.role}
              </span>
              <span className="truncate font-mono text-xs text-secondary">{file.title}</span>
            </div>
            {file.fileId && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => window.open(`/api/docai/files/${file.fileId}/content`, '_blank')}
              >
                <ExternalLink className="mr-1 size-3.5" />
                Open file
              </Button>
            )}
          </div>

          {/* Page view with highlight overlays */}
          <div ref={scrollRef} className="flex flex-1 items-start justify-center overflow-y-auto p-3">
            {pdfStatus === 'loading' && <Loader2 className="mt-10 size-6 animate-spin text-secondary" />}
            {pdfStatus === 'error' && (
              <p className="mt-10 text-xs text-secondary">Failed to load the PDF. Open file to view it directly.</p>
            )}
            {pdfStatus === 'ready' && page != null && (
              <>
                {located.length === 0 && misses.length > 0 && (
                  <p className="mb-2 w-full max-w-[420px] rounded-md border border-border bg-background/80 px-2 py-1 text-center text-xs text-secondary">
                    Citation not matched to a location — showing page 1
                  </p>
                )}
                <div className="relative w-full max-w-[420px] bg-white shadow-sm">
                  <canvas ref={canvasRef} className="block h-auto w-full" />
                  {located.map((loc, i) => {
                    if (loc.page !== page) return null;
                    const box = boxFor(loc, i);
                    return (
                      <div
                        key={i}
                        className={cn(
                          'pointer-events-none absolute rounded-[2px] border-2 border-yellow-400 bg-yellow-300/40',
                          loc === activeLoc && 'animate-pulse motion-reduce:animate-none'
                        )}
                        style={{
                          left: `${box.x1}%`,
                          top: `${box.y1}%`,
                          width: `${box.x2 - box.x1}%`,
                          height: `${box.y2 - box.y1}%`,
                        }}
                      />
                    );
                  })}
                </div>
              </>
            )}
            {pdfStatus === 'idle' && (
              <p className="mt-10 text-xs text-secondary">
                {file.fileId
                  ? 'No citation could be located on the document.'
                  : 'PDF unavailable for this report (legacy).'}
              </p>
            )}
          </div>

          {/* Citation navigation — click to jump to a page + pulse its highlight */}
          <div className="max-h-40 space-y-1 overflow-y-auto border-t border-border p-2">
            {located.length === 0 && misses.length === 0 && (
              <p className="px-2 py-1 text-xs text-secondary">No citations for this file.</p>
            )}
            {located.map((loc, i) => (
              <button
                key={i}
                onClick={() => {
                  setActiveIdx(i);
                  setPage(loc.page);
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-xs transition-colors',
                  i === activeIdx
                    ? 'border-yellow-400 bg-yellow-50 text-foreground'
                    : 'border-border text-secondary hover:bg-muted'
                )}
              >
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="mr-1 font-mono text-secondary">p{loc.page}</span>
                  <span className="line-clamp-2">{loc.matchedText}</span>
                </span>
              </button>
            ))}
            {misses.map((m, i) => (
              <p
                key={`m${i}`}
                className="border-l-2 border-dashed border-border px-2 py-1 text-xs italic text-secondary/70"
              >
                {m}
              </p>
            ))}
          </div>
        </>
      ) : (
        <p className="p-6 text-center text-xs text-secondary">
          Select a file in the orbit to view its evidence.
        </p>
      )}
    </div>
  );
}
