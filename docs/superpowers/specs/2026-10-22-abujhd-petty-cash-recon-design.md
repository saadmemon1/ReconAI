# ABUJHD petty-cash reconciliation — design

Date: 2026-10-22. Branch: `feat/abujhd-petty-cash`. Scripts only; no ReconAI app changes.

## Problem

Client ABUJHD runs petty cash through a prepaid card at the bank, held by the cardholder.
For September 2026 we have three sources in DocAI workspace `ABUJHD`
(DocAI at `DOCAI_BASE_URL` from `.env.local`, default the hosted instance; file ids live in the git-ignored `data/<client>/config.json`):

| Source | File | What it really is | Parse quality |
|---|---|---|---|
| Statement | the statement PDF (1 page) | Bank-card transaction grid "AccItems Inquiry Grid", 129 rows, 2026-09-01…09-30. Has a real PDF text layer. 79 rows are highlighted orange by the client; meaning unknown. | DocAI table parse is wrong (`grid-estimate`, `partial`). `pdftotext -layout` is exact. |
| Receipts | the receipts PDF (87 pages, A4 scans at 150 ppi) | The merchant receipts / invoices / card slips for the card purchases. A page can hold several receipts (page 1 holds three); some invoices span pages; some crops are rotated. Scanner added an OCR text layer. | DocAI segments (1,937) are usable as hints only. |
| Ledger | the ledger xlsx | The petty-cash account, Apr–Sep 2026, 77 `MISC` rows. September: six top-ups (debits, 17,500, all tie to the card loads), two small credits (54.37, 90.48) and one roll-up credit `MISC/2026/09/0031` "Petty Cash for SEP" = 19,420.80. | Good (pipe tables per sheet range). |

Statement composition (from the text layer): 104 merchant purchases (txn code 0) = 16,139.10;
19 ATM/bank rows (codes 1, 30, 35) = 1,300.00; 6 loads (code 201) = 17,500.00.
Purchases + ATM = 17,439.10 vs ledger roll-up 19,420.80: a 1,981.70 difference to explain.
Loads 17,500 = ledger top-ups 17,500: all six tie.

Goal: for every petty-cash entry, find its proof in the raw files (A), match case by case and
find gaps (B), and produce a whiteboard-style report a human can verify and fix from (C).

## Layout

```
scripts/abujhd/
  common.py       paths, config, JSON io, amount/date normalisers (tiny)
  a_refine.py     EDA + clean + group + heal → segments.refined.json, groups.json,
                  statement.json, ledger.json, eda.md
  b_match.py      key relation + gap analysis → matches.json
  c_report.py     report.json for the app's Report tab (2026-10-23-petty-cash-report-ui-design.md)
  test_match.py   assert-based check, run with plain `python3 scripts/abujhd/test_match.py`
data/abujhd/      git-ignored
  config.json     file ids + names, month, ledger sheet (template: scripts/abujhd/config.example.json)
  raw/            the 3 source files + their DocAI segments JSON
  pages/          page-NN.png (150 ppi, pdftoppm) — for healer crops and the report only
  crops/          <group-id>.png, the union box of a group, cut from its page render
  cache/          healer responses keyed by sha256(crop + segments)
  overrides.json  human corrections (groups) and link overrides, honoured by A and B
  segments.refined.json groups.json statement.json ledger.json matches.json eda.md report.json
```

Every script takes `--data data/abujhd` (default), is idempotent and re-runnable, and
prints a short summary. Python 3 with PIL + numpy; `pdftoppm`/`pdftotext` from poppler.
`OPENAI_API_KEY` / `ANTHROPIC_API_KEY` are read from `.env.local` by the healer.

## Step A — `a_refine.py` (clean → group → link → heal)

Input is what DocAI already produced: the segments JSON of the three files (each segment has
`id, type, markdown, coordinates{pageNumber, xmin, ymin, xmax, ymax}` in 1000×1000 page space,
plus `cells` for tables). Step A does not re-extract; it refines. Page renders
(`pdftoppm -r 150`) are made only so a healer can be shown the crop a group came from.

