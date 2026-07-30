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
- Notes: Uses jose for JWT-based session encryption. Default dev secret used; will be overridden by .env.local in Task 16.

### [2025-07-30] Task 5 Complete: DocAI proxy helper

- Files: Created src/lib/docai-proxy.ts
- Test: `bun run build` succeeded (compiled in ~2.4s).
- Notes: Generic DocAI API proxy helper with session cookie forwarding, handles JSON/FormData/raw bodies.

### [2025-07-30] Fix: Add Origin header to docaiFetch

- Files: Modified src/lib/docai-proxy.ts
- Test: `bun run build` succeeded.
- Notes: DocAI requires Origin header — returns MISSING_OR_NULL_ORIGIN without it. Added default `http://localhost:3000` with `origin` option override.

### [2025-07-30] Fix: orgId fetching — use session endpoint

- Files: Modified src/app/api/auth/signin/route.ts, signup/route.ts
- Test: `bun run build` succeeded.
- Notes: Removed `/v1/orgs/current` calls. orgId now comes from DocAI's `/v1/auth/session` (documented: returns `{orgId}`). Avoids guessing response field names from the opaque `/v1/orgs/current` schema.

### [2025-07-30] Fix: Proper session response parsing

- Files: Modified session/route.ts, auth-provider.tsx, docai skill + api-endpoints reference
- Test: `bun run build` succeeded.
- Notes: DocAI session response is `{ session: { currentOrgId, currentKnowledgeBaseId, user, ... } }` — not flat. Session route now extracts nested fields. AuthProvider calls checkSession() after signIn/signUp to populate orgId + KB info. Full response shape documented in docai skill.

### [2025-07-30] Task 11 Complete: Credit display, KB manager, file manager, model selector

- Files: Created credit-display.tsx, kb-manager.tsx, file-manager.tsx, model-selector.tsx
- Test: `bun run build` succeeded.
- Notes: KB manager with create/delete, file manager with upload/parse/delete/view + job polling, model selector fetches LM Studio models + hardcoded DeepSeek options. Fixed Button `asChild` → `onClick` (shadcn uses @base-ui/react which lacks asChild).

### [2025-07-30] Task 12 Complete: Reconciliation engine (portable, standalone)

- Files: Created src/engine/reconcile.ts, src/engine/__tests__/reconcile.test.ts
- Test: `bun run build` succeeded. `bun test` passes (2/2).
- Notes: Pure TS reconcile function with injectable LLM caller. Full type system, LLM prompt with classification/grouping/severity rules, robust JSON parser. validateReport fixed to validate per-group KPIs (plan had flat structure mismatch).

### [2025-07-30] Task 13 Complete: Reconciliation API route

- Files: Created src/app/api/reconcile/route.ts
- Test: `bun run build` succeeded, `/api/reconcile` registered as dynamic route.
- Notes: POST handler fetches segments from DocAI per file, routes LLM to LM Studio or DeepSeek, calls engine. Needs env vars for DeepSeek API key and LM Studio URL in production.

### [2025-07-30] Task 6 Complete: Auth API routes

- Files: Created src/app/api/auth/signup/route.ts, signin/route.ts, signout/route.ts, session/route.ts
- Test: `bun run build` succeeded, all 4 routes appear as dynamic API routes.
- Notes: Uses `/v1/orgs/current` to get org ID after login (verified in DocAI OpenAPI spec).

### [2025-07-30] Task 7 Complete: Catch-all DocAI proxy route

- Files: Created src/app/api/docai/[...path]/route.ts
- Test: `bun run build` succeeded, route `/api/docai/[...path]` registered as dynamic.
- Notes: Handles GET/POST/DELETE/PATCH, forwards query params, multipart, JSON, raw bodies. Session decryption per-request.

### [2025-07-30] Task 8 Complete: Root layout + session provider

- Files: Modified src/app/layout.tsx, created src/components/auth-provider.tsx
- Test: `bun run build` succeeded.
- Notes: AuthProvider wraps children with React context. Provides signIn/signUp/signOut/fetchDocAI. Checks session on mount. Loading/auth state managed in context.

### [2025-07-30] Task 9 Complete: Auth form component

- Files: Created src/components/auth-form.tsx
- Test: `bun run build` succeeded.
- Notes: Sign-in/sign-up toggle form. Uses shadcn/ui Button, Input, Card, Label. Calls useAuth().signIn/signUp. Handles loading and error states.

### [2025-07-30] Task 10 Complete: Dashboard shell + auth gate

- Files: Modified src/app/page.tsx, created src/components/dashboard.tsx
- Test: `bun run build` succeeded.
- Notes: page.tsx gates on auth state (loading→null, unauthenticated→AuthForm, authenticated→Dashboard). Dashboard is minimal shell (header + signout) — expands in Tasks 11/14. Deviation: plan's dashboard imports Task 11/14 components that don't exist yet; started minimal.
