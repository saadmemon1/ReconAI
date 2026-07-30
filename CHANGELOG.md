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
