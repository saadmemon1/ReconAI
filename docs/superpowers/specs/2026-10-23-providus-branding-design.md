# Providus branding for ReconAI and the reconciliation report — design

Date: 2026-10-23. Branch: `feat/abujhd-petty-cash`. Approved by the user after a design review.

## Goal

Make the generated reconciliation report (`scripts/abujhd/c_report.py` → `report.html`) and the
ReconAI app shell look like they belong to providus.io, add three analytics to the report, and
remove machine-sounding copy.

## Brand tokens (measured from providus.io's computed styles, 2026-10-23)

| Token | Value | Use |
|---|---|---|
| page | `#F2F2F2` | body background |
| card | `#FFFFFF` | cards, tables |
| ink | `#151515` | text |
| muted ink | `#8C8C8C` | secondary text |
| border | `#E0E0E0` | hairlines |
| primary | `#2F6DB2` (hover `#1D6FB3`) | links, review status, chart primary |
| navy | `#033659` | secondary accent |
| deep navy | `#02091F` | header band, with a faint 1px grid texture at 6% white |
| dark surfaces | `#141414` page, `#212121` card, `#2A2A2A` border, ink `#F2F2F2` | dark mode (selected, not inverted) |
| radius | 12px cards, 999px buttons/chips | |
| type | Archivo 400 (display, 28–44px), Geist 400/500/600 (body 14px, UI 12–13px), Geist Mono for refs/amounts | Google Fonts |

Status palette (reserved, validated with the dataviz script in light and dark):
matched `#0A7F3F`, missing `#B42318`, review `#2F6DB2`, untied `#A15C00`, neutral `#8C8C8C`.
Every chip shows an icon + label; colour never carries meaning alone.
Sequential (evidenced share): one blue ramp `#D6E4F3 → #2F6DB2 → #033659`.

## Report page (`c_report.py`)

1. **Header band** (deep navy): Archivo title "Petty cash · {Month YYYY}", chips for client and
   period, a small "powered by providus ▸" lockup right-aligned (text + the arrow glyph, no
   copied logo file), one line of plain-language intro.
2. **Hero tiles** (4, white cards): Card spend (purchases + ATM), Evidenced (% of purchase amount
   with a linked receipt, and count), Open gap (roll-up − card spend, with sign), Receipts to
   find (count of MISSING_RECEIPT rows and their SAR).
3. **Analytics row** (3 white cards, inline SVG from Python, hover tooltips, each with a
   `<details>` table fallback):
   - *Status breakdown* — one stacked horizontal bar of purchase rows by status (count) with a
     second bar by SAR; 2px surface gaps; legend + direct labels.
   - *Tie-out bridge* — a waterfall: Card loads 17,500 → Purchases → ATM → = Card spend →
     Ledger roll-up → Gap; positive steps blue, negative amber, totals navy; the gap labelled.
   - *Top merchants* — top 10 purchase merchants by SAR as horizontal bars, fill from the
     sequential ramp by evidenced share (0–100%), direct value labels, "Other" folded.
4. **Statement table and fix-it sections** — unchanged structure, restyled: white card, Geist
   13px, status chips with icon, Geist Mono for refs/amounts, evidence thumbnails with a
   hairline, section headers in Archivo 20px, "what to check" in plain English.
5. Dark mode via `prefers-color-scheme` using the dark surfaces above; charts re-use the same
   validated hues on the dark surface.

## App shell

- `src/app/globals.css`: replace the neutral tokens with the brand tokens above (light + dark),
  radius 12px, `--font-sans` Geist, `--font-display` Archivo, `--font-mono` Geist Mono.
- `src/app/layout.tsx`: load Archivo, Geist, Geist Mono with `next/font/google`.
- Header: wordmark lockup "ReconAI" (Archivo) with a muted "by providus" beside it; nav pills.
- Buttons: pill radius; primary = brand blue. No layout changes to Files/Report tabs.

## Copy

Humanizer pass on: report headings, hero labels, what-to-check lines, empty states; app
header/tab labels, upload and reconcile buttons, auth prompt. Rules: no "AI-powered",
"seamless", "leverage", "robust", "delve", no em-dash chains, no triads for rhythm, say who
does what.

## Out of scope

The Files/Report tab internals, the README, a generated brand-board image (can be done
later with the brandkit skill if wanted), and any change to matching logic or data.
