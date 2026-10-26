# SprintVault — Handoff

**Branch:** `FunctionalityandUiChanges` (on `anikumap/sprintvault`). It is 2 commits ahead of `main` and targets `MathiasEthan/sprintvault:main`.
**State:** feature-complete. All tests pass. Not yet merged.
**Read with:**
- [task.md](task.md): the original test report and all 44 tasks.
- [plan.md](plan.md): the design decisions and the deviations found while fixing.
- `LOGIC.md` / `ARCHITECTURE.md`: the spec this was checked against.

---

## 1. What this branch does

1. **Fixes 44 defects** found by a functional and edge-case test pass (T-01 … T-44 in task.md). Highlights:
   - Shell-injection holes in every git call, and push paths that could write outside the repo or into `.git/`.
   - Two state-machine bugs: tasks could deadlock or be reopened.
   - Cross-project lock conflicts, and Commit Done accepting any SHA.
   - Broken ZIP upload on Windows, and import-local overwriting user files.
2. **Adds Git sync for every Scrum change (T-41).**
   - Each change writes `.scrum.json` and commits it as `SprintVault Service` (`chore(scrum): …`). If the project has a real remote, the commit is pushed to `origin`, so every clone gets board changes with `git pull`.
   - Commit Done fetches from origin first, so commits pushed from developers' own machines are accepted.
   - Browsers poll `/api/changes` every 4 s and refresh.
3. **Redesigns the UI**, keeping the black, light-black and green theme.
   - Archivo (expanded width for titles) and JetBrains Mono (code content only).
   - Board lanes divided by thin lines, with a coloured "lock rail" on each card (grey = free, amber = locked, green = done).
   - Shared UI kit in `client/src/components/ui.tsx`. All screens and modals were rewritten on top of it.

## 2. Run it

```bash
npm install && (cd client && npm install)
cp .env.example .env          # set DEMO_MODE=true for 1-click demo logins
npm start                     # API on :3001
cd client && npm run dev      # UI on :5173 (proxies /api)
npm test                      # 17 test groups, incl. a two-machine sync simulation
```

**Environment variables** (see `.env.example`):

| Variable | Default | Notes |
|---|---|---|
| `JWT_SECRET` | random | If unset, a random secret is generated once and stored in `.sprintvault-jwt-secret` next to the DB. |
| `DEMO_MODE` | `false` | `true` shows the 1-click login list and the user switcher. Seeded password: `password123`. |
| `IMPORT_ROOTS` | unset | Optional allow-list for "Import project → Folder on this server". |
| `DB_PATH`, `REPOS_PATH`, `PORT` | `./sprintvault.db`, `./repos`, `3001` | Storage locations and API port. |

**After pulling this branch:**
- **Everyone must sign in again.** Tokens signed with the old hardcoded secret are rejected.
- **Restart Vite after any change to `client/tailwind.config.js`.** The theme lives there (the `slate` and `blue` palettes are remapped), and the dev server does not reload that file while running.

## 3. Where things live

| Concern | File |
|---|---|
| All git process calls (no shell; `execFileSync`) | `server/src/services/GitHost.ts` |
| Only gateway to git (ARCH §4): fetch, push, Scrum commits, remote sync | `server/src/services/GitService.ts` |
| Use cases, state guards, Commit Done verification, Scrum-commit hook | `server/src/services/WorkflowService.ts` (`recordScrumChange`) |
| Per-project lock overlap (one DB transaction) | `server/src/services/LockManager.ts`, `models/FileLock.ts` |
| Input validation and path safety (`..`, `.git/`, normalisation) | `server/src/validation.ts` |
| HTTP error mapping (rejectStart 409, rejectPush 403, 400/404) | `server/src/routes/errors.ts` |
| Live-refresh marker | `server/src/services/ChangeFeed.ts`, `GET /api/changes` |
| UI kit and design tokens | `client/src/components/ui.tsx`, `client/tailwind.config.js`, `client/src/index.css` |