1. **EDA first (`eda.md`).** Per file: segment counts by type and page, empty/garbage text
   rate (share of segments with no letter or digit, or with > 30% replacement/odd characters),
   amounts and dates found per page, pages with no amount, tables with `contentStatus != ok`
   or `cellsSource == grid-estimate`. This is the evidence for which rules below fire.

2. **Clean.** Normalise every segment in place, keeping the original under `raw`:
   Arabic-Indic digits → ASCII; Unicode NFKC; strip markdown heading marks; collapse
   whitespace; decode HTML tables to rows (`table-text.ts` rules); drop nothing — noise types
   (`footer`, `page_number`, `logo`) are kept but flagged `noise: true` so grouping ignores them.

3. **Group (segmentation).** Receipts: cluster the non-noise segments of each page by geometry
   into receipt-level groups. Rule: two segments belong together when their boxes overlap
   horizontally (shared x-span ≥ 40% of the narrower box) and the vertical gap between them is
   < 4% of page height; connected components of that relation are the groups. A component
   narrower than 15% of the page width or holding < 2 segments is merged into its nearest
   neighbour. Each group gets `id, page, box (union), segment_ids, text` and the derived
   fields the matcher needs: `amounts` (every x.xx in the text, with the one next to
   total/الإجمالي/الصافي/net/purchase amount marked `total_candidate`), `dates`,
   `merchant_candidates` (title/header segments, first text line), `approval_code`,
   `invoice_no`. Cross-page: a group whose text contains "page N of M" / "continued", or whose
   `invoice_no` equals one on the previous page, is merged with it.
   Statement: one group per transaction row (see 5). Ledger: one group per `MISC/…` row.

4. **Link.** Statement rows are the entries (the ledger's `0031` roll-up is one line for the
   whole month, so the fine-grained entry is the card transaction). Each receipt group is
   tentatively linked to the statement rows whose `amount` equals any of its `amounts` and whose
   date is within ±1 day of any of its `dates`. A group with ≥ 1 candidate is `linkable`; with
   0 candidates it is `unlinked`. This is only a readiness signal for healing; the matching
   decision is Step B's.

5. **Heal (model in the loop, only where clearly broken).** Broken means any of:
   `unlinked` and the group has no parseable total; no date at all; conflicting totals (two
   `total_candidate`s that differ); garbage rate > 30%; a table segment with
   `cellsSource == grid-estimate` or `contentStatus != ok`.
   The healer receives one group at a time: the crop image of the group's union box (from the
   page render, padded 3%), the page number, and the group's segments as
   `[{id, type, bbox, text}]`, and must return `{segments: [{id, text}], fields: {merchant,
   date, time, total, vat, card_slip_amount, approval_code, invoice_no, currency,
   kind: receipt|invoice|card_slip|other}, confidence 0–1, notes}` — corrected text per
   segment id (same ids, no new ids) plus the structured fields. The healer is pluggable:
   `--healer openai` (`gpt-5.6-luna`, JSON schema response) or `--healer claude`
   (`claude-sonnet-5-5`, tool-use schema); both read their key from `.env.local`. Responses
   are cached by sha256(crop + segments) under `cache/`, so reruns are free and the healed
   result is reproducible. Healed segments carry `healed: true` and `healer`; untouched
   groups carry `healed: false`. A group that is not broken is never sent.
   The statement is the one exception to "no re-extraction": its DocAI table is unusable
   (`grid-estimate`, `partial`), and the PDF carries its own exact text layer, so the table
   segment is healed from `pdftotext -layout` (129 rows, regex per line, no model) and
   marked `healed: true, healer: "pdf-text-layer"`. Orange highlight: detect orange bands on
   the 200 ppi render, map rows by y from `pdftotext -bbox-layout`, store `orange: bool`,
   never interpret it.

