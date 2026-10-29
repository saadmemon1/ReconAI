# DocAI Design System Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make ReconAI look like a DocAI product: DocAI's purple tokens, DM Sans + Geist Mono, DocAI button shapes, a DocAI-style sidebar with the Providus logo, light default with a `.dark` theme, and the embedded petty-cash report restyled to match.

**Architecture:** Tokens are copied verbatim into `src/app/globals.css`; `next-themes` drives a `.dark` class; `layout.tsx` loads the fonts; the button component keeps its base-ui primitive and takes DocAI's variant classes; `dashboard.tsx`'s `<aside>` is rebuilt as a DocAI-shaped sidebar; `c_report.py`'s CSS string gets the same palette. No DocAI code is imported at build time. Spec: `docs/superpowers/specs/2026-10-23-docai-design-system-design.md`.

**Tech Stack:** Next.js 16 App Router, Tailwind v4 (`@theme inline`), `next-themes` 0.4 (installed), `next/font/google`, lucide-react, bun:test. Source material: `/Users/mujtabakamal/Projects/DocAI/apps/docai-web/app/globals.css` lines 12–125, `components/ui/button.tsx`, `components/ui/sidebar.tsx` line 468, `public/images/logo-color.png`, `logo-white.png`.

## Global Constraints

- Branch `feat/abujhd-second-pass`. Do not touch `scripts/` except `scripts/abujhd/c_report.py` (Task 4) and never any file under `data/` except regenerating `report.html` via `c_report.py`.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/` before editing `layout.tsx` (this Next is 16.x; `next/font/google` usage is unchanged, but check the docs for anything deprecated).
- Light mode is the default (`defaultTheme="light"`, `enableSystem` on). Dark mode is the `.dark` class only; delete the `prefers-color-scheme` media query from `globals.css`.
- Values are copied, never imported from the DocAI repo; the build must not reference `/Users/mujtabakamal/Projects/DocAI`.
- Keep ReconAI's type-scale utilities (`text-display`, `text-h1..h3`, `text-body`, `text-small`) and the animation keyframes; only their font changes.
- The findings status colours stay: ok `#0A7F3F`, bad `#B42318`, warn `#A15C00`; review becomes `#554bc5`.
- After each task: `bun test` (254 pass), `bunx tsc --noEmit 2>&1 | grep -v __tests__` empty, `bunx eslint <touched files>` clean. Commit with trailer `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The dev server runs on 3001 (`bun dev -p 3001`); the DocAI login page on http://localhost:3000 is the visual reference.

---

## File structure

| File | Responsibility |
|---|---|
| `src/app/globals.css` | Tokens (light/dark), `@theme inline` mapping, type scale, animations. |
| `src/app/layout.tsx` | Fonts (DM Sans, Geist Mono), `ThemeProvider`. |
| `src/components/theme-provider.tsx` | Client wrapper around `next-themes`. |
| `src/components/ui/button.tsx` | DocAI variant classes on the base-ui primitive. |
| `src/components/dashboard.tsx` | The sidebar shell (logo, nav, footer with theme toggle). |
| `src/components/auth-form.tsx` | Logo above the key prompt. |
| `src/components/ui/tubelight-navbar.tsx` | Deleted. |
| `public/images/logo-color.png`, `logo-white.png` | Copied from DocAI. |
| `scripts/abujhd/c_report.py` | `FONTS` and `CSS` strings re-palette. |

---

### Task 1: Tokens, fonts and theme provider

**Files:**
- Modify: `src/app/globals.css` (whole file: replace lines 1–71, keep everything from `/* Base */` down with the edits below)
- Modify: `src/app/layout.tsx`
- Create: `src/components/theme-provider.tsx`

**Interfaces:**
- Produces: CSS custom properties named exactly as DocAI (`--primary`, `--sidebar`, `--palette-purple-medium`, …) and Tailwind colours `bg-primary`, `bg-sidebar`, `text-sidebar-foreground`, `from-primary`, `to-palette-purple-medium`, `bg-sidebar-accent`; utilities `font-sans`, `font-mono`, `font-display` (alias of sans).
- Produces: `<ThemeProvider>` from `@/components/theme-provider`, `useTheme` from `next-themes` usable in client components.

- [ ] **Step 1: Replace the token head of `globals.css`**

Replace everything from the top of the file through the closing `}` of `@theme inline {` with:

```css
@import "tailwindcss";
@custom-variant dark (&:is(.dark, .dark *));

/* DocAI design tokens, copied from docai-web/app/globals.css (2026-10-23). Light is the default. */
:root {
  --card: oklch(1 0 0);
  --card-foreground: oklch(0.141 0.005 285.823);
  --popover: oklch(1 0 0);
  --popover-foreground: oklch(0.141 0.005 285.823);
  --primary: #554bc5;
  --primary-foreground: #ffffff;
  --secondary: #7368e6;
  --secondary-foreground: #ffffff;
  --muted: oklch(0.967 0.001 286.375);
  --muted-foreground: oklch(0.552 0.016 285.938);
  --accent: #4239a9;
  --accent-foreground: #ffffff;
  --destructive: oklch(0.577 0.245 27.325);
  --destructive-foreground: #f5f5f5;
  --border: oklch(0.92 0.004 286.32);
  --input: oklch(0.92 0.004 286.32);
  --ring: #554bc5;
  --chart-1: oklch(0.785 0.115 274.713);
  --chart-2: oklch(0.585 0.233 277.117);
  --chart-3: oklch(0.511 0.262 276.966);
  --chart-4: oklch(0.457 0.24 277.023);
  --chart-5: oklch(0.398 0.195 277.366);
  --sidebar: #f5f5f5;
  --sidebar-foreground: oklch(0.141 0.005 285.823);
  --sidebar-primary: oklch(0.541 0.281 293.009);
  --sidebar-primary-foreground: oklch(0.969 0.016 293.756);
  --sidebar-accent: oklch(0.967 0.001 286.375);
  --sidebar-accent-foreground: oklch(0.21 0.006 285.885);
  --sidebar-border: oklch(0.92 0.004 286.32);
  --sidebar-ring: oklch(0.705 0.015 286.067);
  --radius: 0.625rem;
  --background: #f5f5f5;
  --foreground: oklch(0.141 0.005 285.823);
  --palette-purple-medium: #7368e6;
  --palette-purple-deep: #4239a9;
  /* ReconAI findings status set (meaning-bearing; unchanged except review) */
  --status-ok: #0A7F3F;
  --status-bad: #B42318;
  --status-review: #554bc5;
  --status-warn: #A15C00;
}

.dark {
  --background: hsl(247 18% 10%);
  --foreground: hsl(0 0% 96%);
  --card: oklch(0.21 0.006 285.885);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.21 0.006 285.885);
  --popover-foreground: oklch(0.985 0 0);
  --primary: #7368e6;
  --primary-foreground: #ffffff;
  --secondary: #4239a9;
  --secondary-foreground: #ffffff;
  --muted: oklch(0.274 0.006 286.033);
  --muted-foreground: oklch(0.705 0.015 286.067);
  --accent: #7368e6;
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --destructive-foreground: #f5f5f5;
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: #7368e6;
  --sidebar: oklch(0.21 0.006 285.885);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.606 0.25 292.717);
  --sidebar-primary-foreground: oklch(0.969 0.016 293.756);
  --sidebar-accent: oklch(0.274 0.006 286.033);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.552 0.016 285.938);
  --palette-purple-medium: #7368e6;
  --palette-purple-deep: #4239a9;
  --status-ok: #3DAA6A;
  --status-bad: #E06A5F;
  --status-review: #9a92ef;
  --status-warn: #D39A3C;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-destructive-foreground: var(--destructive-foreground);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
  --color-palette-purple-medium: var(--palette-purple-medium);
  --color-palette-purple-deep: var(--palette-purple-deep);
  --color-success: var(--status-ok);
  --color-warning: var(--status-warn);

  --radius-lg: var(--radius);
  --radius-md: calc(var(--radius) - 2px);
  --radius-sm: calc(var(--radius) - 4px);

  --font-sans: var(--font-sans), "DM Sans", ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
  --font-display: var(--font-sans), "DM Sans", ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-geist-mono), "Geist Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas;

  /* Type scale (DocAI uses DM Sans 500/600 for headings) */
  --text-display: 30px;
  --text-display--line-height: 38px;
  --text-display--font-weight: 600;
  --text-h1: 24px;
  --text-h1--line-height: 32px;
  --text-h1--font-weight: 600;
  --text-h2: 20px;
  --text-h2--line-height: 28px;
  --text-h2--font-weight: 600;
  --text-h3: 16px;
  --text-h3--line-height: 24px;
  --text-h3--font-weight: 600;
  --text-body: 14px;
  --text-body--line-height: 22px;
  --text-small: 12px;
  --text-small--line-height: 18px;

  --animate-duration: 150ms;
  --animate-easing: ease-out;
}
```

Then in the kept tail of the file: change the `.text-display, .text-h1, .text-h2, .font-display` rule to `letter-spacing: -0.01em;` only (drop the `font-family` line), and change `.bg-card { box-shadow: 0 1px 2px rgba(2, 9, 31, 0.06); }` to `box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);`.

- [ ] **Step 2: Theme provider**

```tsx
// src/components/theme-provider.tsx
'use client';
import { ThemeProvider as NextThemesProvider } from 'next-themes';
import type { ComponentProps } from 'react';

