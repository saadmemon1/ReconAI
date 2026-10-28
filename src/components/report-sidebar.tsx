'use client';
import { BadgePercent, Inbox, LayoutDashboard, PenLine, Rows3, Scale, TriangleAlert, Wallet, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setReportNav, useReportNav, type ReportSection } from '@/lib/report-nav';

const SECTIONS: Array<{ key: ReportSection; label: string; Icon: LucideIcon }> = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard },
  { key: 'review', label: 'Review queue', Icon: Inbox },
  { key: 'findings', label: 'Findings', Icon: TriangleAlert },
  { key: 'payments', label: 'Payments', Icon: Wallet },
  { key: 'reconciliation', label: 'Reconciliation', Icon: Scale },
  { key: 'vat', label: 'VAT register', Icon: BadgePercent },
  { key: 'transactions', label: 'Transactions', Icon: Rows3 },
  { key: 'signoff', label: 'Sign-off', Icon: PenLine },
];

/** The open report's sections, nested under the workflow entry in the sidebar. */
export function ReportSidebar() {
  const nav = useReportNav();
  const sections = SECTIONS.filter(s => nav.sections.includes(s.key));
  if (!(nav.workflow === 'petty_cash' && nav.sectioned && sections.length > 0)) return null;
  return (
    <div className="hidden md:block">
      <nav aria-label="Report sections" className="ml-4 flex flex-col gap-0.5 border-l border-sidebar-border pl-2 pt-0.5">
        {sections.map(({ key, label, Icon }) => {
          const active = nav.section === key;
          const count = nav.counts[key];
          return (
            <button
              key={key}
              type="button"
              aria-current={active ? 'page' : undefined}
              onClick={() => setReportNav({ section: key })}
              className={cn(
                'flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-sm transition-colors',
                active ? 'bg-sidebar-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
              )}
            >
              <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
              <span className="flex-1 truncate">{label}</span>
              {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