6. **Outputs.** `segments.refined.json` (all three files, same shape as DocAI's plus `raw`,
   `noise`, `healed`, `healer`), `groups.json` (receipt groups with fields and `linkable`),
   `statement.json` (rows `{ref, amount, datetime, balance, type, merchant, txn_code, kind:
   purchase|atm|load, orange}`), `ledger.json` (`{code, date, text, debit, credit, balance,
   month}`), `eda.md` (section 1 plus: groups per page histogram, pages with 0 groups,
   broken-rule counts, healed count, healer confidence histogram).

**Checkpoint A.** Show `eda.md`, the list of healed groups with before/after text, and the
10 lowest-confidence heals with their crops. The user OKs or corrects (corrections go to
`overrides.json` as `{"groups": {id: {fields...}}}`) before B runs.

## Step B — `b_match.py`

Pure functions over the JSON from A. No network. Key = statement `ref`.

1. **Collapse card slips into their invoice.** A group of kind `card_slip` on the same page
   as, or the page after, an invoice/receipt group with the same amount and merchant becomes
   part of that receipt (one receipt, several boxes). Cross-page invoice continuation was
   already merged in A.
2. **Receipt → purchase row.** Candidate rows = purchases with `amount` equal to the receipt's
   `card_slip_amount`, `total` (healed fields when present, else the `total_candidate`
   amounts from A) — 2-dp exact. Score: amount exact 3; date same day 2 /
   ±1 day 1 / else 0; merchant token overlap (Arabic and English normalised, e.g. AJMY↔Ajmi,
   ASDAF↔أسواق) 0–2. Greedy 1:1 from the highest score; score < 4 or a tie → `REVIEW`.
   `overrides.json` `{"links": {receipt_id: ref | null}}` wins over scoring.
3. **Statement → ledger.** Loads ↔ ledger debits by amount and date ±2 days; ATM rows ↔ any
   ledger "Cash Withdrawal" lines; the two small September credits ↔ purchase rows by amount;
   roll-up `0031` ↔ purchases + ATM sum, difference reported as a finding.
4. **Statuses.** Statement row: `MATCHED | MISSING_RECEIPT | AMOUNT_MISMATCH | REVIEW`
   (`atm`/`load` rows get `TIED | UNEXPLAINED` against the ledger). Receipt: `LINKED | ORPHAN`.
   Ledger line: `TIED | UNEXPLAINED`. Orange flag is cross-tabulated against status in the
   summary so its meaning can be inferred, never assumed.
5. Output `matches.json`: `{rows: [...statement rows + status + receipt ids + reason],
   receipts: [...+ status + ref], ledger: [...+ status + refs], tieout: {...sums and gaps},
   orange_vs_status: {...}}`.

`test_match.py`: a 6-row hand-made fixture (exact match, ±1 day, tie → REVIEW, orphan,
missing, override) that fails if scoring or the greedy pass breaks.

**Checkpoint B.** Print the summary table and the `REVIEW` list with both candidates' evidence.
User confirms or writes overrides; rerun B.

## Step B2 — second pass

`second_pass()` runs after pass 1 and touches leftovers only: purchase rows nobody linked and nobody listed for review,
and receipts with no link and no review entry. Pass 1 results are never changed. Three rules, in order:

1. **Split payment.** Two same-day rows with the identical statement merchant string whose amounts sum to the
   receipt total within 0.05 (one such pair, unambiguous) are both linked to the receipt.
2. **Near amount.** A leftover receipt may link to a leftover row only when all hold: same day; the amount differs by at
   most `min(3.00, 10% of the row amount)`; the merchant overlaps the row's (generic tokens and the "markets"
   alias removed; 5-char prefixes count) or the healer's `confidence` is at least 0.7; and the pairing is unique both
   ways against every same-day row and receipt, taken or not. The row shows `AMOUNT_MISMATCH` with
   `(total differs by X.XX)`, so it is flagged, not promoted to `MATCHED`.
3. **No total.** A healed receipt with merchant and date but no amount, and exactly one same-day row whose merchant
   overlaps, becomes a `REVIEW` suggestion for that row. It is never a match.

A `links` value in `matches.json` may therefore be a list of refs (split), and `matches.json` receipts carry `refs`
alongside `ref`. `overrides.json` `links` cannot express a split: it takes one ref or null per receipt.