export function ThemeProvider(props: ComponentProps<typeof NextThemesProvider>) {
  return <NextThemesProvider {...props} />;
}
```

- [ ] **Step 3: Fonts and provider in `layout.tsx`**

```tsx
import type { Metadata } from 'next';
import { DM_Sans, Geist_Mono } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/auth-provider';
import { ThemeProvider } from '@/components/theme-provider';

const sans = DM_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const mono = Geist_Mono({ subsets: ['latin'], display: 'swap', variable: '--font-geist-mono' });

export const metadata: Metadata = {
  title: 'ReconAI · Document reconciliation',
  description: 'Match purchase orders, receipts and invoices, with every finding tied to the line it came from.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`} suppressHydrationWarning>
      <body>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: Verify**

Run: `bun test` → `254 pass`. Run: `bunx tsc --noEmit 2>&1 | grep -v __tests__` → empty. Run: `bunx eslint src/app/layout.tsx src/components/theme-provider.tsx` → clean. Open http://localhost:3001: the page background is `#f5f5f5`, text is DM Sans, the primary button is purple. (Shapes are still pills until Task 2; that is expected.)

- [ ] **Step 5: Commit**

```bash
git add src/app/globals.css src/app/layout.tsx src/components/theme-provider.tsx package.json bun.lock
git commit -m "Adopt DocAI's design tokens, DM Sans and a class-based dark theme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: DocAI button variants and the pill sweep

**Files:**
- Modify: `src/components/ui/button.tsx`
- Modify: `src/components/dashboard.tsx`, `src/components/file-manager.tsx`, `src/components/reconcile-runner.tsx`, `src/components/report-viewer.tsx` (only `rounded-full` → `rounded-md` on buttons, chips, inputs, pills; leave `rounded-full` on avatars, status dots, spinners, mindmap nodes and `evidence-pdf-viewer.tsx`, `evidence-mindmap.tsx`, `progressive-flux-loader.tsx`, `avatar.tsx` untouched)

**Interfaces:**
- Produces: `buttonVariants` with variants `default | primary | outline | secondary | ghost | destructive | link` and sizes `default | sm | lg | icon`, same prop names as today so no call site changes type.

- [ ] **Step 1: Replace the `cva` in `button.tsx`**

Keep the file's imports, the `Button` function and its export. Replace the `buttonVariants` definition with:

```ts
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-md border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none cursor-pointer focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-linear-to-b from-primary to-palette-purple-medium text-white hover:brightness-110 active:translate-y-[2px]",
        primary: "bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80",
        outline:
          "border-border bg-transparent hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary: "bg-secondary text-white hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost: "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 gap-1.5 px-4 has-[>svg]:px-3",
        sm: "h-8 gap-1 rounded-sm px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-10 gap-2 px-6 has-[>svg]:px-4",
        icon: "size-9",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
)
```

If the existing file has extra variants or sizes that call sites use (check with `grep -rn 'variant="' src/components | grep -oE 'variant="[a-z-]+"' | sort -u` and the same for `size=`), keep each one as an alias of the nearest DocAI variant so no call site breaks.

- [ ] **Step 2: Pill sweep**

In the four component files listed, change `rounded-full` to `rounded-md` on: the petty-cash pill in `reconcile-runner.tsx` (both occurrences), the status chips and search input in `file-manager.tsx`, the severity chips in `report-viewer.tsx`, and the account trigger ring in `dashboard.tsx` only if it is a button (the avatar circle stays `rounded-full`). Also in `report-viewer.tsx` replace the two hard-coded `*-neutral-*`/`*-zinc-*` colour classes with `bg-muted` / `text-muted-foreground`.

- [ ] **Step 3: Verify and commit**

Run: `bun test` → `254 pass`; `bunx tsc --noEmit 2>&1 | grep -v __tests__` → empty; `bunx eslint src/components/ui/button.tsx src/components/dashboard.tsx src/components/file-manager.tsx src/components/reconcile-runner.tsx src/components/report-viewer.tsx` → clean. In the browser the Upload File button is a purple gradient with rounded corners.

```bash
git add src/components/ui/button.tsx src/components/dashboard.tsx src/components/file-manager.tsx src/components/reconcile-runner.tsx src/components/report-viewer.tsx
git commit -m "Use DocAI's button variants and corner radius

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: DocAI-style sidebar, logo and theme toggle

