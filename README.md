# ReconAI

Document-reconciliation web app: upload procurement documents (purchase orders, receipts, invoices), have them parsed by **Providus's Document Intelligence Layer (DocAI)**, cross-checked by an LLM, and review the results in a findings report with per-file evidence you can click through to the exact line in the source PDF — then send the supplier a follow-up email drafted from the findings.

```
Upload PO / Receipt / Invoice
   -> DocAI parses (text + tables + geometry)
   -> LLM reconciles (one call: report + findings + email drafts)
   -> Report tab: KPIs, findings, evidence viewer, supplier emails
```

## Features

- **Upload & parse** — PDFs (and images) upload through the app's BFF to Providus DocAI and parse in the background with live progress; parse state is server-authoritative.
- **Files tab** — dense, Drive/Linear-style document table: type icons, date added, status chips (parsed / parsing / not parsed), sortable columns, filename search, per-row + bulk delete with in-app confirmation, row-click opens a resizable PDF preview.
- **Reconciliation** — one click runs a multi-way match across a workspace's documents through a reasoning LLM (DeepSeek cloud or a local server), with a live "thinking" stream and stage-by-stage progress while it works. Discrepancies are flagged across **eight finding categories**: overbilling, quantity mismatch, price mismatch, missing items, extra items, unsupported charges, evidence gaps, and calculation errors.
- **Findings report** — severity-ranked findings (critical / high / medium / low) with search and column visibility, KPI cards (total billed, total overbilled, recommended payable), and a summary whose money figures are derived from the structured KPI data by the engine — the LLM writes narrative only, never arithmetic.
- **Evidence system** — each finding opens an orbital mindmap of its cited files; select up to three to view the source PDFs side by side with **line-level highlights** (the whole table row or text line, not just the matched cell), each citation carrying its own brief reason. Click a citation to jump and pulse.
- **Supplier follow-up emails** — when a reconciliation finds discrepancies, the LLM writes one follow-up email per supplier (in the same response as the report — no second call, no drift); the Report tab shows the drafts read-only with Copy and Open-in-mail-app.
- **Workspaces** — knowledge bases as isolated workspaces; reports persist per workspace in the browser (localStorage).
- **Auth** — email/password signup and sign-in against Providus DocAI, wrapped in encrypted session cookies.

## Architecture

The system is one pipeline: documents in, decisions out.

```
+--------------+   +----------------+   +----------------------+   +--------------+
|  1 . UPLOAD  |-->|  2 . PARSE     |-->|  3 . RECONCILE       |-->|  4 . REVIEW  |
|  Files tab   |   |  Providus      |   |  Engine + LLM        |   |  Report tab  |
|  PDFs/images |   |  DocAI         |   |  one call: report +  |   |  findings .  |
|  -> workspace|   |  -> segments   |   |  findings + email    |   |  evidence .  |
|              |   |    (text,      |   |  drafts              |   |  emails      |
|              |   |    geometry)   |   |                      |   |              |
+--------------+   +----------------+   +----------------------+   +--------------+
        |                   |                      |                        |
        | BFF proxy         | segments feed        | sanitized report       |
        | (API routes,      | BOTH the prompt      | (engine-derived        |
        | auth + path       | and the evidence     | figures)               |
        | allowlist)        | viewer               |                        |
```

Three one-line flows complete the picture:

- **Evidence**: finding → citation → PDF text layer → line-level highlight (DocAI segment row as fallback)
- **Emails**: supplier draft (written in the same LLM response as the report) → Copy / open in mail app
- **Security**: the browser only ever talks to the BFF — no upstream keys reach the client

### Component map

| Layer | Pieces | Responsibility |
|---|---|---|
| **Frontend** | `src/components/dashboard.tsx`, `file-manager.tsx`, `reconcile-runner.tsx`, `report-viewer.tsx` | All screens. No API keys, no direct upstream calls — everything through the BFF. |
| **Evidence viewer** | `src/components/ui/evidence-pdf-viewer.tsx`, `evidence-mindmap.tsx` | Renders cited PDFs in-browser (pdfjs-dist), locates citations in the PDF text layer, draws line-level highlights, orbits cited files. |
| **BFF** | `src/app/api/docai/[...path]/route.ts` | Authenticates the session, validates the requested path against an allowlist, forwards to `{DOCAI_BASE_URL}/v1/...` with the DocAI session cookie + `x-docai-org-id` header. |
| **Reconcile API** | `src/app/api/reconcile/route.ts` | SSE stream: calls the LLM provider, forwards reasoning deltas live, returns the sanitized report. |
| **Reconcile engine** | `src/engine/reconcile.ts` | Pure, portable, unit-tested: builds the prompt, calls the LLM, parses + sanitizes the JSON report, derives every figure in code. |
| **Libraries** | `src/lib/evidence-utils.ts`, `pdf-lines.ts`, `kpi-utils.ts`, `file-table.ts`, `session.ts`, `docai-proxy.ts`, `proxy-path-validation.ts`, `format-inline.ts`, `file-status.ts` | Pure logic: citation locating, line grouping, KPI math, file sorting, encrypted sessions, proxying, path allowlists. |
| **Tests** | `src/lib/__tests__/`, `src/engine/__tests__/` | 160 `bun:test` cases — engine, citation location, line grouping, KPI derivation, prompt-injection hardening, email verification. |

