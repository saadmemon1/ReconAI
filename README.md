# ReconAI

Document-reconciliation web app: upload procurement documents (purchase orders, receipts, invoices), have them parsed and cross-checked by an LLM, and review the results in a findings report with per-file evidence you can click through to the exact spot in the source PDF.

## Features

- **Upload & parse** — PDFs (and images) upload to your backend and parse in the background with live progress.
- **Reconciliation** — one click runs a 3-way match across a workspace's documents using a DeepSeek LLM, with a live "thinking" stream while it works.
- **Findings report** — severity-ranked findings (critical / high / medium / low), KPI cards (total billed, total overbilled, recommended payable), and a summary whose figures are derived from the structured KPI data by the engine — the LLM writes narrative only.
- **Evidence system** — each finding opens an orbital mindmap of the cited files; select one (or up to three) to view the source PDF with the cited cells highlighted in yellow; click a citation to jump and pulse the exact region. Multi-pane mode lets you audit 2–3 documents side by side, with per-pane zoom.
- **Workspaces** — knowledge bases as isolated workspaces; reports persist per workspace in the browser (localStorage).
- **Auth** — email/password signup and sign-in with encrypted session cookies.

## Tech Stack

- Next.js 16 (App Router, Turbopack), TypeScript
- Tailwind CSS v4, @base-ui/react, lucide-react
- pdfjs-dist (in-browser PDF rendering + text-layer locating)
- three (evidence orbit visualization), framer-motion (tab navigation)
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
| `DOCAI_BASE_URL` | Base URL of the upstream document-AI backend (the app proxies all document/file/parse calls through its own API routes) |
| `DEEPSEEK_API_KEY` | API key for the DeepSeek LLM used during reconciliation |
| `SESSION_SECRET` | Secret used to encrypt session cookies — generate with `openssl rand -base64 32` |
| `LM_STUDIO_URL` | Optional: local LLM server base URL (support currently dormant; DeepSeek cloud is used) |

## Scripts

```bash
bun dev          # development server
bun run build    # production build
bun run lint     # eslint
bun test         # test suite (bun:test)
```

## How it works

The app is a **BFF**: the browser only talks to this Next.js app's API routes, which authenticate the session and forward binary-safe requests to the upstream document-AI backend (no API keys ever reach the client). Documents parse server-side; their status is tracked per file and is authoritative (no client-side staleness).

Reconciliation runs through a **portable engine** (`src/engine/reconcile.ts`): it fetches parsed segments, sends a strict prompt to the LLM (typed contract, verbatim citation quotes), then sanitizes and re-derives every derived figure (totals, overbilling, payable) in code so the report's numbers are consistent. Findings carry citations in the form `<file>: <location hint>: '<verbatim quote>'`, which the evidence viewer locates in the PDF's own text layer (falling back to the backend's segment boxes).

## Local Storage Notes

### Reconciliation reports — per-workspace
Reports are stored per-workspace under `reconai-last-report-<kbId>` so switching
workspaces shows that workspace's report. A legacy global key
(`reconai-last-report`) is migrated once on first run after upgrade, then removed.

### Parsed-files tracking — server-side (no localStorage)
Parse status is NOT stored in localStorage. The file list is fetched with
`GET /files?kb_id=...&include=processing`, and a file counts as parsed when
`processing.latest_parse_job.status === 'completed'` (helper:
`src/lib/file-status.ts` → `isFileParsed()`). The old `reconai-parsed-files`
localStorage Set was removed — server status is authoritative, works across
browsers/devices, and never goes stale (deleted files simply disappear).

Why not per-workspace: parse state belongs to the file (file IDs are globally
unique UUIDs owned by exactly one workspace), so a per-workspace key would
store identical information twice.