**Files:**
- Create: `public/images/logo-color.png`, `public/images/logo-white.png` (copy with `cp` from `/Users/mujtabakamal/Projects/DocAI/apps/docai-web/public/images/`)
- Create: `src/components/brand-logo.tsx`
- Modify: `src/components/dashboard.tsx` (the `<aside>…</aside>` block and its imports)
- Modify: `src/components/auth-form.tsx` (logo above the form)
- Delete: `src/components/ui/tubelight-navbar.tsx`

**Interfaces:**
- Consumes: `useTheme` from `next-themes` (Task 1), `Button` variants (Task 2).
- Produces: `<BrandLogo width height className />` that renders `logo-color.png` in light and `logo-white.png` in dark.

- [ ] **Step 1: Logo component**

```tsx
// src/components/brand-logo.tsx
'use client';
import Image from 'next/image';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function BrandLogo({ width = 100, height = 32, className }: { width?: number; height?: number; className?: string }) {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const src = mounted && resolvedTheme === 'dark' ? '/images/logo-white.png' : '/images/logo-color.png';
  return <Image src={src} alt="Providus" width={width} height={height} className={className} priority />;
}
```

- [ ] **Step 2: Rebuild the `<aside>` in `dashboard.tsx`**

Remove the `NavBar` import and the `tubelight-navbar` usage. Replace the whole `<aside>…</aside>` with (keep the existing `tab`, `setTab`, `setReconcileRequest`, user/credit/sign-out state and the dialog as they are):