## How we use Providus's Document Intelligence Layer (DocAI)

ReconAI is built on top of **Providus's Document Intelligence layer (DocAI)** — the app relays all document/file/parse calls to it through the BFF. Interested in using DocAI for your own documents (parsing, extraction, classification, redaction)? Contact the Providus team at **hello@providus.ai** or **sami@providus.ai**.

DocAI is a hosted service: parsing and file operations consume DocAI credits provisioned by Providus, so running the app end to end requires a Providus account with DocAI credits. Reach out at **hello@providus.ai** to get set up.

The app never talks to DocAI directly. Every document capability goes through the BFF, which authenticates, validates, and relays:

**Auth & workspaces**
- Sign-up / sign-in hit Providus's auth (better-auth session tokens). The returned `session_token` + org id are wrapped in our own encrypted JWT cookie (`reconai-session`, HS256, 24h, HttpOnly) via `jose`. DocAI requests carry `better-auth.session_token` as a cookie and `x-docai-org-id` for org-scoped access (per the control-plane OpenAPI security requirements).
- Workspaces map to DocAI knowledge bases (`kb_id`); files belong to exactly one KB.

**Files & parsing**
- `GET /files?kb_id=...&include=processing` — the authoritative file list, including parse state. A file counts as parsed when `processing.latest_parse_job.status === 'completed'` (`src/lib/file-status.ts`). No client-side staleness; deleted files simply disappear.
- Uploads (multipart) and deletes relay through the proxy. Parse is triggered server-side; the UI polls status.

**Segments — the structured document representation**
- `GET /files/{id}/segments` returns the document as segments: each segment carries `markdown` text plus `coordinates` in a normalized **1000×1000 page space**, and table segments carry `cells` (text, `bbox`, row/col, and a `cellsSource` flag). For `grid-estimate` segments the engine re-estimates column boundaries from text lengths because DocAI's equal-width grid misplaces uneven columns.
- Segments feed BOTH halves of the app:
  1. **Reconciliation** — segment text is embedded in the LLM prompt (XML-tagged as untrusted data).
  2. **Evidence viewer** — `locateCitations` matches finding citations to segments/cells, and the segment geometry provides highlight boxes (with a text-layer refinement + full-row expansion on top).

**Why the BFF pattern** — API keys never reach the browser, the path allowlist blocks traversal and out-of-surface endpoints (`/internal/*`, admin, billing, health), and the session is validated on every relay.

## Reconciliation pipeline

1. **Prompt construction** (`buildReconciliationPrompt`): document segments are wrapped in `<document>` XML tags and explicitly declared **untrusted data** (prompt-injection hardening: embedded fake instructions/JSON/system-overrides must be ignored; file names are sanitized; the security boundary is restated at the end).
2. **Single LLM call** — the model returns ONE JSON document containing:
   - `documentClassifications` (PO / receipt / invoice / other),
   - `groups` (document sets + KPIs + findings + line items),
   - `unmatchedDocuments`, `summary`, `currency`,
   - `supplierEmails` (per-group vendor contact — verified against the actual document text afterwards),
   - `emailDrafts` (one follow-up email per supplier with findings, written in the same reasoning context as the findings — so the email can never drift from the report).
   - Findings carry strict citations: `"<file>: <location hint>: '<verbatim 5-40 char quote>' [reason: <brief why>]"` — the reason suffix is metadata, never part of the quote.
3. **Provider routing** (`/api/reconcile`): `deepseek/<model>` → DeepSeek API (`api.deepseek.com/v1`, thinking enabled); `lmstudio/<model>` → local OpenAI-compatible server with `reasoning_effort: high`. Responses stream as SSE; reasoning deltas are forwarded live and matched to plan stages.
4. **Parse + sanitize** (`extractJSON` → `validateReport`): KPIs are clamped via `sanitizeKPIs`, incomplete findings dropped, supplier emails verified against document text (invented addresses replaced by the first real email found via regex, or dropped), email drafts shape-checked (recipient must be a verified supplier email).
5. **Engine-derived figures**: the "Billed − Overbilled = Recommended payable" line is computed in code from the structured KPIs (the LLM never performs this arithmetic — its prose sums used to drift). File ids are stamped onto classifications from the caller's input order.
6. **Template fill**: any supplier with findings but no valid LLM draft gets a deterministic template email, so the email card is never empty.

## Evidence system

- Finding citations are attributed to files (`attributeCitations`) and matched to DocAI segments by `locateCitations` (exact cell text → segment markdown contains → cell contains, with row-hint fallbacks).
- The viewer then re-locates each citation **in the PDF's own text layer** (glyph-exact, digit-equivalence matching) and expands it to the **full visual line**: `src/lib/pdf-lines.ts` groups text-layer items by baseline into lines (tolerance in % of page height) and returns the line's union box + full text. For scanned PDFs with no usable text layer, `segmentRowBox` unions every cell of the row containing the citation (DocAI geometry). Priority: text-layer line → segment row → tight box.
- The citation list shows the full line text plus the citation's `[reason: ...]` — the brief "why this line" written by the LLM.
- The mindmap orbit (three.js) shows all cited files; opening panes renders each PDF with pdfjs-dist and overlays the highlights as positioned boxes.

