# ReconAI on the DocAI design system — design

Date: 2026-10-23. Branch: `feat/abujhd-second-pass`. Supersedes the providus.io theming of
`docs/superpowers/specs/2026-10-23-providus-branding-design.md` for the app shell; the report's structure and
analytics from that spec stay.

## Goal

Anyone who has seen DocAI (`/Users/mujtabakamal/Projects/DocAI/apps/docai-web`) should recognise ReconAI as the
same product family at a glance: same purple system, same type, same button shapes, same sidebar, same logo.
ReconAI keeps its own components (shadcn `base-nova` on `@base-ui/react`); only their styling changes.

## Source of truth

DocAI's `app/globals.css` (tokens), `lib/client-configs.ts` (Providus brand: primary `245 51% 53%` = `#554bc5`,
secondary `245 72% 65%` = `#7368e6`, dark primary `#7368e6`, dark secondary `#4239a9`), `components/ui/button.tsx`
(variants), `components/app-sidebar.tsx` (shell), `public/images/logo-color.png` and `logo-white.png`.
Values are copied, never imported: ReconAI must build without the DocAI repo present.

## 1. Tokens and theme

`src/app/globals.css` replaces its `:root` and dark blocks with DocAI's, verbatim where names match:

- light: `--background #f5f5f5`, `--card #fff`, `--foreground oklch(0.141 0.005 285.823)`, `--primary #554bc5`,
  `--primary-foreground #fff`, `--secondary #7368e6`, `--accent #4239a9`, `--muted oklch(0.967 0.001 286.375)`,
  `--muted-foreground oklch(0.552 0.016 285.938)`, `--border oklch(0.92 0.004 286.32)`, `--input` same, `--ring #554bc5`,
  `--destructive oklch(0.577 0.245 27.325)`, `--chart-1..5` DocAI's purple ramp, sidebar tokens (`--sidebar #f5f5f5`,
  `--sidebar-primary oklch(0.541 0.281 293.009)`, accent/border/ring as DocAI), `--palette-purple-medium #7368e6`,
  `--palette-purple-deep #4239a9`, `--radius 0.625rem`.
- dark (`.dark` class): `--background hsl(247 18% 10%)`, `--foreground hsl(0 0% 96%)`, `--card oklch(0.21 0.006 285.885)`,
  `--primary #7368e6`, `--secondary #4239a9`, `--accent #7368e6`, `--muted oklch(0.274 0.006 286.033)`,
  `--muted-foreground oklch(0.705 0.015 286.067)`, `--border oklch(1 0 0 / 10%)`, `--input oklch(1 0 0 / 15%)`,
  `--ring #7368e6`, `--sidebar-background hsl(240 5.9% 10%)`, `--sidebar-primary oklch(0.606 0.25 292.717)`.
- `@custom-variant dark (&:is(.dark, .dark *));` replaces the `prefers-color-scheme` media query. `@theme inline`
  maps `--color-*`, `--radius-sm/md/lg` (`calc(var(--radius) - 4px / - 2px)` and `var(--radius)`), `--font-sans`,
  `--font-mono`.
- ReconAI-only tokens kept: the status set for findings (`--status-ok #0A7F3F`, `--status-bad #B42318`,
  `--status-review` now `#554bc5`, `--status-warn #A15C00`) and any `--text-*`/`--font-display` references are
  removed or pointed at `--font-sans`.
- Theme switching: `next-themes` `ThemeProvider` (`attribute="class"`, `defaultTheme="light"`,
  `enableSystem`) in `layout.tsx`; a light/dark toggle in the sidebar footer menu.

## 2. Fonts and controls

- `layout.tsx` loads `DM_Sans` (400/500/600/700, `--font-sans`) and `Geist_Mono` (`--font-geist-mono`) from
  `next/font/google`; Archivo and Geist are dropped. The `font-display` utility maps to `--font-sans`.
- `src/components/ui/button.tsx` keeps the base-ui primitive and takes DocAI's variant classes: base
  `rounded-md`, `default` = `bg-linear-to-b from-primary to-palette-purple-medium text-white hover:brightness-110
  active:translate-y-[2px]`, `primary`, `outline`, `secondary`, `ghost`, `destructive`, `link` as in DocAI's file;
  sizes `default h-9 px-4`, `sm h-8 px-3`, `lg h-10 px-6`, `icon size-9`. Every pill class (`rounded-full`) on
  buttons, badges, inputs and chips in `src/components/` becomes `rounded-md`, except avatars and status dots.
- Inputs, selects, dialogs, dropdowns, tables: radius and ring follow the tokens automatically; any hard-coded
  colour class (`bg-neutral-*`, `text-zinc-*`, `#0A7F3F`-style literals in TSX) is replaced by a token class.

## 3. Shell

`src/components/dashboard.tsx` keeps its state and handlers; the `<aside>` is rebuilt to DocAI's sidebar shape:

- header: `public/images/logo-color.png` (light) / `logo-white.png` (dark) at 100×32 via `next/image`, with
  "ReconAI" in 11px uppercase tracking-wide muted text under it;
- content: a `SidebarMenu`-style list, one button per tab (Files, Report) with the lucide icon, `rounded-md`,
  active state `bg-sidebar-accent text-sidebar-accent-foreground`, hover `bg-sidebar-accent/60`;
- footer: the existing avatar dropdown (name, credits, theme toggle, API key, sign out);
- surfaces: sidebar `bg-sidebar border-r border-sidebar-border` at 240px (56px collapsed on small screens),
  content area `bg-background` with page padding 24px; the workspace row stays at the top of the content area.
- The `tubelight-navbar` component is no longer used by the shell and is deleted together with any CSS only it
  used. The auth form gets the same tokens and the logo above the key field.

## 4. Report

`scripts/abujhd/c_report.py` `CSS` string and `FONTS` link: page `#f5f5f5`, card `#fff`, ink `#151515`, muted
`#8C8C8C`→`#71717a` (zinc-500), border `#e4e4e7`, blue→purple `#554bc5` (hover `#4239a9`), navy/deep header band
→ a `linear-gradient(180deg,#554bc5,#4239a9)` band with the same faint grid, radius 10px, chips `rounded 6px`,
fonts `DM Sans` + `Geist Mono` from Google Fonts, the `.lock` lockup text "powered by providus" unchanged. Status
colours unchanged except review `#2F6DB2`→`#554bc5`. Dark block: DocAI's dark surfaces (`hsl(247 18% 10%)` page,
`oklch(0.21 0.006 285.885)` card, border `rgba(255,255,255,.1)`). No change to any computed value or table structure.

## 5. Assets

`public/images/logo-color.png` and `public/images/logo-white.png` copied from DocAI. No other DocAI file is used.

## 6. Copy

Unchanged from the branding spec's humanizer rules; the sidebar label "by providus" moves into the logo lockup.

## Testing

- `bun test` (254 + any new), `bunx tsc --noEmit` clean outside tests, ESLint clean on every touched file.
- Browser pass on 3001: sign-in page, Files tab, Report tab empty state, the embedded petty-cash report, each in
  light and dark; a screenshot of each next to DocAI's login page on 3000 for the eye test.
- `check_vs_workbook.py` unchanged result for the chosen data folder (the report CSS edit cannot change it, but run it).

## Out of scope

DocAI's component library or remix icons, toasts, a settings page, any Files/Report internals, README screenshots.