**Remote rule:**
- **When a project gets an `origin`:** its `repoUrl` becomes `origin` when it is `http(s)://`, `ssh://`, `git@…`, or a bare-repo path.
- **Local-only projects:** `git://local/…` keeps the repo on the server.
- **Imported folders:** stored as `file://<dir>`. That directory is the working copy, and any `origin` it already has is kept.

## 4. Verification done

- `npm test`: **17/17**. The 11 original groups plus regression groups for:
  - State guards, per-project locks, path safety and no-op pushes.
  - Commit Done verification and atomic project creation.
  - **Two-machine sync.** A bare `origin` and a separate clone:
    - The clone sees every Scrum change after `git pull`.
    - A commit pushed from the clone is linked by Commit Done.
- **API harness: 67/67.** Run against a fresh isolated server launched from PowerShell on Windows.
- **Browser harness: 12/12.** Run with Playwright on Edge. It covers:
  - Live refresh without a reload.
  - Pull downloading a .zip.
  - The workbench loading real file content and staging a file.
  - Status chips, demo-mode gating, and no console errors across tabs.
- **Builds:** server `tsc --noEmit` and client `tsc -b` + `vite build` are clean.
- **Harness location:** the API and browser harness scripts (`apitest.mjs`, `uitest.mjs`) lived in a session scratch folder and are **not** in the repo. See follow-up F-3.

## 5. Open items and known limitations

**Must fix before merge**
- **F-1: unrelated files are committed.** `.claude/data/healthcare/documents/data.sqlite`, `-shm` and `-wal` are local tool data. Remove them from the branch and ignore `.claude/`:
  ```bash
  git rm -r --cached .claude && echo ".claude/" >> .gitignore
  git commit -m "chore: stop tracking local .claude data" && git push
  ```

**Decisions a reviewer should confirm**
- **F-2: features the spec says not to build are kept** (S-14). ZIP upload, import, history graph, Repository view and **Commit Done** all stay; Commit Done is hardened instead of removed. Strict LOGIC.md allows only `pushWork` to complete a task. Say if the project must be spec-strict.
- **Scope checks.** Pushed files are **not** checked against the task scope, as LOGIC §7 specifies. Path *safety* is enforced.

**Follow-ups (not blocking)**
- **F-3: test harnesses.** Move the API and browser harnesses into the repo (e.g. `server/test/api.test.mjs`, `client/e2e/`) and run them in CI.
- **F-4: live refresh is coarse.** `ChangeFeed` is one in-memory counter: any change anywhere makes every client refresh. Fine for a team; switch to per-project versions or SSE if it grows.
- **F-5: logout revocation is in memory.** Revoked tokens come back after a server restart, until they expire. Tokens live 12 h.
- **F-6: Commit Done's "made after the lock" check uses the commit timestamp**, which a developer can set. It stops mistakes, not deliberate misuse.
- **F-7: failed pushes of Scrum commits are only logged.** If publishing to `origin` fails, the commit is retried on the next change and never blocks the user. Developer pushes do roll back on publish failure.
- **F-8: fonts load from Google Fonts.** Offline installs fall back to system fonts.
- **F-9: Windows is the only tested platform.** All the git code is shell-free, so it should behave the same on macOS and Linux, but nobody has run it there.
- **F-10: existing projects show one extra commit.** Their untracked `.scrum.json` is committed by the first Scrum change after upgrading.

## 6. Spec status (LOGIC.md / ARCHITECTURE.md)

- **S-1 … S-13: resolved.** Includes the state machine, lock invariant, auth on every request, and GitService as the only git gateway.
- **S-10: partial.** Validation returns 400 and missing entities return 404, without internal error text. Not every error is one of the three spec replies.
- **S-14: kept by decision** (see F-2).
- **S-18: compliant** (no scope check on push).
