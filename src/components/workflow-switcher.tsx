'use client';
import { Check, ChevronsUpDown, CreditCard, FileCheck2, FileStack, Landmark, Receipt, Truck, Users, Wallet, Workflow, type LucideIcon } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu';
import { cn } from '@/lib/utils';
import type { WorkflowKey } from '@/lib/report-nav';

const AVAILABLE: Array<{ key: WorkflowKey; label: string; short: string; hint: string; icon: LucideIcon }> = [
  { key: 'petty_cash', label: 'Petty-cash reconciliation', short: 'Petty cash', hint: 'Card statement, receipts and ledger', icon: Wallet },
  { key: 'documents', label: 'Document reconciliation', short: 'Documents', hint: 'Purchase orders, invoices and receipts', icon: FileStack },
];

/** Workflows the platform can be set up for but this workspace does not have yet. Shown so a reader sees what else can be
 *  reconciled; they are information, not menu items, because nothing behind them runs here. */
const ON_REQUEST: Array<{ label: string; hint: string; icon: LucideIcon }> = [
  { label: 'Bank reconciliation', hint: 'Bank statement against the cash book', icon: Landmark },
  { label: 'Vendor statement reconciliation', hint: "Supplier's statement against payables", icon: Truck },
  { label: 'Invoice, PO and goods receipt matching', hint: 'Three-way match before payment', icon: FileCheck2 },
  { label: 'Employee expense claims', hint: 'Claims against receipts and policy', icon: Receipt },
  { label: 'Corporate card statements', hint: 'Every company card, every month', icon: CreditCard },
  { label: 'Payroll to bank', hint: 'Payroll register against bank transfers', icon: Users },
];

/** The sidebar's report entry, named after the workflow it shows ("Petty cash"). The name opens the report; the ⇅ beside it
 *  lists the workflows this workspace has, then the ones available on request. */
export function WorkflowSwitcher({ value, onChange, pettyCash, active, onOpen }: {
  value: WorkflowKey; onChange: (w: WorkflowKey) => void; pettyCash: boolean;
  /** The report is the page on show. */
  active: boolean;
  onOpen: () => void;
}) {
  const available = AVAILABLE.filter(w => w.key !== 'petty_cash' || pettyCash);
  const current = AVAILABLE.find(w => w.key === value) ?? AVAILABLE[1];
  const Icon = current.icon;
  return (
    <div
      className={cn(
        'flex h-9 w-full items-center rounded-md text-sm font-medium transition-colors',
        active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-foreground'
      )}
    >
      <button type="button" onClick={onOpen} title={current.label} aria-current={active ? 'page' : undefined} className="flex h-full min-w-0 flex-1 items-center gap-2 px-2 text-left">
        <Icon className={cn('size-4 shrink-0', active && 'text-primary')} />
        <span className="hidden truncate md:inline">{current.short}</span>
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label="Switch workflow"
          title="Switch workflow"
          className="mr-1 hidden size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 md:flex"
        >
          <ChevronsUpDown className="size-4" />
        </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="right" sideOffset={8} className="max-h-[80vh] w-[28rem] max-w-[calc(100vw-2rem)] overflow-y-auto p-1.5">
        <div className="px-2 pb-1 pt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">In this workspace</div>
        {available.map(w => (
          <DropdownMenuItem key={w.key} onClick={() => onChange(w.key)} className="items-start gap-3 py-2">
            <w.icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{w.label}</span>
              <span className="text-xs text-muted-foreground">{w.hint}</span>
            </span>
            <Check className={cn('mt-0.5 size-4 shrink-0 text-primary', w.key !== value && 'invisible')} />
          </DropdownMenuItem>
        ))}
        <div className="my-1.5 border-t border-border" />
        <div className="flex items-center gap-1.5 px-2 pb-1 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          <Workflow className="size-3.5" /> More workflows
        </div>
        {ON_REQUEST.map(w => (
          <div key={w.label} className="flex items-start gap-3 rounded-md px-2 py-1.5 text-sm">
            <w.icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="flex flex-1 flex-col">
              <span className="font-medium">{w.label}</span>
              <span className="text-xs text-muted-foreground">{w.hint}</span>
            </span>
            <span className="mt-0.5 shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">On request</span>
          </div>
        ))}
        <p className="px-2 pb-1 pt-2 text-xs text-muted-foreground">Need one of these? Ask your ReconAI contact to set it up for this workspace.</p>
      </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
