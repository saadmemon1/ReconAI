# Petty-cash report inside the Report tab — design

Date: 2026-10-23. Branch: `feat/abujhd-second-pass`. App change only; the Python scripts and their outputs are untouched.

## Problem

The petty-cash scripts (`scripts/abujhd/`) write `report.html` plus `pages/` and `crops/` images into a git-ignored
`data/<client>/` folder. Today that report is viewed through a separate static web server. The demo should open it
from inside ReconAI, in the Report tab of the workspace the files were uploaded to, without changing a number in it.

The app's own Reconcile button (generic LLM flow) and its report stay as they are. Writing the scripts' findings into
the app's report schema remains a later integration.

## Mapping a workspace to a folder

`data/<client>/config.json` gains one optional field, `"kb_id": "<DocAI knowledge-base id>"`. The scripts ignore it.
Exactly one folder should carry a given `kb_id`; the route takes the first match in directory order and that is the
operator's responsibility (two folders for one workspace, e.g. a snapshot and a fresh run, means moving the field).

## Route

`src/app/api/petty-cash/[kbId]/[...path]/route.ts`, `GET` only.

1. Session gate: `resolveApiKey(cookie)` exactly as `api/docai/[...path]/route.ts`; no key → 401.
2. Folder lookup: read every `data/*/config.json` (sync, tiny, per request — no cache, so a regenerated report or an
   edited config shows up immediately); the folder whose `kb_id` equals `kbId` wins; none → 404.
3. Path allowlist, every segment plain-safe (`[A-Za-z0-9_.-]`, no `..`): `report.html`, `pages/<name>.png`,
   `crops/<name>.png`. Anything else → 404. The file must exist → else 404.
4. Response: the file bytes with `Content-Type` `text/html; charset=utf-8` or `image/png`, `Cache-Control: no-store`.
   `HEAD` is answered by the same handler (Next implements it from `GET`) so the client can probe cheaply.

With the `DOCAI_API_KEY` env fallback set the route runs on the server's key, which means no per-user authentication: local, single-tenant use only.

Pure helpers in `src/lib/petty-cash.ts`: `findFolderForKb(dataDir, kbId) -> string | null` and
`isAllowedReportPath(segments) -> boolean`. These are what the tests cover.

## Report tab

`ReconcileRunner` (already keyed by `kbId`) probes `HEAD /api/petty-cash/<kbId>/report.html` once on mount.
On 200 it renders a "Petty-cash report" pill in the pane header. Clicking it replaces the pane body with
`<iframe src="/api/petty-cash/<kbId>/report.html">` filling the pane height, plus a "Back to reconciliation" pill.
The iframe is same-origin, so the report's own overlay and Escape handling work unchanged. The probe failing
(401/404/network) means the pill is simply absent; nothing else in the tab changes.

## Testing

- `src/lib/__tests__/petty-cash.test.ts` (bun:test): `findFolderForKb` finds the matching folder, ignores folders
  without `kb_id` or with a different one, and tolerates a missing `data/` dir; `isAllowedReportPath` accepts the
  three shapes and rejects traversal, nested paths, other extensions and non-plain segments.
- Manual: `curl -I` the route without a cookie (401), with the env-key fallback (200 for `report.html`, 404 for a
  bad path), and a click-through of the pill in the browser.
- The workbook gate is not re-run: nothing under `scripts/` or `data/` changes except the one config field.

## Out of scope

Findings in the app's table or KPI cards; running the scripts from the UI; a month/folder picker; caching.