Pass-1 amount candidates for unmerged, unhealed groups now come from `common.total_flags` (the ranker that prefers
total-family keywords), so pass 1 is affected by the ranker too; the September gate showed no change.

## Step C — `c_report.py`

> Superseded 2026-10-23: Step C now writes `report.json`, rendered by the app (see
> `2026-10-23-petty-cash-report-ui-design.md`). The description below is the original static-HTML design.

`report.html`, single self-contained file (CSS inline, images referenced relatively from
`data/abujhd/`), no framework, light and dark via `prefers-color-scheme`.

- **Tie-out block** at the top: loads vs top-ups, purchases + ATM vs roll-up, the differences,
  counts per status.
- **Statement table**: one row per statement entry in date order: status chip, date, amount,
  merchant, receipt thumbnail(s) inline, reason. Click a thumbnail → an in-page overlay shows the
  full page PNG with the crop box drawn (a few lines of inline JS; the box coordinates are
  data attributes on the thumbnail).
- **Sections** for `MISSING_RECEIPT`, `ORPHAN`, `AMOUNT_MISMATCH`, `REVIEW`, `UNEXPLAINED`:
  each item carries the exact evidence a human needs to fix it (statement line, ledger line,
  crop, page) and a free-text "what to check" line generated from the reason.
- Everything cites: statement ref, page number, crop id, ledger code.

**Checkpoint C.** User opens `report.html`; one iteration on clarity.

## Regression gate

```
python scripts/abujhd/check_vs_workbook.py --data data/abujhd --workbook <xlsx> --min-agree 85 --max-wrong 5
```

Compares `matches.json` with the human reconciliation workbook (sheet "Card statement Sep"), purchase rows only.
**agree**: our status matches the workbook (Matched "Yes" and we say `MATCHED`/`AMOUNT_MISMATCH`, or blank and we say
`MISSING_RECEIPT`). **wrong**: we say missing where the workbook found a receipt, or matched where it found none.
**review**: rows we left to a human; neither agree nor wrong. Exit 1 when agree is below `--min-agree` or wrong is
above `--max-wrong`. Current September baseline: agree 82, wrong 5, review 17.

## Out of scope

Months other than September; the monthly per-period xlsx files; writing results
back into ReconAI's Report tab (a later integration); OCR of the statement (text layer exists).

## Risks

- The healer misreads Arabic totals: mitigated by card-slip amounts (Latin digits), by only
  healing broken groups (good DocAI text is kept as is), by caching, and by the Checkpoint A
  review of low-confidence heals.
- Geometric grouping merges two receipts taped edge to edge, or splits one receipt with a
  wide white band: the EDA's groups-per-page histogram and the `conflicting totals` rule
  surface both; the healer is told it may be looking at more than one document and says so
  in `notes`, which sends the group to `REVIEW` in B.
- Duplicate amounts on the same day at the same merchant (fuel stations): date/time and merchant
  cannot separate them; the scorer ties → `REVIEW`, the human picks.

## Running another month

1. Copy `scripts/abujhd/config.example.json` to `data/<client>/config.json` and fill the three DocAI file ids,
   the three file names (cited in the report), `month` (`YYYY-MM`) and the ledger `sheet`. Add `"kb_id"` (the DocAI workspace id) if the report
   should open inside ReconAI's Report tab; only one folder may carry a given `kb_id`.
2. Run the three scripts with `--data data/<client>`: `a_refine.py` (add `--healer openai` or `claude`),
   then `b_match.py`, then `c_report.py`. `DOCAI_API_KEY` is only needed when `raw/` lacks a file.
3. Use a new data directory per month: `raw/`, `pages/` renders and the healer `cache/` are reused when present,
   so a dir that already holds another month's files would mix them.
4. Merchant spelling differences between receipts and the statement go into `ALIASES` (and noise words into
   `STOP`/`GENERIC`) in `b_match.py`. Human corrections go in `data/<client>/overrides.json`
   (`groups` for field fixes, `links` for forced receipt-to-row links; unknown ids and refs are reported on stderr and skipped).