```tsx
<aside className="sticky top-0 z-30 flex h-screen w-16 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground md:w-60">
  <div className="flex flex-col gap-1 px-3 pt-6 pb-2 md:px-4">
    <BrandLogo className="hidden md:block" />
    <BrandLogo width={32} height={32} className="md:hidden" />
    <span className="hidden text-[11px] font-medium uppercase tracking-wide text-muted-foreground md:inline">ReconAI</span>
  </div>
  <nav className="flex flex-col gap-1 px-2 pt-4 md:px-3" aria-label="Sections">
    {([
      { key: 'files', label: 'Files', Icon: FileText },
      { key: 'report', label: 'Report', Icon: FileBarChart },
    ] as const).map(({ key, label, Icon }) => (
      <button
        key={key}
        type="button"
        aria-current={tab === key ? 'page' : undefined}
        onClick={() => { if (key === 'report') setReconcileRequest(null); setTab(key); }}
        className={cn(
          'flex h-9 w-full items-center gap-2 rounded-md px-2 text-left text-sm font-medium transition-colors',
          tab === key ? 'bg-primary text-primary-foreground' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span className="hidden md:inline">{label}</span>
      </button>
    ))}
  </nav>
  <div className="mt-auto px-2 pb-4 md:px-3">
    {/* existing account DropdownMenu goes here unchanged, with one added item: */}
  </div>
</aside>
```

Inside the existing account `DropdownMenuContent`, add above the sign-out item:

```tsx
<DropdownMenuItem onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
  {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
  {resolvedTheme === 'dark' ? 'Light theme' : 'Dark theme'}
</DropdownMenuItem>
```

with `const { resolvedTheme, setTheme } = useTheme();` at the top of the component, `import { useTheme } from 'next-themes';`, `import { BrandLogo } from './brand-logo';`, `import { cn } from '@/lib/utils';`, and `Sun, Moon` added to the lucide import. The main content wrapper keeps `bg-background`; the content column gets `px-6 py-6`.

- [ ] **Step 3: Auth form**

In `auth-form.tsx`, render `<BrandLogo className="mx-auto mb-6" />` above the card title. No other change.

- [ ] **Step 4: Delete the old nav and verify**

```bash
git rm src/components/ui/tubelight-navbar.tsx
grep -rn "tubelight" src || echo "no references"
bun test && bunx tsc --noEmit 2>&1 | grep -v __tests__
bunx eslint src/components/dashboard.tsx src/components/brand-logo.tsx src/components/auth-form.tsx
```

Expected: `254 pass`, empty typecheck output, clean lint. In the browser: light sidebar with the Providus logo, "RECONAI" under it, Files/Report as rounded menu buttons with the active one in purple, the account block at the bottom with a theme toggle that flips the page to dark and the logo to white.

