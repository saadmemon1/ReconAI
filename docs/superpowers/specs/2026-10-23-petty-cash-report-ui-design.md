# Petty-cash report in the app, with a DocAI-style citation pane — design

Date: 2026-10-23. Branch: `feat/petty-cash-report-ui` (worktree off `feat/abujhd-second-pass`).

## Problem

`scripts/abujhd/c_report.py` renders a self-contained `report.html` that the Report tab shows in an iframe. It is
dense: one 129-row table with three inline thumbnails per row, seven exception tables repeating the same evidence
column, a one-box overlay for citations with no zoom, page navigation or sibling sources, and a dark mode synced by
toggling a class inside the iframe. It does not look like a DocAI product.

DocAI's `pdf-citation-panel.tsx` is the reference: a pane with a file header, zoom, page numbers, the cited box
drawn on the page in 0-1000 coordinates, auto-scroll to the citation and a "jump back" control. The petty-cash data
already carries page, box and crop for every statement row, receipt group and ledger cell, so the same experience
can be built on the app's components.

## Decisions (agreed 2026-10-23)

1. The report renders in React inside the Report tab. `report.html` is retired; the pipeline emits `report.json`.
2. Analytics: the four KPI tiles stay. The three charts and the orange cross-tab go; their numbers survive as filter
   counts and the "orange" marker on rows.
3. The citation pane docks on the right and stays open while rows are clicked. Below the `lg` breakpoint it is a
   full-screen overlay.
4. `a_refine.py` and `b_match.py` do not change. Accuracy and the regression gate are untouched.
5. The pane reads page PNGs the API already serves, never DocAI file ids, so the snapshot folder keeps working.

## Data contract: `report.json`

`c_report.py` keeps its name and `--data` flag but writes `data/<client>/report.json` and nothing else. It is a
trimmed, UI-shaped copy of `matches.json` built by one pure function `build_report(matches, cfg, page_files)`.
Coordinates stay in the matcher's 0-1000 page space, `[x0, y0, x1, y1]`.

```json
{
  "meta": {
    "client": "ABUJHD",
    "month": "2026-09",
    "month_label": "September 2026",
    "built_at": "2026-10-23T22:10:00",
    "sheet": "General Ledger",
    "files": { "receipts": "receipts.pdf", "statement": "statement.pdf", "ledger": "ledger.xlsx" },
    "page_images": { "receipts": ["pages/page-01.png", "..."], "statement": ["pages/statement-200.png"] }
  },
  "kpis": {
    "card_spend": 17439.1, "purchase_count": 104, "atm_count": 19,
    "purchases_amount": 16139.1, "evidenced_amount": 12779.46,
    "rollup": 19420.8, "open_gap": 1981.7,
    "missing_count": 9, "missing_amount": 599.83
  },
  "counts": { "rows": { "MATCHED": 76, "REVIEW": 14 }, "receipts": { "LINKED": 79, "ORPHAN": 67, "REVIEW": 26 } },
  "rows": [ { "ref": "627308192032", "date": "2026-09-30", "time": "08:19:20", "amount": 290.0,
              "merchant": "GREEN STAR FUEL STATION", "kind": "purchase", "orange": true,
              "status": "MATCHED", "reason": "receipt p82-g2 p82", "receipt_ids": ["p82-g2"],
              "citations": {
                "statement": { "page": 1, "box": [0, 62, 1000, 67], "crop": "crops/stmt-627308192032.png" },
                "receipts": [ { "page": 82, "group_id": "p82-g2", "box": [727, 222, 978, 748], "crop": "crops/p82-g2.png" } ],
                "ledger": { "sheet": "General Ledger", "row": 82, "cell": "B82", "code": "MISC/2026/09/0031",
                            "date": "2026-09-30", "amount": 19420.8, "relation": "rolled-up" } } } ],
  "receipts": [ { "id": "p10-g2", "page": 10, "pages": [10], "box": [319, 171, 643, 655], "crop": "crops/p10-g2.png",
                  "status": "REVIEW", "reason": "ambiguous or weak candidates",
                  "merchant": "ASDAF ALMUHIT", "date": "2025-09-03", "total": 20.0, "amounts": [20.0, 10.0, 17.39],
                  "confidence": 0.91, "notes": "…", "refs": [], "review": [["624608459929", 6], ["624608449928", 6]],
                  "citations": [ { "page": 10, "group_id": "p10-g2", "box": [319, 171, 643, 655], "crop": "crops/p10-g2.png" } ] } ],
  "ledger": [ { "code": "MISC/2026/09/0020", "date": "2026-09-02", "text": "Bank Reconciliation - Top up …",
                "debit": 3000.0, "credit": null, "balance": 4548.67, "month": "2026-09", "row": 61, "cell": "B61",
                "status": "TIED" } ],
  "tieout": {
    "loads_vs_topups": { "statement": 17500.0, "ledger": 17500.0, "diff": 0.0 },
    "atm_vs_withdrawals": { "statement": 1300.0, "ledger": 0, "diff": 1300.0 },
    "purchases_vs_rollup": { "statement": 17439.1, "purchases_only": 16139.1, "ledger": 19420.8, "diff": -1981.7, "rollup_codes": ["MISC/2026/09/0031"] }
  }
}
```

