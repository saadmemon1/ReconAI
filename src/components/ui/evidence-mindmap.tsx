'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  FileText,
  Info,
  Link,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Finding } from '@/engine/reconcile';
import type { MindmapFileNode } from '@/lib/evidence-utils';
import { cn } from '@/lib/utils';

/**
 * Evidence mindmap for a finding: the finding sits at the center, the files
 * it touches orbit around it. Click a file to expand its card (role badge,
 * that file's source citations, an "Open file" deep-link, and jumps to the
 * other files). Light-theme adaptation of the radial-orbital-timeline
 * showcase — no timeline semantics (status/date/energy), reduced-motion aware.
 */

const SEVERITY_ICONS: Record<string, LucideIcon> = {
  critical: AlertTriangle,
  high: AlertTriangle,
  medium: AlertCircle,
  low: Info,
};

const ORBIT_RADIUS = 200;
// Rotation speed: 6°/s (same as the showcase's 0.3° per 50ms tick).
const ROTATE_DEG_PER_MS = 6 / 1000;

// Severity-colored center (same palette as the findings-table severity pills).
// Full static class strings — Tailwind needs literal class names.
const SEVERITY_CENTER: Record<string, { circle: string; ring1: string; ring2: string }> = {
  critical: {
    circle: 'bg-destructive shadow-destructive/20',
    ring1: 'border-destructive/25',
    ring2: 'border-destructive/10',
  },
  high: {
    circle: 'bg-warning shadow-warning/20',
    ring1: 'border-warning/25',
    ring2: 'border-warning/10',
  },
  medium: {
    circle: 'bg-blue-500 shadow-blue-500/20',
    ring1: 'border-blue-500/25',
    ring2: 'border-blue-500/10',
  },
  low: {
    circle: 'bg-secondary shadow-secondary/20',
    ring1: 'border-secondary/25',
    ring2: 'border-secondary/10',
  },
};

