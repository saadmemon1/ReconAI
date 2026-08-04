This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

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