- [ ] **Step 5: Commit**

```bash
git add public/images/logo-color.png public/images/logo-white.png src/components/brand-logo.tsx src/components/dashboard.tsx src/components/auth-form.tsx
git commit -m "Rebuild the shell as a DocAI-style sidebar with the Providus logo and a theme toggle

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: Report palette

**Files:**
- Modify: `scripts/abujhd/c_report.py` (the `FONTS` string and the `CSS` string only; the `HEX` map's `var(--rev)` entry)

- [ ] **Step 1: Fonts**

Replace `FONTS` with:

```python
FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet">'
```

- [ ] **Step 2: CSS tokens**

In `CSS`, replace the two `:root{...}` token lines with:

```css
:root{--page:#F5F5F5;--card:#FFFFFF;--ink:#151515;--mute:#71717A;--line:#E4E4E7;--blue:#554BC5;--blue-h:#4239A9;--navy:#4239A9;--deep:#554BC5;
 --ok:#0A7F3F;--bad:#B42318;--rev:#554BC5;--warn:#A15C00;--neutral:#71717A;--tint:12%;--shadow:0 1px 2px rgba(0,0,0,.04)}
@media(prefers-color-scheme:dark){:root{--page:hsl(247 18% 10%);--card:oklch(0.21 0.006 285.885);--ink:#F2F2F2;--mute:#A1A1AA;--line:rgba(255,255,255,.1);--blue:#7368E6;--blue-h:#9A92EF;--ok:#3DAA6A;--bad:#E06A5F;--rev:#9A92EF;--warn:#D39A3C;--neutral:#A1A1AA;--tint:18%;--shadow:none}}
```

Then: every `Archivo` in `CSS` becomes `"DM Sans"`, every `Geist,` becomes `"DM Sans",`, `.hero{background:var(--deep);` becomes `.hero{background:linear-gradient(180deg,#554BC5,#4239A9);`, `.hero h1{font:400` becomes `.hero h1{font:600`, `h2{font:400` becomes `h2{font:600`, `.tile .v{font:400` becomes `.tile .v{font:600`, `border-radius:12px` becomes `border-radius:10px`, and `.chip{...border-radius:999px` becomes `border-radius:6px`. In `HEX`, `"var(--rev)": "#2F6DB2"` becomes `"var(--rev)": "#554BC5"`.

- [ ] **Step 3: Regenerate, gate, verify, commit**

```bash
.venv/bin/python scripts/abujhd/test_match.py | tail -1 && .venv/bin/python scripts/abujhd/test_refine.py | tail -1
.venv/bin/python scripts/abujhd/c_report.py --data data/abujhd
.venv/bin/python scripts/abujhd/check_vs_workbook.py --data data/abujhd --workbook /Users/mujtabakamal/Downloads/September_2026_Petty_Cash_Reconciliation.xlsx --min-agree 82 --max-wrong 5 | tail -1
```

Expected: both test files end with an `ok` line, `wrote .../report.html`, `GATE OK (agree 82 >= 82, wrong 5 <= 5, review 17)`. Open the Report tab → "Petty-cash report": the band is a purple gradient, headings DM Sans, chips purple for review.

```bash
git add scripts/abujhd/c_report.py
git commit -m "Re-palette the petty-cash report to the DocAI system

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Visual verification in both themes

**Files:** none (verification only; screenshots to the scratchpad).

- [ ] **Step 1: Light pass.** On http://localhost:3001: sign-in page (if the env key is on, the prompt is skipped; temporarily open an incognito-equivalent by clearing the cookie is not needed), Files tab, Report tab empty state, the embedded petty-cash report. Screenshot each.
- [ ] **Step 2: Dark pass.** Toggle via the account menu; repeat the four screenshots. The logo is white, the sidebar `oklch(0.21 …)`, the primary `#7368e6`.
- [ ] **Step 3: Reference.** Screenshot http://localhost:3000/login. Compare: same purple, same DM Sans, same corner radius, same logo.
- [ ] **Step 4: Report** anything that looks off as a list for the human, with the file and class to change. No commit.

---

## Self-review against the spec

- Tokens/theme/fonts/provider → Task 1. Buttons/pill sweep/hard-coded colours → Task 2. Shell/logo/toggle/auth/tubelight deletion → Task 3. Report palette and gate → Task 4. Browser pass both themes with DocAI reference → Task 5. Out-of-scope items untouched.