## Security model

- **BFF-only egress**: browsers never hold upstream API keys; every external call is authenticated and path-allowlisted server-side.
- **Prompt injection**: document text is XML-tagged untrusted data with explicit ignore-instructions boundaries; file names sanitized; citation quotes must be verbatim; supplier emails are verified against the document text before use.
- **Session**: encrypted JWT cookies (jose, HS256, 24h), HttpOnly, SameSite=Lax.
- **Path validation**: `isSafeProxyPath` blocks traversal and out-of-surface DocAI endpoints; the reconcile route requires plain DocAI UUIDs for file ids.

## Tech Stack

- Next.js 16 (App Router, Turbopack), React 19, TypeScript
- Tailwind CSS v4, @base-ui/react (shadcn), lucide-react, framer-motion / motion
- pdfjs-dist (in-browser PDF rendering + text-layer locating)
- three (evidence orbit visualization)
- jose (session cookie encryption)
- bun (package manager / test runner)

## Getting Started

Prerequisites: Node.js 20+ and [bun](https://bun.sh).

```bash
bun install
cp .env.example .env.local   # if you have one; otherwise create it manually
bun dev
```

Open http://localhost:3000.

### Environment variables (`.env.local`)

| Variable | Purpose |
|----------|---------|
| `DOCAI_BASE_URL` | Base URL of **Providus's Document Intelligence Layer** — the app relays all document/file/parse calls here |
| `DEEPSEEK_API_KEY` | API key for the DeepSeek LLM used during reconciliation |
| `SESSION_SECRET` | Secret used to encrypt session cookies — generate with `openssl rand -base64 32` |
| `LM_STUDIO_URL` | Optional: local OpenAI-compatible LLM server base URL (route `lmstudio/<model>`) |

### Models

The reconcile model selector offers DeepSeek cloud models (`deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`) and any `lmstudio/<model>` served at `LM_STUDIO_URL`. Model routing lives in `src/app/api/reconcile/route.ts`; the picker list in `src/components/model-selector.tsx`.

## Scripts

```bash
bun dev          # development server
bun run build    # production build
bun run lint     # eslint
bun test         # test suite (bun:test)
```

## Project structure

```
src/
|-- app/
|   |-- api/
|   |   |-- auth/            signup . signin . signout . session
|   |   |-- docai/[...path]/ whitelisted BFF relay to Providus DocAI
|   |   `-- reconcile/       SSE LLM stream -> report
|   `-- page.tsx             dashboard shell
|-- components/
|   |-- dashboard.tsx        tab shell (Files / Report)
|   |-- file-manager.tsx     Files tab: upload, dense table, preview, delete
|   |-- reconcile-runner.tsx model picker, SSE thinking stream, stages
|   |-- report-viewer.tsx    KPIs, summary, findings, supplier emails
|   `-- ui/                  evidence-pdf-viewer, evidence-mindmap, primitives
|-- engine/
|   `-- reconcile.ts         pure reconciliation engine (prompt, parse, sanitize, derive)
`-- lib/
    |-- docai-proxy.ts       upstream fetch helper (session cookie + org header)
    |-- evidence-utils.ts    citation locating, attribution, reasons, segmentRowBox
    |-- pdf-lines.ts         text-layer line grouping for line-level highlights
    |-- kpi-utils.ts         KPI sanitization + payable derivation
    |-- file-table.ts        sort/search helpers for the Files table
    |-- session.ts           encrypted JWT session cookies
    |-- proxy-path-validation.ts  BFF path allowlist
    `-- __tests__/           bun:test suites
```

## Local Storage Notes

### Reconciliation reports — per-workspace

Reports are stored per-workspace under `reconai-last-report-<kbId>` so switching workspaces shows that workspace's report. A legacy global key (`reconai-last-report`) is migrated once on first run after upgrade, then removed.

### Parsed-files tracking — server-side (no localStorage)

Parse status is NOT stored in localStorage. The file list is fetched with `GET /files?kb_id=...&include=processing`, and a file counts as parsed when `processing.latest_parse_job.status === 'completed'` (helper: `src/lib/file-status.ts` → `isFileParsed()`). The old `reconai-parsed-files` localStorage Set was removed — server status is authoritative, works across browsers/devices, and never goes stale (deleted files simply disappear).

Why not per-workspace: parse state belongs to the file (file IDs are globally unique UUIDs owned by exactly one workspace), so a per-workspace key would store identical information twice.

## Acknowledgements

ReconAI was mentored, directed, and reviewed by the Providus team, who also provided access to the Document Intelligence layer (DocAI) that powers it:

- **Sami Haroon (@samihk)** (VP of Engineering) — mentorship and product direction
- **Mujtaba Kamal (@mujtabakamal1230)** (Senior Software Engineer) — engineering review and guidance throughout
