'use client';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { boxStyle, type Box } from '@/lib/petty-cash-report';
import { cn } from '@/lib/utils';

export type PageBox = { page: number; box: Box; primary: boolean; label: string };

const DEFAULT_ASPECT = 1.414; // A4 until the image reports its own size

/**
 * DocAI's image-mode page viewer, rebuilt small: every page of the file as a lazy <img> with the cited boxes drawn
 * in 0-1000 space on top, centred on the primary box whenever the citation, zoom or jump signal changes.
 *
 * Structure per page: an OUTER element that is sized, positioned, carries the ref, the page number and the paper
 * look (shadow, ring), with no containment; and an INNER absolute child that carries `content-visibility` and holds
 * the <img> and the boxes. Containment on the outer element would clip the label and the shadow (paint containment
 * clips overflow), which is what the first version of this component did.
 */
export function PageStack({ images, boxes, activeIndex, jumpSignal, zoom, onPageInView }: {
  images: string[];
  boxes: PageBox[];
  activeIndex: number;
  jumpSignal: number;
  zoom: number;
  onPageInView?: (page: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef(new Map<number, HTMLDivElement>());
  const rafRef = useRef<number | null>(null);
  const lastJump = useRef(jumpSignal);
  const lastZoom = useRef(zoom);
  const [containerWidth, setContainerWidth] = useState(0);
  // Per-image state keyed by src, so switching the stack to another file (statement ↔ receipts) never reuses a
  // stale aspect or a stale failure from the previous file's page with the same number.
  const [aspects, setAspects] = useState<Record<string, number>>({});
  const [failed, setFailed] = useState<Record<string, boolean>>({});

  const active = boxes[activeIndex] ?? boxes[0] ?? null;
  const citedPage = active?.page ?? 1;
  const activeKey = active ? `${active.page}:${active.box.join(',')}` : '';
  const citedSrc = images[citedPage - 1];
  const citedLoaded = citedSrc !== undefined && aspects[citedSrc] !== undefined;
  // contentRect is the content box, so the scroller's padding is already excluded: 100 means fit.
  const pageWidth = Math.max(200, Math.round(containerWidth * (zoom / 100)));

  // The pane's width drives page width (100% = fit); measured, not assumed, so a resized pane re-fits.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const e of entries) setContainerWidth(e.contentRect.width);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Centre the primary box. Offsets are read from the page element, so they are right at every zoom. Instant on
  // mount, on a new citation and when the cited image reports its size; smooth only for Jump and zoom, because an
  // animated first scroll drags every page on the way into the lazy-load margin.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const pageEl = active ? pageRefs.current.get(active.page) : null;
    if (!scroller || !pageEl || !active) return;
    const animated = (jumpSignal !== lastJump.current || zoom !== lastZoom.current) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    lastJump.current = jumpSignal;
    lastZoom.current = zoom;
    const [x0, y0, x1, y1] = active.box;
    const top = pageEl.offsetTop + ((y0 + y1) / 2000) * pageEl.offsetHeight - scroller.clientHeight / 2;
    const left = pageEl.offsetLeft + ((x0 + x1) / 2000) * pageEl.offsetWidth - scroller.clientWidth / 2;
    scroller.scrollTo({ top: Math.max(0, top), left: Math.max(0, left), behavior: animated ? 'smooth' : 'auto' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, jumpSignal, zoom, pageWidth, citedLoaded]);

  // A frame still pending at unmount would find no scroller; cancel it anyway.
  useEffect(
    () => () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    },
    []
  );

  const trackPageInView = () => {
    if (!onPageInView || rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const scroller = scrollRef.current;
      if (!scroller) return;
      const mid = scroller.scrollTop + scroller.clientHeight / 2;
      for (const [page, el] of pageRefs.current) {
        if (el.offsetTop <= mid && mid < el.offsetTop + el.offsetHeight) {
          onPageInView(page);
          return;
        }
      }
    });
  };

  return (
    <div ref={scrollRef} onScroll={trackPageInView} className="relative h-full overflow-auto bg-muted/40 p-3">
      <div className="flex w-max min-w-full flex-col items-center gap-6">
        {/* Pages render only once the pane is measured: a 200px placeholder frame would pull far more images into
            the lazy-load window than the real width ever shows, and those fetches cannot be taken back. */}
        {containerWidth > 0 &&
          images.map((src, i) => {
            const page = i + 1;
            const aspect = aspects[src] ?? DEFAULT_ASPECT;
            const isCited = page === citedPage;
            const height = Math.round(pageWidth * aspect);
            const pageBoxes = boxes.filter(b => b.page === page);
            return (
              <div
                key={page}
                data-page={page}
                ref={el => {
                  if (el) pageRefs.current.set(page, el);
                  else pageRefs.current.delete(page);
                }}
                className="relative shrink-0 rounded-sm bg-white shadow-lg ring-1 ring-black/5"
                style={{ width: pageWidth, height }}
              >
                <div className="absolute -top-4 left-0 select-none text-[10px] font-medium text-muted-foreground">{page}</div>
                <div
                  className="absolute inset-0 overflow-hidden rounded-sm"
                  // Off-screen pages skip layout and image loads; the cited one must load so the centring has a real height.
                  style={{ contentVisibility: isCited ? 'visible' : 'auto' } as CSSProperties}
                >
                  {failed[src] ? (
                    <div className="flex h-full w-full items-center justify-center bg-card text-xs text-muted-foreground">
                      Page image missing
                    </div>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={src}
                      alt={`Page ${page}`}
                      loading={isCited ? 'eager' : 'lazy'}
                      decoding="async"
                      className="block h-full w-full"
                      onLoad={e => {
                        const im = e.currentTarget;
                        if (im.naturalWidth) setAspects(a => (a[src] ? a : { ...a, [src]: im.naturalHeight / im.naturalWidth }));
                      }}
                      onError={() => setFailed(f => ({ ...f, [src]: true }))}
                    />
                  )}
                  {pageBoxes.map((b, j) => (
                    <div
                      key={j}
                      title={b.label}
                      className={cn('pointer-events-none absolute rounded-sm', b.primary ? 'bg-primary/10 ring-2 ring-primary' : 'bg-primary/5 ring-1 ring-primary/50')}
                      style={boxStyle(b.box)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}
