'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ExternalLink, Loader2, MapPin, XIcon, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { Button } from '@/components/ui/button';
import type { CitationLocation, MindmapFileNode, SegmentLike } from '@/lib/evidence-utils';
import { extractCitationNeedle, locateCitations, normalizeMatchText } from '@/lib/evidence-utils';
import { cn } from '@/lib/utils';

// Per-session caches (re-selecting a file is instant).
const segmentsCache = new Map<string, SegmentLike[]>();
const pdfCache = new Map<string, Promise<PDFDocumentProxy>>();

// Render pages at ~520 CSS px wide (× devicePixelRatio for crispness) —
// fills a half-width pane; smaller panes just use min(100%, …).
const RENDER_WIDTH = 520;
const PAGE_GAP = 12; // matches the mb-3 between page cards

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

type Box = { x1: number; y1: number; x2: number; y2: number };
type TextItemLike = { str: string; transform: number[]; width: number; height: number };
type ViewportLike = {
  width: number;
  height: number;
  convertToViewportPoint: (x: number, y: number) => number[];
};

/**
 * Find the text item matching a needle (numeric tokens first, exact then
 * contains) and return its box as percentages of the page. The rendered
 * PDF's own text layer is the ground truth for where text actually sits.
 */
function findTextBox(
  items: TextItemLike[],
  needle: string,
  vp1: ViewportLike
): Box | null {
  const tokens = normalizeMatchText(needle)
    .split(/\s+/)
    .filter(t => t.length >= 2)
    .sort((a, b) => Number(/\d/.test(b)) - Number(/\d/.test(a)) || b.length - a.length);
  const itemBox = (item: TextItemLike): Box | null => {
    if (!item.width || !item.height) return null;
    const [aScale] = item.transform;
    if (aScale <= 0) return null; // rotated/scaled text runs
    // pdfjs v6: convertToViewportPoint returns a [x, y] tuple.
    const bl = vp1.convertToViewportPoint(item.transform[4], item.transform[5]);
    const tr = vp1.convertToViewportPoint(
      item.transform[4] + item.width,
      item.transform[5] - item.height
    );
    return {
      x1: (Math.min(bl[0], tr[0]) / vp1.width) * 100,
      y1: (Math.min(bl[1], tr[1]) / vp1.height) * 100,
      x2: (Math.max(bl[0], tr[0]) / vp1.width) * 100,
      y2: (Math.max(bl[1], tr[1]) / vp1.height) * 100,
    };
  };
  for (const tok of tokens) {
    const normTok = normalizeMatchText(tok);
    // Variants: the bare number ('185,000' for '185,000.00') and a comma-
    // stripped form — covers PDFs that split or format numbers differently.
    const candidates = [normTok, normTok.replace(/\.\d+$/, ''), normTok.replace(/,/g, '')].filter(
      (c, i, arr) => c.length >= 2 && arr.indexOf(c) === i
    );
    for (const candidate of candidates) {
      const item =
        items.find(it => normalizeMatchText(it.str) === candidate) ??
        items.find(it => normalizeMatchText(it.str).includes(candidate));
      const box = item ? itemBox(item) : null;
      if (box) return box;
    }
    // Digit-equivalence: a numeric token can be split across text runs
    // ('185,000' + '.00') or use different separators — compare digit-only
    // forms, single item first, then adjacent pairs.
    if (/\d/.test(normTok)) {
      const want = normTok.replace(/[^0-9]/g, '');
      if (want.length >= 3) {
        for (let i = 0; i < items.length; i++) {
          const a = items[i];
          if (!a.width || !a.height) continue;
          if (a.str.replace(/[^0-9]/g, '') === want) {
            const box = itemBox(a);
            if (box) return box;
          }
          const b = items[i + 1];
          if (b && b.width && b.height && a.str.replace(/[^0-9]/g, '') + b.str.replace(/[^0-9]/g, '') === want) {
            const ba = itemBox(a);
            const bb = itemBox(b);
            if (ba && bb) {
              return {
                x1: Math.min(ba.x1, bb.x1),
                y1: Math.min(ba.y1, bb.y1),
                x2: Math.max(ba.x2, bb.x2),
                y2: Math.max(ba.y2, bb.y2),
              };
            }
          }
        }
      }
    }
  }
  return null;
}

