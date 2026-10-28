'use client';
import { createContext, useContext } from 'react';
import { TABLE_HEAD_BAND } from '@/components/ui/table';
import { fmtDate } from '@/lib/petty-cash-report';

/** How a workspace's report is presented, from its config.json display section. Off, every helper returns what the report
 *  showed before the polished layout existed, so workspaces without the setting are unchanged. */
export interface Display {
  polished: boolean;
  /** Class for table header cells. */
  headBand: string;
  /** An ISO date as the page shows it. */
  date: (iso: string) => string;
}

const LIGHT_HEAD_BAND = 'h-11 bg-muted/70 px-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/70';

export function displayFor(polished: boolean): Display {
  return polished
    ? { polished, headBand: LIGHT_HEAD_BAND, date: fmtDate }
    : { polished, headBand: TABLE_HEAD_BAND, date: iso => iso };
}

export const DisplayContext = createContext<Display>(displayFor(false));
export const useDisplay = () => useContext(DisplayContext);