Field rules:

- `rows` keep every field the UI shows; `balance`, `type`, `txn_code`, `load_type`, `y`, top-level `crop`/`box` are
  dropped (the statement citation carries crop and box, both `null` for a row the matcher could not position; the
  pane skips such boxes). `citations.statement` is always present; `receipts` may be empty; `ledger` may be `null`. The `file` key inside citations is dropped: `meta.files` names the sources.
- `receipts` drop `text`, `segment_ids`, `ids`, `boxes`, `broken`, `linkable`, `candidates`, `approval_code`,
  `invoice_no`, `dates`, `merchant_candidates`. `merchant`, `date`, `total` come from the healer `fields` with the
  first merchant candidate and first date as fallbacks. `amounts` is the sorted, de-duplicated list of amount values,
  total candidates first. `citations` is the group's `citations.receipt` list (one entry per page of the group).
- `ledger` lines get `status`: `"ROLLUP"` when the code is in `tieout.purchases_vs_rollup.rollup_codes`, else the
  value from `tieout.ledger_status` keyed `"<code>|<text>"` with `UNEXPLAINED` rewritten to `"NO_CARD_TXN"` (the
  matcher's word means "not in the statement" on this side), else `null`.
- `kpis.card_spend` = `tieout.purchases_vs_rollup.statement`; `purchases_amount` = `purchases_only`;
  `evidenced_amount` = sum of `amount` over purchase rows with status `MATCHED`; `rollup` = `purchases_vs_rollup.ledger`;
  `open_gap` = `rollup - card_spend`; `missing_*` over rows with status `MISSING_RECEIPT`.
- `meta.page_images.receipts` is the sorted list of `pages/page-*.png` that exist in the folder, so the pad width
  pdftoppm chose is never guessed. `meta.page_images.statement` is `["pages/statement-200.png"]`.
- `counts` is `matches.summary` verbatim.

A test `scripts/abujhd/test_report.py` builds a report from a hand-made `matches` dict with two rows, two groups
and three ledger lines and asserts the KPI arithmetic, the receipt trimming, the ledger status rule and the page
list. It runs as a plain script like `test_match.py` (`ok <name>` per test).

## API

`src/lib/petty-cash.ts` `isAllowedReportPath` allows `report.json` as the single-segment path and no longer allows
`report.html`. `pages/<name>.png` and `crops/<name>.png` stay. The route sets `Content-Type: application/json` for
`.json`; everything else stays `image/png`. Session gate and folder lookup are unchanged. `report.json` stays
`Cache-Control: no-store` (a Run rewrites it); page and crop PNGs are written only by `a_refine.py`, which the Run
button never executes, so they are served `private, max-age=3600` and the pane does not re-download 87 pages per
click. Every response carries `X-Content-Type-Options: nosniff`.
`POST /api/petty-cash/[kbId]/run` is unchanged: it still runs `b_match.py` then `c_report.py`.

## Report surface

`ReconcileRunner` probes `HEAD /api/petty-cash/<kbId>/report.json` to decide whether the "Petty-cash report" pill
and the Run button appear. When the pill is on, the pane body is `<PettyCashReport kbId version />` instead of the
iframe; `version` is the Run counter and re-fetches the JSON when it changes. The theme-sync effect and `frameRef`
go away.

Files, all new unless noted:

| File | Responsibility |
| --- | --- |
| `src/lib/petty-cash-report.ts` | Types for `report.json`; pure helpers (status vocabulary, filters and counts, sorting, KPI formatting, box geometry, pane source resolution). Fully unit-tested. |
| `src/components/petty-cash/report.tsx` | Fetches `report.json`, owns tab and selection state, renders header, KPI tiles, tab bar, the active table, and the docked pane layout. |
| `src/components/petty-cash/chips.tsx` | `StatusChip`, `CitationChip`, `FilterChip` (tiny presentational components). |
| `src/components/petty-cash/transactions-table.tsx` | Filter chips, search, sortable table of statement rows. |
| `src/components/petty-cash/receipts-table.tsx` | Filter chips and table of receipt groups. |
| `src/components/petty-cash/ledger-table.tsx` | Month filter, ledger lines, tie-out line. |
| `src/components/petty-cash/citation-pane.tsx` | Pane shell: header, source tabs, hosts `PageStack` or the ledger citation table. |
| `src/components/petty-cash/page-stack.tsx` | Image page stack with highlight boxes, zoom and scroll-to-citation. |
| `src/components/reconcile-runner.tsx` (modified) | Probe `report.json`; render `PettyCashReport`; drop iframe and theme sync. |
| `src/lib/petty-cash.ts` (modified) | Allowlist change. |
| `src/app/api/petty-cash/[kbId]/[...path]/route.ts` (modified) | JSON content type. |
| `scripts/abujhd/c_report.py` (rewritten) | `build_report` + `main` writing `report.json`. |
| `scripts/abujhd/test_report.py` | Emitter test. |

### Header and KPI tiles

Header line: `ABUJHD · September 2026` as `text-h3`, under it a muted line `Statement · receipts · ledger · built 23 Oct 2026`.
Four `Card`s in a responsive grid (`grid gap-4 sm:grid-cols-2 xl:grid-cols-4`), each: uppercase 11px muted label,
a 28px semibold tabular number, a 12px muted sub-line:

| Tile | Value | Sub-line |
| --- | --- | --- |
| Card spend | `money(card_spend)` | `SAR · {purchase_count} purchases + {atm_count} ATM withdrawals` |
| Evidenced | `pct(evidenced_amount / purchases_amount)` | `{money(evidenced_amount)} of {money(purchases_amount)} SAR has a matched receipt` |
| Open gap | `money(open_gap)` | `ledger roll-up {money(rollup)} minus card spend` |
| Receipts to find | `missing_count` | `{money(missing_amount)} SAR without a receipt` |

`money` = `n.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})`; `pct` = `Math.round(x*100) + '%'`
(0% when the denominator is 0).

### Tab bar

Three tabs, `role="tablist"` of buttons styled as pills (`rounded-full px-3 h-8 text-sm`, active =
`bg-primary text-primary-foreground`, inactive = `text-muted-foreground hover:bg-muted`): **Transactions** (row count),
**Receipts** (group count), **Ledger** (line count). Tab state lives in `report.tsx`; switching tabs keeps the pane open.

### Status vocabulary

Same words, glyphs and tones as today, so the demo vocabulary does not change. Tone maps to the existing tokens.

| Status | Word | Glyph | Tone token |
| --- | --- | --- | --- |
| MATCHED / LINKED | Matched / Linked | ✓ | `--status-ok` |
| TIED | Tied to ledger | ✓ | `--status-ok` |
| MISSING_RECEIPT | Missing receipt | ✕ | `--status-bad` |
| ORPHAN | No card row | ✕ | `--status-bad` |
| REVIEW | Needs a decision | ? | `--status-review` |
| UNEXPLAINED | Not in ledger | ! | `--status-warn` |
| AMOUNT_MISMATCH | Amounts differ | ! | `--status-warn` |
| OTHER_MONTH | Another month | ! | `--status-warn` |
| ROLLUP (ledger only) | Roll-up of card spend | · | muted |
| NO_CARD_TXN (ledger only) | No card transaction | ! | `--status-warn` |
| unknown | the raw status | · | muted |

`StatusChip`: `inline-flex h-5 items-center gap-1 rounded-md px-2 text-[11px] font-semibold` with
`style={{ color: tone, background: color-mix(in srgb, tone 12%, transparent) }}`; the glyph is a `<b>`; the word is
always rendered. Colour never carries the meaning alone.

### Transactions tab

Filter chips above the table, each `FilterChip` showing `label (count)`; counts come from `countRows(rows)` over the
unfiltered set, so they do not shrink when a filter is active:

`All · Matched · Needs a decision · Missing receipt · Amounts differ · Not in ledger · Tied to ledger`

Beside them a search `Input` (placeholder "Merchant, ref or amount"); `filterRows(rows, {status, query})` keeps a row
when the status matches (or `All`) and the lower-cased query is a substring of `merchant`, `ref`, or `amount.toFixed(2)`.
An empty result renders one muted row "No rows match".

Table (`Table` with `TABLE_HEAD_BAND` headers, `text-sm`, rows `hover:bg-muted/40 cursor-pointer`, selected row
`bg-primary/5`):

| Column | Content |
| --- | --- |
| Status | `StatusChip` |
| Date | `date` on one line, `time.slice(0,5)` muted beneath; an `orange` row adds a `size-2 rounded-full bg-amber-500` dot with `title="Highlighted on the statement"` |
| Amount | `money(amount)` right-aligned `tabular-nums` |
| Merchant | `merchant` in a `max-w-[260px] truncate` cell with the full name in `title`, `kind` muted beneath |
| Evidence | `CitationChip`s: `Stmt`, one `Receipt p{page}` per receipt citation, `Ledger {cell}` when ledger is set |
| Note | `reason`, muted |

Date and Amount headers are buttons that toggle sort (`sortRows(rows, key, dir)`; default `date` ascending, ties by
`time`); the active header shows ▲ or ▼. Clicking a row calls `onSelect({ kind: 'row', ref, source })` where
`source` is `'receipt'` when the row has a receipt citation else `'statement'`. Clicking a chip selects that source
(`stopPropagation`).

### Receipts tab

Filter chips: `All · Linked · Needs a decision · No card row · Another month`, counted by `countReceipts(groups)`.
Table columns:

| Column | Content |
| --- | --- |
| Status | `StatusChip` |
| Receipt | 40px-tall crop `<img>` (`rounded border border-border bg-white`) then `p{page} · {id}` mono |
| Receipt date | `date` or muted "no date" |
| Amount | `money(total)` when set, else the first three `amounts` joined by `, `, else muted "no amount read" |
| Merchant | `merchant` or muted "no merchant read" |
| Statement rows | Linked: one `CitationChip` per `refs` entry showing the ref's date and amount. Needs a decision: one chip per `review` candidate `[ref, score]` showing `{date} · {money(amount)} · {merchant[:24]} · score {score}`; "its candidates were taken by other receipts" muted when the list is empty. Otherwise `reason`. |

The Receipt cell (crop plus `p{page} · {id}`) is a real `<button>` so an orphan group, which has no statement chip,
can be opened from the keyboard; it and a click anywhere on the row call `onSelect({ kind: 'receipt', id, source: 'receipt' })`. Clicking a statement chip calls
`onSelect({ kind: 'row', ref, source: 'statement' })` and switches the pane to that row.

### Ledger tab

Filter chips: `This month` (default, `line.month === meta.month`) and `All months`. Table: Code (mono), Date,
Debit, Credit (right-aligned), Text, Status (`StatusChip`; `null` renders an em dash). The tie-out summary sits
above the table as three muted sentences built from `tieout`:

- `Loads vs top-ups: {money(statement)} vs {money(ledger)} (diff {money(diff)}).`
- `ATM cash: {money(statement)} on the card, {money(ledger)} withdrawn in the ledger.`
- `Card spend {money(statement)} vs roll-up {money(ledger)}: diff {money(diff)}.`

Rows are not selectable; the ledger citation is reached from the Transactions pane.

## Citation pane

### Selection and sources

`report.tsx` holds `selection: Selection | null`:

```ts
type Selection =
  | { kind: 'row'; ref: string; source: Source; index?: number }   // index: which receipt citation is primary (default 0)
  | { kind: 'receipt'; id: string; source: Source };
type Source = 'statement' | 'receipt' | 'ledger';
```

A `Receipt p{page}` chip on a row sets `index` to that citation's position so the pane opens on that page.

`paneSources(report, selection)` (pure, tested) returns

```ts
{ title: string; statement: StatementCitation[]; receipts: ReceiptCitation[]; ledger: LedgerCitation | null }
```

- For a row: `title` = `{date} · {money(amount)} · {merchant}`; `statement` = `[row.citations.statement]`;
  `receipts` = `row.citations.receipts`; `ledger` = `row.citations.ledger`.
- For a receipt group: `title` = `{merchant or id} · p{page}`; `receipts` = `group.citations`; `statement` = the
  statement citations of every row whose `ref` is in `group.refs` (linked) or in `group.review` refs (undecided);
  `ledger` = the first such row's ledger citation or `null`.

### Shell

`<aside aria-label="Evidence">` with `flex h-full flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm`.

Header (`flex items-center gap-2 border-b border-border px-3 py-2`): the `title` truncated, then a right-aligned
control group: zoom out, `{zoom}%` (tabular), zoom in, "Jump to citation" (`LocateFixed` icon, `title`), close (`X`).
Under it a second line: the source tabs `Statement · Receipt (n) · Ledger` as `role="tablist"` pills (same style as
the report tabs, `h-7 text-xs`); a tab is `disabled` with `opacity-40` when its source list is empty. The active
tab starts as `selection.source` and resets whenever the selection changes. A muted file line beside the tabs shows
`meta.files[source]` and, for page sources, `page {p} of {n}` for the page currently most in view; switching tabs
clears that page number and mounts a fresh `PageStack` for the new file (keyed by source).

Body: `flex-1 min-h-0 overflow-auto bg-muted/40 p-3`, hosting `PageStack` for `statement` and `receipt`, or the
ledger table for `ledger`.

Keyboard: `Escape` closes the pane (listener attached while open). Zoom: `−` and `+` buttons only.

### PageStack

Props:

```ts
{ images: string[];          // absolute URLs in page order
  boxes: Array<{ page: number; box: [number, number, number, number]; primary: boolean; label: string }>;
  activeIndex: number;        // which box to centre; the "jump" button re-triggers the scroll
  jumpSignal: number;         // incremented by the jump button
  zoom: number;               // 50..300, 100 = fit the pane width
  onPageInView?: (page: number) => void }
```

- Every page renders as an outer `div` with `data-page`, explicit width and height, the paper look
  (`rounded-sm bg-white shadow-lg ring-1 ring-black/5`) and a 10px muted page number above it (DocAI style), and an
  inner absolute child that carries `content-visibility: auto` (the cited page stays `visible` so its `<img>` loads
  off-screen) and holds the `<img>` `loading="lazy" decoding="async"` and the boxes. Containment sits on the inner
  element because paint containment clips overflow, which would hide the label and the shadow. Width is `zoom%` of
  the scroller's measured content width (`w-max min-w-full` column so a zoomed page scrolls both ways); pages render
  only once that width is measured. Until an image has loaded, the page reserves height from a 1 : 1.414 aspect so
  scroll offsets are right; the measured aspect replaces it on load. Per-image state (aspect, failure) is keyed by
  image URL, so switching the stack between the statement file and the receipts file never reuses stale state.
- Boxes are absolutely positioned inside the page div using `boxStyle(box)`:
  `{ left: x0/10 %, top: y0/10 %, width: (x1-x0)/10 %, height: (y1-y0)/10 % }`. The primary box is
  `ring-2 ring-primary bg-primary/10 rounded-sm`; secondary boxes are `ring-1 ring-primary/50 bg-primary/5`. Each
  carries `title={label}`. Boxes are `pointer-events-none`; the page is not interactive beyond scrolling.
- On mount, when `activeIndex` changes, and when the cited page's image loads, the stack jumps instantly
  (`behavior: 'auto'`) so the primary box centre sits at the scroller's vertical and horizontal centre; only the
  Jump button and zoom steps scroll smoothly (and never under `prefers-reduced-motion`). An animated first scroll
  from page 1 would drag every lazy page image on the way into the load margin, tens of 1.7 MB fetches per click.
  Offsets come from the page div's `offsetTop`/`offsetHeight` so they are correct at every zoom.
- `onPageInView` reports the page whose div crosses the scroller's vertical midpoint, computed in a passive
  `scroll` handler throttled by `requestAnimationFrame`.
- A failed image shows a muted placeholder "Page image missing" in the reserved box.

Statement source: `images = meta.page_images.statement`, boxes = one primary box per statement citation (a row
citation is one strip; a receipt-group selection may have several, the first primary). Receipt source: `images =
meta.page_images.receipts`, boxes = the receipt citations with the active one primary and the rest secondary. Image
URLs come from `imageUrl(kbId, path)` = `/api/petty-cash/${kbId}/${path}`.

### Ledger source

The same `LedgerLines` table the Ledger tab uses (Code, Date, Debit, Credit, Text, Status) over `report.ledger`
filtered to `line.month === meta.month`. Every line whose `code === ledger.code` gets `bg-primary/10` and
`aria-current`; when the tab opens the first is scrolled to the centre of the pane body only (the nearest
`data-scroll-container`), never the page, because `scrollIntoView` would move the document and push the KPI tiles out
of view. Above it one line: `{cell} · {code} · {money(amount)} · {relation}` ("rolled-up" renders as
"this row is rolled up into the line below", "tied" as "this row is tied to the line below").

### Layout

In `report.tsx`, when `selection` is set:

- `lg` and up: the header, tiles and tab pills span the full width; the two-column
  `grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,45%)]` starts at the table block, so the pane's top lines up
  with the table. The pane column is `lg:sticky lg:top-4 lg:h-[calc(100vh-2rem)]`: once the page has scrolled it
  fills the viewport with a 1rem margin top and bottom.
- below `lg`: the pane renders `fixed inset-0 z-50 p-3 bg-background/95` with the same shell inside, through a
  portal on `document.body`. The sidebar rail is a `z-30` sticky element in the root stacking context, which the
  report's own stacking context cannot climb above; a `matchMedia('(min-width: 1024px)')` hook picks docked or
  overlay. The overlay is a dialog: `role="dialog" aria-modal="true" aria-label="Evidence"`, focus moves to the
  pane's close button when it opens, and the document's scroll is locked (`body overflow: hidden`) while it is up.

When `selection` is `null` the report is single-column. Opening the pane does not change the table's scroll
position. While the pane is open the Transactions table runs in `compact` mode and hides its Note column, so
Status, Date, Amount, Merchant and Evidence fit beside the pane at 1440px.

## Theming and visual rules

Only app tokens (`bg-card`, `border-border`, `text-muted-foreground`, `bg-primary`, `--status-*`). Page images sit
on `bg-muted/40` and keep their white paper and ring in dark mode, as DocAI does. No hard-coded hex outside the
status tones already in `globals.css`. Numbers are `tabular-nums`. Radius follows `--radius`.

## Errors and empty states

- `report.json` 404 → the pill never appears (existing probe behaviour).
- Fetch or parse failure → a `Card` with "Couldn't load the petty-cash report" and a "Retry" `Button` that
  re-fetches.
- Loading → a centred spinner (`Loader2` animate-spin) in place of the tiles and table.
- A row with no receipt citation opens on Statement; a group with no linked rows disables the Statement and
  Ledger tabs.
- A missing page image shows the placeholder, never a broken-image icon.

## Testing

- `src/lib/__tests__/petty-cash-report.test.ts` (bun): status vocabulary (every matcher status maps to a word and
  a tone; unknown falls back), `countRows`/`countReceipts`, `filterRows` (status, query over merchant/ref/amount,
  `All`), `sortRows` (date with time tiebreak, amount, both directions), `boxStyle`, `money`/`pct` (0 denominator),
  `paneSources` for a row with and without receipts and for a linked and an undecided group, `imageUrl`.
- `src/lib/__tests__/petty-cash.test.ts` (modified): `report.json` allowed, `report.html` no longer allowed.
- `scripts/abujhd/test_report.py`: see the data contract.
- Rendering is verified in the built-in browser on port 3002 against the snapshot: KPI numbers equal the old
  report's, a Matched row opens the receipt page with the box centred, the Statement tab shows the strip, the
  Ledger tab highlights the roll-up line, a REVIEW group's candidate chip jumps to the statement row, dark mode,
  and the Run button still rebuilds and refreshes.

## Out of scope

Recording decisions from the UI (`overrides.json`), PDF or HTML export, a sortable merchant column, keyboard
row-to-row navigation, rendering the real PDFs through pdf.js, and any change to the matcher or healer.