export function EvidenceMindmap({
  finding,
  files,
  unassignedCount = 0,
}: {
  finding: Finding;
  files: MindmapFileNode[];
  unassignedCount?: number;
}) {
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [rotation, setRotation] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [centerInfoOpen, setCenterInfoOpen] = useState(false);
  // Reduced-motion: no auto-rotation, no ping/pulse (motion-reduce classes cover the latter).
  const [reducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const orbitRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);

  const SeverityIcon = SEVERITY_ICONS[finding.severity] || Info;
  const centerColors = SEVERITY_CENTER[finding.severity] || SEVERITY_CENTER.low;

  // Smooth rotation via requestAnimationFrame + delta time (the showcase's
  // fixed 50ms setInterval renders at 20fps and feels jittery).
  useEffect(() => {
    if (!autoRotate || reducedMotion) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      setRotation(prev => (prev + ROTATE_DEG_PER_MS * dt) % 360);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [autoRotate, reducedMotion]);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target === orbitRef.current || target === ringRef.current) {
      setExpanded({});
      setActiveId(null);
      setAutoRotate(true);
    }
  };

  const centerViewOnNode = (nodeId: number) => {
    const idx = files.findIndex(f => f.id === nodeId);
    if (idx === -1 || files.length === 0) return;
    setRotation(270 - (idx / files.length) * 360);
  };

  const toggleNode = (id: number) => {
    const wasExpanded = !!expanded[id];
    const next: Record<number, boolean> = {};
    for (const k of Object.keys(expanded)) next[Number(k)] = false;
    next[id] = !wasExpanded;
    setExpanded(next);
    if (wasExpanded) {
      setActiveId(null);
      setAutoRotate(true);
    } else {
      setActiveId(id);
      setAutoRotate(false);
      // Rotate the node to the top, then the card opens DOWNWARD over the
      // center pulse — the showcase behavior.
      centerViewOnNode(id);
    }
  };

  const position = (index: number, total: number) => {
    const angle = ((index / total) * 360 + rotation) % 360;
    const radian = (angle * Math.PI) / 180;
    const x = ORBIT_RADIUS * Math.cos(radian);
    const y = ORBIT_RADIUS * Math.sin(radian);
    const zIndex = Math.round(100 + 50 * Math.cos(radian));
    const opacity = Math.max(0.35, Math.min(1, 0.4 + 0.6 * ((1 + Math.sin(radian)) / 2)));
    return { x, y, radian, zIndex, opacity };
  };

  return (
    <div
      ref={containerRef}
      onClick={handleContainerClick}
      className="relative h-[520px] w-full overflow-hidden rounded-xl border border-border bg-muted/30"
    >
      <div ref={orbitRef} className="absolute inset-0 flex items-center justify-center">
        {/* Orbit ring */}
        <div
          ref={ringRef}
          className="absolute h-[360px] w-[360px] rounded-full border border-border"
        />

        {/* Center: the finding itself — severity-colored circle, caption below,
            hover card with description + expected → actual (self-managed:
            Base UI tooltips were unreliable inside the dialog) */}
        <div
          className="absolute left-1/2 top-1/2 z-10 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center"
          onMouseEnter={() => setCenterInfoOpen(true)}
          onMouseLeave={() => setCenterInfoOpen(false)}
        >
          <div
            className={cn(
              'relative flex size-16 animate-pulse items-center justify-center rounded-full shadow-lg motion-reduce:animate-none',
              centerColors.circle
            )}
          >
            <div
              className={cn(
                'absolute size-20 animate-ping rounded-full border opacity-70 motion-reduce:animate-none',
                centerColors.ring1
              )}
            />
            <div
              className={cn(
                'absolute size-24 animate-ping rounded-full border opacity-50 motion-reduce:animate-none',
                centerColors.ring2
              )}
              style={{ animationDelay: '0.5s' }}
            />
            <SeverityIcon className="size-6 text-primary-foreground" />
          </div>

          {/* Brief finding caption under the center */}
          <p className="mt-2 whitespace-nowrap rounded bg-muted/60 px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wider text-foreground">
            {finding.severity} · {finding.category.replace(/_/g, ' ')}
          </p>

          {centerInfoOpen && (
            <div className="mt-2 w-72 rounded-lg border border-border bg-card p-3 text-left shadow-xl">
              <p className="text-xs font-semibold uppercase tracking-wider">
                {finding.severity} · {finding.category.replace(/_/g, ' ')}
              </p>
              <p className="mt-1 text-sm leading-relaxed">{finding.description}</p>
              {finding.expected && finding.actual && (
                <p className="mt-1.5 font-mono text-xs text-secondary">
                  {finding.expected} → {finding.actual}
                </p>
              )}
            </div>
          )}
        </div>

        {/* File nodes */}
        {files.length > 0 &&
          files.map((file, index) => {
            const p = position(index, files.length);
            const isExpanded = !!expanded[file.id];
            const isDimmed = activeId !== null && activeId !== file.id;

            return (
              <div
                key={file.id}
                // Transition only while rotation is frozen (the click-to-center
                // sweep); during auto-rotation updates are per-frame and a
                // 700ms transition would lag behind the moving target.
                className={cn('absolute cursor-pointer', !autoRotate && 'transition-all duration-700')}
                style={{
                  transform: `translate(${p.x}px, ${p.y}px)`,
                  zIndex: isExpanded ? 200 : p.zIndex,
                  opacity: isExpanded ? 1 : isDimmed ? 0.3 : p.opacity,
                }}
                onClick={e => {
                  e.stopPropagation();
                  toggleNode(file.id);
                }}
              >
                <div
                  className={cn(
                    'flex size-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                    isExpanded
                      ? 'scale-150 border-primary bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                      : 'border-border bg-background text-secondary hover:border-primary hover:text-foreground'
                  )}
                >
                  <FileText size={16} />
                </div>
                <div
                  className={cn(
                    'absolute left-1/2 top-12 max-w-[160px] -translate-x-1/2 truncate text-center text-xs font-semibold tracking-wider transition-all duration-300',
                    isExpanded ? 'scale-125 text-foreground' : 'text-secondary'
                  )}
                >
                  {file.title}
                </div>

                {isExpanded && (
                  <div className="absolute left-1/2 top-20 w-72 -translate-x-1/2">
                    {/* Connector line between node and card */}
                    <div className="absolute -top-3 left-1/2 h-3 w-px -translate-x-1/2 bg-border" />
                    <div className="max-h-[200px] overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                      <div className="px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                            {file.role}
                          </span>
                          <span className="truncate font-mono text-xs text-secondary">{file.title}</span>
                        </div>

                        <div className="mt-2">
                          {file.citations.length > 0 ? (
                            <ul className="space-y-1.5">
                              {file.citations.map((cite, i) => (
                                <li
                                  key={i}
                                  className="border-l-2 border-border pl-2 text-xs italic leading-relaxed text-secondary"
                                >
                                  {cite}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="text-xs text-secondary/70">No direct citations for this file.</p>
                          )}
                        </div>

                        {file.fileId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-3 w-full"
                            onClick={e => {
                              e.stopPropagation();
                              window.open(`/api/docai/files/${file.fileId}/content`, '_blank');
                            }}
                          >
                            <ExternalLink className="mr-1 size-3.5" />
                            Open file
                          </Button>
                        )}

                        {files.length > 1 && (
                          <div className="mt-3 border-t border-border pt-2">
                            <p className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-secondary">
                              <Link className="size-2.5 text-secondary" />
                              Other files in finding
                            </p>
                            <div className="mt-1.5 flex flex-wrap gap-1">
                              {files
                                .filter(o => o.id !== file.id)
                                .map(o => (
                                  <Button
                                    key={o.id}
                                    variant="outline"
                                    size="sm"
                                    className="h-6 px-2 py-0 text-xs text-secondary hover:bg-muted hover:text-foreground"
                                    onClick={e => {
                                      e.stopPropagation();
                                      toggleNode(o.id);
                                    }}
                                  >
                                    {o.title}
                                    <ArrowRight className="ml-1 size-2 text-secondary" />
                                  </Button>
                                ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
      </div>

      <p className="pointer-events-none absolute bottom-2 left-3 text-xs text-secondary/70">
        Click a file to see its citations · click empty space to reset
      </p>
      {unassignedCount > 0 && (
        <p className="pointer-events-none absolute bottom-2 right-3 text-xs text-secondary/70">
          {unassignedCount} reference{unassignedCount === 1 ? '' : 's'} not matched to a file
        </p>
      )}
    </div>
  );
}