export function EvidencePdfViewer({ file, onClose, className, style }: { file: MindmapFileNode | null; onClose?: () => void; className?: string; style?: React.CSSProperties }) {
  const [located, setLocated] = useState<CitationLocation[]>([]);
  const [misses, setMisses] = useState<string[]>([]);
  const [textHits, setTextHits] = useState<Array<{ key: string; citation: string; page: number; box: Box }>>([]);
  const [pdfStatus, setPdfStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [numPages, setNumPages] = useState(0);
  // Refined highlight boxes (percentages of the page) from the text layer.
  const [refinements, setRefinements] = useState<Record<number, Box>>({});
  const [activeKey, setActiveKey] = useState<string | null>(null);
  // Becomes true once every page canvas has been drawn — the scroll math
  // needs real canvas heights and must not run mid-draw.
  const [pagesReady, setPagesReady] = useState(false);
  // A' mode: by default only pages carrying highlights render (auto-centered
  // on the active highlight); "All pages" expands to the full document.
  const [showAllPages, setShowAllPages] = useState(false);
  // Multi-stage zoom (1× → 2× → 3×). Re-renders pages at a higher scale so
  // the zoom stays crisp; the view re-centers on the active highlight.
  const [zoom, setZoom] = useState(1);
  const zoomIn = () => setZoom(z => (z >= 3 ? 3 : z + 1));
  const zoomOut = () => setZoom(z => (z <= 1 ? 1 : z - 1));
  // Render pages at the pane's ACTUAL inner width (measured) — no fixed cap,
  // so pages always fill the pane no matter how wide it is. Falls back to
  // RENDER_WIDTH until the first measurement.
  const [paneWidth, setPaneWidth] = useState(RENDER_WIDTH);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pagesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const textCacheRef = useRef<Map<number, TextItemLike[]>>(new Map());

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
        setNumPages(0);
        setRefinements({});
        setTextHits([]);
        setPagesReady(false);
        return;
      }
      setPdfStatus('loading');
      setRefinements({});
      setTextHits([]);
      setPagesReady(false);
      try {
        const segments = await fetchSegments(file.fileId);
        if (cancelled) return;
        const { located: locs, misses: miss } = locateCitations(file.citations, segments);
        if (cancelled) return;
        setLocated(locs);
        setMisses(miss);
        const doc = await getPdfDoc(file.fileId); // warm the cache / surface errors
        if (cancelled) return;
        setNumPages(doc.numPages);

        // Text-layer pass over every page: refine located boxes and
        // text-locate unmatched citations (a born-digital quote is right there
        // in the rendered PDF even when segment matching missed).
        const refs: Record<number, Box> = {};
        const hits: Array<{ key: string; citation: string; page: number; box: Box }> = [];
        const foundMiss = new Set<number>();
        for (let p = 1; p <= doc.numPages; p++) {
          if (cancelled) return;
          const pdfPage = await doc.getPage(p);
          const vp1 = pdfPage.getViewport({ scale: 1 });
          let items = textCacheRef.current.get(p);
          if (!items) {
            items = [];
            try {
              const tc = await pdfPage.getTextContent();
              for (const it of tc.items) {
                if ('str' in it) items.push(it);
              }
            } catch {}
            textCacheRef.current.set(p, items);
          }
          for (let i = 0; i < locs.length; i++) {
            const loc = locs[i];
            if (loc.page !== p) continue;
            const box = findTextBox(items, loc.needle, vp1);
            if (box) refs[i] = box;
          }
          for (let m = 0; m < miss.length; m++) {
            if (foundMiss.has(m)) continue;
            const box = findTextBox(items, extractCitationNeedle(miss[m]), vp1);
            if (box) {
              foundMiss.add(m);
              hits.push({ key: `t${m}`, citation: miss[m], page: p, box });
            }
          }
        }
        if (cancelled) return;
        setRefinements(refs);
        setTextHits(hits);
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

  // Track the scroller's inner width so pages render at the pane's real size
  // (a ResizeObserver catches pane re-layouts, e.g. 2-up → 3-up in the
  // Evidences dialog). Measure the BORDER-BOX width (getBoundingClientRect),
  // not clientWidth: clientWidth excludes the scrollbar, so its value shifts
  // whenever pages render and the scrollbar appears — that would feed a
  // redraw loop. 24px = the scroller's p-3 padding.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setPaneWidth(Math.max(320, Math.floor(el.getBoundingClientRect().width - 24)));
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [file?.fileId]);

  // A' mode: which pages render. By default only pages carrying highlights
  // (located or text-located) — the pane IS the evidence. "All pages" shows
  // the full document. Files with NO citations (e.g. the Files-tab preview)
  // always show the full document and hide the citation UI.
  const hasCitations = located.length > 0 || misses.length > 0 || textHits.length > 0;
  const effectiveShowAll = showAllPages || !hasCitations;
  const visiblePages = useMemo(() => {
    if (effectiveShowAll) return Array.from({ length: numPages }, (_, i) => i + 1);
    const pages = new Set<number>();
    for (const loc of located) pages.add(loc.page);
    for (const h of textHits) pages.add(h.page);
    const list = [...pages].sort((a, b) => a - b);
    return list.length > 0 ? list : numPages > 0 ? [1] : [];
  }, [effectiveShowAll, numPages, located, textHits]);

  // Draw every visible page's canvas (text-layer work already happened in the
  // load effect). pagesReady flips so the scroll effect re-centers after a
  // mode toggle or a redraw.
  useEffect(() => {
    if (pdfStatus !== 'ready' || !file?.fileId || visiblePages.length === 0) return;
    let cancelled = false;
    // Trailing debounce: during drag-resize the ResizeObserver fires per
    // frame, and pdfjs throws "Cannot use the same canvas during multiple
    // render() operations" when a new render starts while the previous one is
    // still painting that canvas — that threw in the CURRENT (uncancelled)
    // run and flipped the viewer to "failed to load". Re-rendering only after
    // the width settles (~120ms quiet) keeps renders serialized.
    const id = setTimeout(async () => {
      setPagesReady(false);
      try {
        const doc = await getPdfDoc(file.fileId!);
        const dpr = window.devicePixelRatio || 1;
        for (const p of visiblePages) {
          if (cancelled) return;
          try {
            const pdfPage = await doc.getPage(p);
            const vp1 = pdfPage.getViewport({ scale: 1 });
            const renderScale = (paneWidth * zoom * dpr) / vp1.width;
            const viewport = pdfPage.getViewport({ scale: renderScale });
            const canvas = pagesRef.current.get(p);
            if (!canvas) continue;
            canvas.width = Math.floor(viewport.width);
            canvas.height = Math.floor(viewport.height);
            canvas.style.width = '100%';
            canvas.style.height = 'auto';
            // pdfjs-dist v6: render takes the canvas element (not a 2d context).
            await pdfPage.render({ canvas, viewport }).promise;
          } catch {
            // Render abort (canvas reclaimed by a newer redraw) is expected
            // mid-resize — NEVER an error state; the next redraw repaints.
            if (cancelled) return;
          }
        }
        if (cancelled) return;
        setPagesReady(true);
      } catch {
        if (cancelled) return;
        setPdfStatus('error');
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [pdfStatus, visiblePages, zoom, paneWidth, file?.id, file?.fileId]);

  // Unified highlight rows: matcher results (DocAI box, refined by the text
  // layer when available) + text-located misses.
  const rows = useMemo(
    () => [
      ...located.map((loc, i) => ({
        key: `m${i}`,
        page: loc.page,
        box: refinements[i] ?? { x1: loc.x1 / 10, y1: loc.y1 / 10, x2: loc.x2 / 10, y2: loc.y2 / 10 },
        label: loc.matchedText,
      })),
      ...textHits.map(h => ({ key: h.key, page: h.page, box: h.box, label: h.citation })),
    ],
    [located, textHits, refinements]
  );
  const activeRowKey = activeKey ?? rows[0]?.key ?? null;

  // Citations that are still genuinely unlocated (text-layer scan failed too).
  const missedKeys = new Set(textHits.map(h => h.key));
  const stillMissed = misses.filter((_, i) => !missedKeys.has(`t${i}`));

  // Scroll the stack so a row's highlight is centered. Called imperatively
  // from the nav click (no effect-timing dependence) and from the effect
  // for the initial/load scroll.
  const scrollToKey = (key: string) => {
    const row = rows.find(r => r.key === key);
    const scroller = scrollRef.current;
    if (!row || !scroller) return;
    let offset = 0;
    for (const p of visiblePages) {
      if (p >= row.page) break;
      offset += pagesRef.current.get(p)?.offsetHeight ?? 0;
      offset += PAGE_GAP;
    }
    const canvas = pagesRef.current.get(row.page);
    if (!canvas) return;
    const boxMidY = (row.box.y1 + row.box.y2) / 2;
    const boxMidX = (row.box.x1 + row.box.x2) / 2;
    offset += (boxMidY / 100) * canvas.offsetHeight - scroller.clientHeight / 2;
    // Smooth scroll (instant under prefers-reduced-motion); center the box
    // horizontally too when the zoomed page overflows the pane.
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollTo({
      top: Math.max(0, offset),
      left: Math.max(0, (boxMidX / 100) * canvas.offsetWidth - scroller.clientWidth / 2),
      behavior: reduced ? 'auto' : 'smooth',
    });
  };

  // Scroll the active highlight into view (across the whole page stack).
  // Runs after every page canvas has been drawn (pagesReady) and on zoom
  // changes — the offset math needs real heights at the current scale.
  useEffect(() => {
    if (pdfStatus !== 'ready' || !pagesReady || !activeRowKey) return;
    const id = setTimeout(() => {
      scrollToKey(activeRowKey);
      // A 3× canvas is ~9MP; if the browser is still settling the repaint
      // when the smooth scroll starts, it can be dropped (Safari). Retry
      // once after a frame so the center always lands.
      requestAnimationFrame(() => {
        if (scrollRef.current) scrollToKey(activeRowKey);
      });
    }, 250);
    return () => clearTimeout(id);
  }, [pdfStatus, pagesReady, activeRowKey, rows, visiblePages, zoom]);

  return (
    <div
      className={cn(
        'flex h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-muted/30',
        className
      )}
      style={style}
    >
      {file ? (
        <>
          {/* Header: file name + controls (role badge removed — it ate space) */}
          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs text-foreground">{file.title}</span>
            </div>
            {file.fileId && (
              <div className="flex shrink-0 items-center gap-1">
                <div className="flex items-center gap-0.5 rounded-md border border-border px-1">
                  <button
                    className="rounded p-0.5 text-secondary hover:text-foreground disabled:opacity-30"
                    onClick={zoomOut}
                    disabled={zoom <= 1}
                    title="Zoom out"
                  >
                    <ZoomOut className="size-3.5" />
                  </button>
                  <span className="min-w-6 text-center text-xs tabular-nums text-secondary">×{zoom}</span>
                  <button
                    className="rounded p-0.5 text-secondary hover:text-foreground disabled:opacity-30"
                    onClick={zoomIn}
                    disabled={zoom >= 3}
                    title="Zoom in"
                  >
                    <ZoomIn className="size-3.5" />
                  </button>
                </div>
                {hasCitations && (
                  <div className="flex items-center gap-1.5" title={showAllPages ? 'Showing all pages' : 'Showing cited pages only'}>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={showAllPages}
                      onClick={() => setShowAllPages(v => !v)}
                      className={cn(
                        'relative h-4 w-7 shrink-0 cursor-pointer rounded-full transition-colors',
                        showAllPages ? 'bg-primary' : 'bg-border'
                      )}
                    >
                      <span
                        className={cn(
                          'absolute left-0.5 top-0.5 size-3 rounded-full bg-background shadow transition-transform',
                          showAllPages && 'translate-x-3'
                        )}
                      />
                    </button>
                    <span className="text-[11px] text-secondary">{showAllPages ? 'All pages' : 'Cited'}</span>
                  </div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="px-1.5"
                  title="Open file in a new tab"
                  onClick={() => window.open(`/api/docai/files/${file.fileId}/content`, '_blank')}
                >
                  <ExternalLink className="size-3.5" />
                </Button>
                {onClose && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="px-1.5 text-secondary hover:text-foreground"
                    title="Close pane"
                    onClick={onClose}
                  >
                    <XIcon className="size-3.5" />
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Full-document scrollable page stack with highlight overlays */}
          <div ref={scrollRef} className="flex-1 overflow-auto p-3">
            {pdfStatus === 'loading' && <Loader2 className="mx-auto mt-10 size-6 animate-spin text-secondary" />}
            {pdfStatus === 'error' && (
              <p className="mt-10 text-center text-xs text-secondary">Failed to load the PDF. Open file to view it directly.</p>
            )}
            {pdfStatus === 'ready' && (
              <>
                {stillMissed.length > 0 && (
                  <p className="mb-2 w-full max-w-[420px] rounded-md border border-border bg-background/80 px-2 py-1 text-center text-xs text-secondary">
                    {stillMissed.length} citation{stillMissed.length === 1 ? '' : 's'} not matched to a location
                  </p>
                )}
                {visiblePages.map(p => {
                  const pageRows = rows.filter(r => r.page === p);
                  return (
                    <div
                      key={p}
                      className="relative mb-3 bg-white shadow-sm"
                      style={{
                        // Zoom: the card grows beyond the pane and the scroller
                        // pans; canvases re-render at scale so the zoom is crisp.
                        // Base width = the pane's measured inner width.
                        // At zoom 1 the card fills the scroller edge-to-edge
                        // (100%) — a centered min(100%, paneWidth) card left
                        // gray margins on the right when the measured width
                        // lagged the panel (Files-tab complaint, Aug 2026).
                        width: zoom > 1 ? `${Math.round(paneWidth * zoom)}px` : '100%',
                        marginBottom: p === visiblePages[visiblePages.length - 1] ? 0 : PAGE_GAP,
                      }}
                    >
                      <canvas
                        ref={el => {
                          if (el) pagesRef.current.set(p, el);
                          else pagesRef.current.delete(p);
                        }}
                        className="block h-auto w-full"
                      />
                      {pageRows.map(r => (
                        <div
                          key={r.key}
                          className={cn(
                            'absolute rounded-[2px] border-2 border-yellow-400 bg-yellow-300/40',
                            r.key === activeRowKey
                              ? 'pointer-events-auto animate-pulse cursor-zoom-in motion-reduce:animate-none'
                              : 'pointer-events-none'
                          )}
                          style={{
                            left: `${r.box.x1}%`,
                            top: `${r.box.y1}%`,
                            width: `${r.box.x2 - r.box.x1}%`,
                            height: `${r.box.y2 - r.box.y1}%`,
                          }}
                          onClick={r.key === activeRowKey ? zoomIn : undefined}
                          title={r.key === activeRowKey ? 'Click to zoom in' : undefined}
                        />
                      ))}
                    </div>
                  );
                })}
              </>
            )}
            {pdfStatus === 'idle' && (
              <p className="mt-10 text-center text-xs text-secondary">
                {file.fileId
                  ? 'No citation could be located on the document.'
                  : 'PDF unavailable for this report (legacy).'}
              </p>
            )}
          </div>

          {/* Citation navigation — click to scroll to its page + pulse.
              Hidden entirely when the file carries no citations. */}
          {hasCitations && (
          <div className="max-h-40 space-y-1 overflow-y-auto border-t border-border p-2">
            {rows.length === 0 && misses.length === 0 && (
              <p className="px-2 py-1 text-xs text-secondary">No citations for this file.</p>
            )}
            {rows.map(r => (
              <button
                key={r.key}
                onClick={() => {
                  setActiveKey(r.key);
                  // Scroll immediately — do not depend on effect timing.
                  scrollToKey(r.key);
                }}
                className={cn(
                  'flex w-full items-start gap-2 rounded-md border-l-2 px-2 py-1.5 text-left text-xs transition-colors',
                  r.key === activeRowKey
                    ? 'border-yellow-400 bg-yellow-50 text-foreground'
                    : 'border-border text-secondary hover:bg-muted'
                )}
              >
                <MapPin className="mt-0.5 size-3 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="mr-1 font-mono text-secondary">p{r.page}</span>
                  <span className="line-clamp-2">{r.label}</span>
                </span>
              </button>
            ))}
            {stillMissed.map((m, i) => (
              <p
                key={`miss${i}`}
                className="border-l-2 border-dashed border-border px-2 py-1 text-xs italic text-secondary/70"
              >
                {m}
              </p>
            ))}
          </div>
          )}
        </>
      ) : (
        <p className="p-6 text-center text-xs text-secondary">
          Select a file in the orbit to view its evidence.
        </p>
      )}
    </div>
  );
}
