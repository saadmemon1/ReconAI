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
