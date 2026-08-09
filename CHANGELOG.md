# ReconAI Changelog

### [2025-07-30] Task 1 Complete: Initialize Next.js project

- Files: Created package.json, tsconfig.json, next.config.ts, postcss.config.mjs, eslint.config.mjs, src/app/layout.tsx, src/app/page.tsx, src/app/globals.css, public/*
- Test: `bun run build` succeeded. Dev server started on :3000, served HTML successfully.
- Notes: Used `create-next-app` in temp dir then copied files (directory name has capitals which Next.js rejects). Reinstalled deps with bun for proper module resolution.

### [2025-07-30] Task 2 Complete: Install shadcn/ui + jose

- Files: Created components.json, src/components/ui/{button,input,card,select,dialog,label,badge,separator}.tsx, src/lib/utils.ts. Added jose dependency.
- Test: `bun run build` succeeded (compiled in ~2.2s).
- Notes: shadcn initialized with defaults. All 8 components added successfully.

### [2025-07-30] Task 3 Complete: Apply minimalist-ui design tokens

- Files: Modified src/app/globals.css
- Test: `bun run build` succeeded (compiled in ~1.7s).
- Notes: Replaced shadcn default CSS variables with minimalist-ui spec colors, radii (8/10/12px), type scale, and added success/warning colors.

### [2025-07-30] Task 4 Complete: Session encryption utility

- Files: Created src/lib/session.ts
- Test: `npx tsx` round-trip test passed (PASS). Build also succeeds.
- Notes: Uses jose for JWT-based session encryption.

### [2025-07-30] Task 5 Complete: DocAI proxy helper

- Files: Created src/lib/docai-proxy.ts
- Test: `bun run build` succeeded.
- Notes: Generic DocAI API proxy helper with session cookie forwarding, handles JSON/FormData/raw bodies.

### [2025-07-30] Task 6 Complete: Auth API routes

- Files: Created src/app/api/auth/signup/route.ts, signin/route.ts, signout/route.ts, session/route.ts
- Test: `bun run build` succeeded.
- Notes: Uses /v1/orgs/current (verified in OpenAPI spec).

### [2025-07-30] Task 7 Complete: Catch-all DocAI proxy route

- Files: Created src/app/api/docai/[...path]/route.ts
- Test: `bun run build` succeeded.

### [2025-07-30] Task 8 Complete: Root layout + session provider

- Files: Modified src/app/layout.tsx, created src/components/auth-provider.tsx
- Test: `bun run build` succeeded.

### [2025-07-30] Task 9 Complete: Auth form component

- Files: Created src/components/auth-form.tsx
- Test: `bun run build` succeeded.

### [2025-07-30] Task 10 Complete: Dashboard shell + auth gate

- Files: Modified src/app/page.tsx, created src/components/dashboard.tsx
- Test: `bun run build` succeeded.

### [2025-07-30] Task 11 Complete: Credit display, KB manager, file manager, model selector

- Files: Created credit-display.tsx, kb-manager.tsx, file-manager.tsx, model-selector.tsx
- Test: `bun run build` succeeded.

### [2025-07-30] Task 12 Complete: Reconciliation engine

- Files: Created src/engine/reconcile.ts, src/engine/__tests__/reconcile.test.ts
- Test: `bun test` passes (2/2).

### [2025-07-30] Task 13 Complete: Reconciliation API route

- Files: Created src/app/api/reconcile/route.ts
- Test: `bun run build` succeeded.

### [2025-07-30] Task 14 Complete: Reconcile runner + dashboard

- Files: Created reconcile-runner.tsx, report-viewer.tsx (stub), updated dashboard.tsx
- Test: `bun run build` succeeded.

### [2025-07-30] Task 15 Complete: Report viewer (full UI)

- Files: Replaced src/components/report-viewer.tsx stub with full implementation
- Test: `bun run build` succeeded.

### [2025-07-30] Task 16 Complete: Environment config (FINAL)

- Files: Created .env.local, modified .gitignore
- Test: `bun run build` (Environments: .env.local).

### [2025-07-30] Cleanup: Removed all hardcoded URLs/keys

- Files: Modified session.ts, docai-proxy.ts, reconcile/route.ts
- Test: `bun run build` succeeded.

### [2025-07-30] Fixes: Origin header, session parsing, orgId

- Files: docai-proxy.ts, signin/route.ts, signup/route.ts, session/route.ts, auth-provider.tsx
- DocAI requires Origin header. Session response nested under {session: {currentOrgId, ...}}. signIn/signUp return {ok, error}.

### [2025-07-30] UI polish: elevation, animations, error recovery

- Files: globals.css, auth-provider.tsx, auth-form.tsx
- Card elevation (0 1px 2px rgba), 150ms ease-out transitions, real API errors in auth form

### [2025-07-30] UI polish: label spacing, multi-upload, button colors, KB selection

- Files: auth-form.tsx, file-manager.tsx, button.tsx, kb-manager.tsx
- Labels now mb-1.5 spacing. File upload supports multiple selection. Secondary buttons use bg-muted. KB selection uses border+bg-muted instead of ring-2.

### [2025-07-30] Fixes: model ID, segments mapping, parse job ID, job status

- Files: model-selector.tsx, reconcile/route.ts, file-manager.tsx
- Removed double provider prefix. Segments normalized (markdown→content). Parse job ID from jobs[0].job.job_id. Job status from job.status.

### [2025-07-30] Feature: Parsed file detection, disable re-parse, reconcile filter

- Files: file-manager.tsx, reconcile-runner.tsx, reconcile/route.ts
- Tracked via localStorage. "Parsed ✓" badge on completed files. Parse button disabled for parsed files. Reconcile tab only shows parsed files. Removed debug logs.

### [2026-07-30] Feature: Bulk parse + bulk delete with checkboxes

- Files: file-manager.tsx
- Per-file checkboxes + select-all; bulk action bar (Parse X Selected / Delete X Selected); selected cards highlighted. Single-file parse reuses the bulk path.

### [2026-07-30] Fixes: checkboxes, bulk job mapping, LM Studio model name, segments shape

- Files: file-manager.tsx, reconcile/route.ts
- All checkboxes 16px with cursor-pointer. Bulk parse maps each job to its file by index (was: all files shared the first job ID → 404s). LM Studio model ID = full path after provider prefix (`qwen/qwen3-vl-30b`, not last segment). Segments endpoint returns a flat array directly — handle both shapes.

### [2026-07-30] Fixes: lenient LLM output handling

- Files: reconcile.ts (engine), report-viewer.tsx
- KPIs: missing → 0, numeric strings → parseFloat (no more 500s). Incomplete findings (no severity/category/description) skipped instead of fatal. Line-item status falls back to 'unknown'. Explicit prompt structure with concrete KPI/line-item example ("Use EXACTLY these field names") to stop snake_case drift.

### [2026-07-31] Feature: LLM reasoning capture

- Files: reconcile/route.ts, reconcile.ts, report-viewer.tsx
- Reasoning captured from `reasoning_content` (DeepSeek) / `reasoning` (LM Studio); `reasoning_effort: high` for LM Studio; collapsible "LLM Reasoning" section in report (persisted in localStorage).

### [2026-07-31] Tasks A–E: Workspace rename, flow redesign, 3-KPI spec, currency codes, typography

- Files: workspace-manager.tsx (new), dashboard.tsx, file-manager.tsx, reconcile-runner.tsx, report-viewer.tsx, kpi-utils.ts (+tests), globals.css
- **Task A**: Knowledge Base → Workspace (end-to-end rename, new component file).
- **Task B**: Workspace selection dropdown (name, not raw ID); "New Workspace" only surfaces in upload flow; new workspace auto-selected; fixed transparent dropdown/dialog (missing `--color-popover` tokens).
- **Task C + D**: 3-KPI spec — Total Billed / Recommended Payable / Total Overbilled (+ "% of billed" sub-label); tone system (good/warn/bad/neutral); money 0 decimals with ISO currency code prefix (PKR, USD — no symbols); currency auto-detected by the LLM; prompt now demands explicit summary derivation ("Billed X − Overbilled Y = Recommended payable Z").
- **Task E**: Finding descriptions and summary enlarged (text-base leading-relaxed), citations/expected-actual text-sm.

### [2026-08-04] Task G: Premium animations (CSS-only)

- Files: globals.css, report-viewer.tsx, dashboard.tsx, file-manager.tsx
- fade-up / scale-in / crossfade keyframes (150–180ms ease-out), staggered KPI boxes (0/60/120ms), findings (40ms steps), group cards (60ms), file cards (30ms, capped); all gated by `prefers-reduced-motion`.

### [2026-08-04] Security F3 + F4: prompt injection hardening, KPI integrity (no tampering)

- Files: reconcile.ts, kpi-utils.ts, route.ts (+tests)
- **F3**: documents wrapped in `<document>` XML data tags; embedded `</document>` breakout neutralized; security-boundary instruction block; stronger system prompt; `sanitizeFileName()` strips framing-breaking chars (also fixes F11 fileName injection).
- **F4** (owner decision: no tampering with numbers): `sanitizeKPIs()` coerces types only (string→number, NaN/Infinity→0); negatives preserved exactly — credit notes/discounts are legitimate. No clamping, no bounds.
- Also: `extractJSON` exported + 7 tests; reasoning models' empty-content fallback; `max_tokens` 32000; diagnosable JSON-parse errors.

### [2026-08-04] Feature: Per-workspace reconciliation reports

- Files: report-storage.ts (+tests), reconcile-runner.tsx, dashboard.tsx
- Reports stored under `reconai-last-report-<kbId>`; legacy global key migrated once then removed; runner remounted via `key={kbId}` on workspace switch (resets report + selection).

### [2026-08-04] Feature: API-driven parse status (?include=processing)

- Files: file-status.ts (+tests), file-manager.tsx, reconcile-runner.tsx
- Parsed state now comes from the server (`processing.latest_parse_job.status === 'completed'`) instead of a localStorage Set — authoritative, cross-device, no stale IDs. localStorage fallback removed after verification.

### [2026-08-04] Security F1 + F2: proxy path allowlist + fileId UUID validation

- Files: proxy-path-validation.ts (+tests), [...path]/route.ts, reconcile/route.ts
- **F1**: catch-all proxy gate — segment charset check + structural allowlist of the 10 UI path shapes; everything else (internal/*, health, openapi.json, admin, billing webhooks) → 400. Dynamically verified: escaping payloads blocked, real paths still forward.
- **F2**: reconcile `fileIds` must be DocAI UUIDs → blocks `../api-keys` style injection (400 before any upstream call).

### [2026-08-04] Fix: line-item table currency

- Files: report-viewer.tsx
- PO/Invoice unit prices in the per-group tables: `$` symbol + 2 decimals → ISO code prefix + 0 decimals (PKR 470), consistent with KPI boxes.

### [2026-08-04] Prompt: finding deduplication instruction

- Files: reconcile.ts
- New "Deduplication (IMPORTANT)" section: report each underlying discrepancy exactly once; merge same-quantity/same-document findings into one with max severity + all citations (kills duplicate pair-wise findings like the 16-vs-12 shortfall reported twice).

### [2026-08-04] Feature: Live LLM thinking stream + report layout

- Files: reconcile/route.ts, reconcile-runner.tsx, report-viewer.tsx
- Route streams SSE — reasoning deltas forwarded live, then `{type:report}` event. Runner shows auto-scrolling "LLM Thinking" panel (auto-opens while streaming, collapses when done, re-expandable via rotating chevron). Executive summary moved between KPIs and Findings. Bottom "LLM Reasoning" block removed (logs live at the top now).

### [2026-08-04] Security F6: upload type restriction

- Files: file-manager.tsx
- Upload input restricted to PDF/images via `accept` attr + client-side MIME filter (rejected files counted and shown in a notice); supported-formats disclaimer in the upload dialog. DocAI confirmed to accept only PDFs/images — closes stored-XSS-via-HTML/SVG class at the boundary.

### [2026-08-04] UI: icon sign-out with confirmation, credits bottom-left, findings table

- Files: dashboard.tsx, report-viewer.tsx
- Sign Out button → LogOut icon; click opens a confirmation dialog (Cancel / Sign Out) — no accidental single-click sign-outs.
- Credits moved from the header to the bottom-left (later made floating).
- Findings rendered as a table (Severity | Category | Doc | Description | Expected → Actual | Evidence), severity color-coded, empty state added.

### [2026-08-04] UX: Report tab flow, reconcile-from-Files, auto-parse on upload

- Files: file-manager.tsx, reconcile-runner.tsx, dashboard.tsx
- File list sorted parsed-first (server status via ?include=processing).
- Reconcile tab renamed **Report**; it no longer lists files or picks a model — it shows the persisted workspace report, or live thinking + fresh report when triggered. Empty state points to the Files tab.
- Files tab bulk bar: Parse X Selected (left) + green **Reconcile X Documents** (right, shown when ≥2 selected); grayed out with "Only parsed files can be reconciled" subtitle when a non-parsed file is selected. Clicking jumps to the Report tab and starts reconciling.
- **Auto-parse on upload**: freshly uploaded files automatically queue parse jobs (upload IDs captured from the response, or matched by filename after refresh).
- Model auto-picked initially (default → first available LM Studio → deepseek-chat); later replaced by an explicit selector.

### [2026-08-04] Model selector next to Reconcile button

- Files: file-manager.tsx, reconcile-runner.tsx, dashboard.tsx
- ModelSelector rendered beside "Reconcile N Documents"; modelId flows FileManager → ReconcileRequest → runner. Button disabled until a model is chosen. Selector hidden when the button is disabled (non-parsed file selected) or absent (<2 selected). Auto-pick kept as fallback only.

### [2026-08-04] Fix: clear file selection + job statuses on workspace switch

- Files: file-manager.tsx
- FileManager isn't remounted per workspace, so the kbId effect now resets selectedIds and jobStatuses before reloading — the bulk bar no longer lingers with the previous workspace's selection.

### [2026-08-04] Workspace delete with confirmation dialog; floating credits

- Files: workspace-manager.tsx, dashboard.tsx
- Trash icon next to the workspace selector (visible when a workspace is selected) → confirmation dialog naming the workspace, warning ALL files are deleted irreversibly → destructive Delete Workspace button (still sends ?confirm_permanent=true). Deleted active workspace deselects.
- Credits badge now fixed at bottom-left (z-40), always visible while scrolling.

### [2026-08-04] Security F5: org-aware session + x-docai-org-id forwarding (VERIFIED)

- Files: docai-proxy.ts, signin/route.ts, signup/route.ts, auth/session/route.ts, reconcile/route.ts, session-org.ts (+tests)
- DocAI file/KB endpoints require BOTH the session cookie and x-docai-org-id (per control-plane OpenAPI security); orgId was previously always '' and the header never sent — cross-org access rested entirely on DocAI's token scoping.
- signin/signup now fetch the real currentOrgId (via /v1/auth/session) and store it in the encrypted JWT; proxy forwards x-docai-org-id; session route self-heals stale/empty orgId by re-issuing the cookie.
- reconcile route passes orgId and fails loudly ("File <id> not accessible (HTTP N)") when DocAI rejects a file — no more silent "0 segs" reconciliation of foreign documents.
- Verified with two real accounts: cross-org file fetch → 404 "File not found" (DocAI enforces scoping); reconcile with a cross-org fileId → rejected before any LLM call.
- 4 new extractOrgId unit tests (71 total).

### [2026-08-04] Model selector: duplicate-option + stale-closure fixes

- Files: model-selector.tsx, reconcile-runner.tsx, reconcile/route.ts
- Fixed stale-closure bug: the async /ai/models response auto-selected the default model and silently overwrote a model the user had just picked (the select tick appeared to jump to a same-named LM Studio entry).
- Fixed duplicate option values: /ai/models response already includes deepseek/deepseek-v4-flash and deepseek-v4-pro (provider: deepseek) — the selector was rendering them in BOTH the LM Studio group (from the API list) and the DeepSeek group (hardcoded), and browsers tick the first duplicate. Now split by provider.
- DeepSeek model names corrected to current API names (deepseek-v4-flash / deepseek-v4-pro); thinking: {type: "enabled"} + reasoning_effort: "high" sent for both (both models support thinking).
- Attempted "deepseek via LM Studio" routing was reverted: the listed deepseek models are cloud models, not models the LM Studio server actually serves (LM Studio 400s "No models loaded" / silently falls back to the loaded model).

### [2026-08-04] Model selection: DeepSeek cloud only (LM Studio dormant)

- Files: model-selector.tsx, reconcile-runner.tsx
- User decision: stop using LM Studio models for reconciliation. Selector now offers only DeepSeek V4 Flash / V4 Pro (routed to api.deepseek.com with the env `DEEPSEEK_API_KEY`).
- Runner default fallback model → `deepseek/deepseek-v4-flash`.
- The reconcile route's `lmstudio` provider branch (URL, `reasoning_effort`, model-path handling) is left intact — easy revert if needed.
- DeepSeek calls send `thinking: {type:"enabled"}` + `reasoning_effort:"high"` (both flash and pro support thinking) → live thinking stream shows reasoning.
- Note: earlier commits in this area fixed (a) stale-closure auto-select overwriting user picks and (b) duplicate option values from the /ai/models response also listing deepseek models.

### [2026-08-04] Signup: password strength meter + client-side validation gate

- Files: auth-form.tsx, ui/password-strength.tsx (new), package.json (motion dep)
- New motion-based PasswordStrength component (spring bars, crossfade label, reduced-motion aware, aria-live announcements, "Commonly guessed" warning) added to src/components/ui/.
- Rules trimmed per user request: only "12 characters or more" + "A number" (case/symbol requirements removed).
- Signup submit is gated client-side: both rules must be met or the form blocks with "Password must meet: ..." before any API call — the upstream PASSWORD_TOO_SHORT should no longer surface from signup.
- Commonly-guessed passwords are warned (amber tag) but allowed — upstream only rejects too-short passwords.
- Signup field order: Name, Organization Name, Email, Password (+ strength meter). Sign-in unchanged.

### [2026-08-04] Parse progress: flux loader bar in file rows

- Files: file-manager.tsx, ui/progressive-flux-loader.tsx (new), package.json (framer-motion dep)
- New ProgressiveFluxLoader: flux-gradient progress bar (blue→cyan→blue, sheen sweep), spring fill, reduced-motion aware, aria-valuetext announcements.
- Job polling now reads `percent` from the parse job status endpoint; the "Parse: running" text line is replaced by a compact flux bar per file row.
- Bar entry is deleted on terminal job state (completed/failed/cancelled) so it disappears cleanly once parsing finishes.
- Slightly larger bar (h-2.5) + breathing room between filename, bar, and action buttons.
- Note: Framer's "Wave Reveal Button" experiment was reverted — plain green Reconcile button restored.

### [2026-08-04] Agent-plan reconcile progress view + per-step stage events

- Files: reconcile-runner.tsx, api/reconcile/route.ts, ui/agent-plan.tsx (new)
- LLM thinking panel replaced by an animated plan: Document Retrieval (completed) → Reconciliation (live) → Report Generation.
- Reconciliation subtasks light up progressively: the route detects phase keywords in the streamed reasoning (comparing → computing totals → flagging discrepancies → summarizing findings) and emits per-step SSE `stage` events; "Preparing report" fires when content generation actually starts (not on reasoning keywords), with throttled live char-count `progress` events so the final stage never looks stuck.
- Streamed thinking text follows the currently-active subtask (not always the first); in-progress icons spin; header cycles reconcile synonyms ("Reconciling… Cross-checking… Matching…") with a pulsing ellipsis every 3s while running.
- agent-plan.tsx: animated task/subtask tree (lucide-react + framer-motion, reduced-motion aware), controllable via `tasks` prop; demo data + click-to-toggle kept as fallback.
- All stages turn green on report arrival.

### [2026-08-04] Findings table: severity filter chips, Evidences popup, sticky layout

- Files: report-viewer.tsx, ui/table.tsx (new), ui/dropdown-menu.tsx (new), ui/tooltip.tsx (new), ui/avatar.tsx (new), engine/reconcile.ts
- Summary card: prompt now requests bulleted discrepancies; derivation formula strip rendered from computed KPIs (Billed − Overbilled = Payable); Model line moved into the collapsed Reconcile Progress panel.
- Findings rendered as a contributors-style table: Status | Doc | Description | Expected → Actual | Evidence, with a live search filter, "N of M" count, and a Columns dropdown (Base UI menu with checkboxes; Doc hidden by default).
- Severity badges are clickable filters (multi-select, active-inverted, Clear filter); each severity now has a persistent tinted pill (critical red / high amber / medium blue / low gray — medium no longer matches low).
- Evidence column: "Evidences" button opens a dialog with the finding header, source citations, and a dashed placeholder for the future evidence mindmap.
- Sticky layout: filter bar pins to viewport top, column headers stick below it (both `position: sticky` against page scroll — the table has NO fixed height and no inner scrollbox).
- Header row keeps the hover shade (bg-muted/50) permanently; thead solid bg-background so stuck headers hide rows beneath.
- New Base UI wrappers (table/dropdown-menu/tooltip/avatar) — the provided Radix-based demo files were ported to @base-ui/react to match the project's primitive library.
- Expected → Actual column: no fixed width / no nowrap (wraps naturally); avatar removed from Doc column.

### [2026-08-06] Sticky Files/Report tab bar

- Files: dashboard.tsx, report-viewer.tsx
- Tab bar (Files/Report) is now sticky: pins to the top of the viewport while scrolling so the active tab is always visible. `-mt-3`/`mb-3` cancel the new `py-3` so the resting layout is pixel-identical to before.
- The findings table's sticky filter bar and column header now offset below the tab bar via a shared `--tabbar-h` CSS var set on the dashboard root (56px = h-8 button + py-3) — single source of truth if the bar ever resizes.

### [2026-08-06] Profile account menu (avatar + dropdown)

- Files: dashboard.tsx, auth-provider.tsx, api/auth/session/route.ts, lib/session-org.ts, lib/__tests__/session-org.test.ts, ui/dropdown-menu.tsx, globals.css
- Top-right sign-out icon replaced by an initials avatar (black circle, white initial); clicking opens a dropdown beside it (side=left, vertically centered) showing the user name (bold), organisation name (muted), and a red "Sign out" row.
- "Sign out" still opens the existing confirmation dialog — the single-click-can't-sign-you-out guarantee is preserved.
- Session route returns `orgName` via new pure helper `extractOrgName` (organizations[] matched to currentOrgId, first-org fallback, nested + flat shapes; 6 new unit tests).
- ui/dropdown-menu.tsx: new `DropdownMenuItem` export; Positioner `side` prop passes through.
- Popup opens side=left because the gap under the avatar ends exactly at the sticky tab bar's top edge (the tab bar's -mt-3 pulls it up 12px) — a bottom-anchored popup overlapped it by a few px.
- globals.css: global `button, [role=button] { cursor: pointer }` rule (no button in the app showed a pointer cursor before).

### [2026-08-06] Report polish: bold summary figures, whole-number amounts, Line Items header

- Files: engine/reconcile.ts (prompt), lib/format-inline.ts (new) + unit tests, report-viewer.tsx, reconcile-runner.tsx
- Prompt now instructs **bold** SPARINGLY: bold only the 3 key monetary figures (billed, overbilled, recommended payable) as complete amount phrases (e.g. `**PKR 7,200**`), never punctuation/whole lines/bullets; example JSON shows it concretely.
- Prompt now requires whole-number amounts (no `.00`) everywhere — summary, finding expected/actual, line item prices/totals. The example JSON previously used `450.00`/`470.00`/`7200.00`, which the LLM copied verbatim into every report; example + rule now use whole numbers.
- New `renderInlineFormatting` (lib/format-inline.ts): renders `**bold**`/`*italic*` markers as `<strong>`/`<em>`, React-escaped (no dangerouslySetInnerHTML — LLM output stays untrusted). 7 unit tests incl. HTML-injection guard.
- Per-group line items card header changed from `group.description` (the LLM was filling it with the PDF name) to a static "Line Items"; the doc list with roles stays as the subtitle.
- Reconcile Progress panel: the "Model:" line is hidden while running and reappears inside the collapsed section once the run finishes.

### [2026-08-06] Evidence mindmap (which files a finding cites)

- Files: ui/evidence-mindmap.tsx (new), lib/evidence-utils.ts (new) + tests, report-viewer.tsx, engine/reconcile.ts, api/reconcile/route.ts, reconcile.test.ts
- The Evidences dialog (max-w-5xl, header "Evidences Mindmap") now shows an orbital widget instead of the placeholder + header block + flat citation list.
- Center = the finding: severity-colored pulsing circle (red/amber/blue/gray, same palette as the table pills), a "SEVERITY · CATEGORY" caption, and a hover card with the description + expected → actual (self-managed hover, Base UI tooltips were unreliable inside the dialog).
- Satellites = only files with ≥1 attributed citation. Clicking one rotates it to the top and opens a card: role badge (PO/RECEIPT/INVOICE), that file's citations, an "Open file" button (deep-links to the real PDF via /api/docai/files/{id}/content), and jump buttons to the other cited files.
- Rotation: rAF + delta-time (smooth 60fps, same 6°/s); the 700ms transition applies only while frozen (click-to-center sweep) — the showcase's 50ms setInterval + always-on transition caused lag/jitter. Reduced-motion disables rotation and ping/pulse.
- The report now carries fileIds: the engine stamps each classification's `fileId` from the caller's input order (clamped, unit-tested); legacy persisted reports just don't show the Open file button.
- `attributeCitations` (evidence-utils): citation → file by name-stem match, then unique-role match; unmatched citations surface as a "N references not matched to a file" count bottom-right so nothing silently vanishes.
- Tests: engine fileId stamping + out-of-range clamping; 9 attribution cases (stem, case-insensitivity, unique role, short-role false positives, ambiguity, no-match, empty).

### [2026-08-06] PDF-in-node evidence viewer (cell-level highlights in the PDF)

- Files: ui/evidence-pdf-viewer.tsx (new), ui/evidence-mindmap.tsx (selector mode), lib/evidence-utils.ts (locateCitation pipeline), lib/__tests__/evidence-utils-locate.test.ts (new), report-viewer.tsx (split layout), api/docai/[...path]/route.ts (binary-safe proxy), engine/reconcile.ts (citation format), package.json (pdfjs-dist).
- The Evidences dialog (max-w-6xl) is now a split layout: the orbit is a selector on the left (centered until a node is clicked, then repositions) and a PDF viewer panel slides in on the right. No file pre-selected.
- The viewer renders the cited page with pdf.js (lazy-loaded; worker emitted via `new URL` — Turbopack-compatible) and overlays yellow boxes on the exact cited cells. Citations are clickable and drive page switching + scroll-to-highlight; "Open file" stays as the full-doc escape hatch; the PDF fetch retries once (ngrok drops).
- Highlight geometry, most-reliable-source-first: (1) the rendered PDF's own text layer (getTextContent) — ground truth, immune to DocAI coordinate-space variance; (2) DocAI cell bbox ×1000 (page 1000×1000 space) — pixel_bbox is NOT trusted: it equals bbox×1000 for some parses but is an unknown-DPI render-pixel space for others (invoice), which shifted/enlarged every box; (3) for "grid-estimate" tables (equal-width column guesses) column X is re-estimated from sqrt(cell text length) — validated against the projection-truth table — keeping the detected row Y; (4) segment coordinates last. Text extraction is isolated so it can never fail the PDF view — scanned/handwritten docs fall back to DocAI boxes.
- Citation→location matching (evidence-utils): longest quoted fragment as needle; match order exact cell → segment-contains → cell fragment → row-hint fallback (numeric tokens weighted double → single best cell); "..."-truncated quotes matched order-aware. 20 unit tests incl. pixel_bbox-disagreement and grid-estimate regressions.
- BFF proxy: binary bodies (PDF/image/octet-stream, and any .../content path) forwarded as ArrayBuffer — res.text() was corrupting PDF bytes, which broke inline rendering.
- Prompt: mandatory citation format `"<file name>: <location hint>: '<verbatim 5-40 char quote>'"` — exact characters, no paraphrase, no "..." truncation — so quotes match document text 1:1.

### [2026-08-06] Workspace switching around uploads

- Files: file-manager.tsx, dashboard.tsx.
- Uploading to a workspace other than the current one (new workspace created from the upload dialog, or an existing different one selected) now switches the app there — previously files landed in the new workspace while the UI stayed on the old one.
- Parse-poll intervals no longer capture stale kbId/loadFiles closures: they read latest values via refs and skip all state mutations on completion when the user has switched away from the parse target — previously a finishing parse could yank the file list back to the old workspace while the dropdown showed the new one. Polls are cleaned up on unmount.

### [2026-08-06] Full-document PDF stack + text-layer location

- Files: ui/evidence-pdf-viewer.tsx.
- The viewer renders every page of the PDF as a continuous scrollable stack (no single-page restriction); highlights sit on whichever page they belong to. Clicking a citation scrolls the stack to that page with the box centered — smooth via `scrollTo({ behavior: 'smooth' })`, instant under `prefers-reduced-motion`. The scroll math waits for all canvases to be drawn before computing offsets.
- The rendered PDF's text layer is now a locator as well as a refiner: citations the segment matcher missed are scanned across all pages and, if found, become clickable rows with exact glyph-level highlights. The "N citations not matched" banner and dashed list count only citations the text scan also failed on (scanned docs / text genuinely absent).
- Text matching hardened: numeric tokens also match by digit-only equivalence, single item then adjacent pairs ("185,000" + ".00" split across runs, comma/formatting differences), plus fraction-stripped and comma-stripped variants.

### [2026-08-06] Multi-pane evidence view (3-way audit panes)

- Files: ui/evidence-mindmap.tsx, ui/evidence-pdf-viewer.tsx, report-viewer.tsx.
- The Evidences dialog shows multiple file panes simultaneously: orbit nodes multi-select (click toggles a pane, empty space closes all), panes auto-arrange 2-up/3-up, the dialog widens (max-w-7xl) and the orbit compacts (smaller radius, labels on hover) when several panes are open. Cap of 3 visible panes (most-recent-first; a 4th click swaps the newest in); a note lists files hidden behind the cap. Single pane = the old viewer exactly; no panes = orbit-only dialog.
- A' pane mode: each pane renders only the pages carrying highlights, auto-centered on the active highlight; an "All pages" toggle expands to the full-document stack. Text-layer location moved to the load effect (once per file); the render effect draws only visible pages.
- Multi-stage zoom (1×/2×/3×) per pane: header +/− controls, or click the active highlight to zoom in. Pages re-render at scale (crisp) and the view re-centers on the box on both axes when the page overflows. Fixed the max-w-[420px] clamp that silently capped zoom growth.
- 3-up header compaction: Open file is icon-only (tooltip), mode toggle compact.
- Zoom centering fix: the scroll effect depends on zoom directly and retries once after a frame — a 3× canvas repaint can swallow a smooth scroll (Safari), so the highlight now always lands centered at every zoom level.

### [2026-08-06] Auth screen revamp: Three.js dot grid

- Files: ui/three-dot-grid.tsx (new), auth-form.tsx, dashboard.tsx, package.json (three, @types/three).
- The auth screen now sits on a fullscreen WebGL dot-array animation (Three.js, GLSL ES 300): dots with varying opacities, a center-out intro wave, and periodic reshuffle. Premultiplied-alpha blending keeps it correct on the light background; dpr-capped and resize-aware, disposed on unmount.
- The sign-in/sign-up card floats centered over the grid with the "ReconAI" header; fixed a regression where the card collapsed to its content width (the grid's content wrapper is now full-width + centered).
- Removed the earlier dithering-shader experiment (ditched per review).
- The dashboard's "ReconAI" wordmark is now clickable and switches to the Files tab from any tab.

### [2026-08-07] Vertical sidebar: tubelight tabs + profile popup

- Files: ui/tubelight-navbar.tsx (new), dashboard.tsx, ui/dropdown-menu.tsx, ui/separator.tsx, credit-display.tsx, workspace-manager.tsx, package.json (framer-motion).
- The Files/Report tabs moved from the top strip into a sticky left rail (vertical): framer-motion tubelight lamp slides between items, wordmark on top, icon-only rail on mobile.
- Profile button (avatar + name) sits at the rail bottom with a click target that reaches the rail edges; the account menu opens upward and holds identity, credits (plain text row — the pill badge is gone), and Sign out behind a visible hairline.
- DropdownMenu z-index moved to the Positioner (portaled menus now stack above sticky siblings); Separator got explicit h-px/w-px — the old data-horizontal:* variants matched nothing, so every divider app-wide rendered 0px tall and invisible.
- Workspaces: the most recent one auto-opens on login/reload instead of an empty selection.

### [2026-08-07] Payable derivation is engine-computed; line-items table paused

- Files: engine/reconcile.ts, lib/format-inline.ts, components/report-viewer.tsx + tests.
- The LLM no longer does payable arithmetic: the summary contract forbids stating totals/overbilling/payable, and the engine computes Billed (Σ totalInvoice) − Overbilled (Σ overbilling + unsupported charges) = Recommended payable (clamped ≥ 0) from the sanitized KPIs, stripping any derivation the model writes anyway. Summary and KPI cards can no longer disagree.
- The derivation line is engine-formatted with bold + color tokens (**[danger]** red / **[success]** green) via format-inline.ts; the redundant client-side derivation strip under the summary was removed.
- The line-items section (fixed PO/Rec/Inv columns) is commented out, pending the dynamic-columns rework for non-purchase documents (e.g. logistics).

### [2026-08-07] Evidence viewer: pane close buttons, Files-tab PDF preview, near-fullscreen Evidences dialog

- Files: components/report-viewer.tsx, components/file-manager.tsx, components/ui/evidence-pdf-viewer.tsx, components/ui/evidence-mindmap.tsx
- PDF panes now have an X close button that properly removes the pane (selection state included).
- Files tab: "View" opens the PDF viewer inline on the right — single pane, full-document, no citation UI — filling the right half and the viewport height.
- Viewer polish: role badge removed; All pages/Cited is now a switch (hidden when a file has no citations); pages render at the pane's measured width so they fill any pane (no fixed 420/520px cap).
- Evidences dialog is near full screen (100vw−2rem × 100vh−2rem); panes stretch to fill the height.
- Orbit grows to fill its container; with 3 panes it collapses to a slim severity dot-rail (option 1) to give panes width.
- Orbit rotation resumes when the last pane closes, and per-frame rotation no longer lingers a 700ms transition (glitch fix).
