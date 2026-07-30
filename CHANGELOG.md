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

### [2025-07-30] Task 6 Complete: Auth API routes

- Files: Created src/app/api/auth/signup/route.ts, signin/route.ts, signout/route.ts, session/route.ts
- Test: `bun run build` succeeded, all 4 routes appear as dynamic API routes.
- Notes: Uses `/v1/orgs/current` to get org ID after login. Not in docai skill endpoint list — may need adjustment during integration testing with live DocAI.
