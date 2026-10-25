# SprintVault — Fix Plan

Executes every task in [task.md](task.md) (T-01 … T-44). Phases run in order; each ends with its checks passing.

**Status: ✅ complete (2026-10-26).**
- All phases are executed, and all verification steps in Phase 5 pass.
- Deviations from the plan are listed at the end.

## Design decisions
| Topic | Decision | Why |
|---|---|---|
| Git access (S-13) | **GitService is the only caller of GitHost.** Routes and WorkflowService use GitService instance methods only. | ARCH §4 |
| Shell safety (T-01, T-23) | All git calls go through one `git(args, cwd)` helper using `execFileSync` (no shell). Commit messages passed via `-F <tmpfile>`. SHAs/branches validated. | Removes the whole injection class; multi-line messages work |
| Scrum ↔ Git sync (T-41) | After every Scrum change: write `.scrum.json` → `git add .scrum.json` → commit as service account (`chore(scrum): <event>`) → `publish()` (push to `origin` if configured, with a fetch+rebase retry). Before Commit Done / push: `syncFromRemote()` (fetch + `merge --ff-only`). | One repo history carries code *and* Scrum state; every clone gets it via `git pull` |
| Remote | A project's `repoUrl` is used as `origin` when it is a real git URL (`http(s)://`, `ssh://`, `git@`, `file://`, or a local path to a bare repo). `git://local/...` means local-only (no push). | Works with GitHub/GitLab or a shared bare repo; demo projects keep working offline |
| Live UI (T-38, T-41) | Client polls a cheap `GET /api/projects/:id/version` (max activity/task change marker) every 4 s and reloads only when it changes; the navbar badge shows Live / Offline. | Every browser reflects others' changes with no websocket infrastructure |
| Imported projects (T-09) | Repo path derived from `repo_url` when it is `file://<abs path>`; otherwise `repos/project-N`. | No schema change (ARCH §6 has fixed columns) |
| Commit Done (T-05, S-4) | **Kept** (core of the local-IDE workflow) but hardened: SHA must be a commit in this repo, reachable from the default branch (after sync), committed after the lock was acquired, and not linked to another task. "Pending" mode stages scope paths only. | Removing it would break the main workflow; hardening restores the spec's integrity intent |
| Extra features (S-14) | Kept (ZIP upload, import, graph, inspector, workbench). Demo-only conveniences (1-click login, user switcher) only appear when `DEMO_MODE=true`. | They're already built and used; demo shortcuts must not ship by default |
| Auth (T-06, T-07, T-31, T-33, T-34) | `/auth/users` requires auth; public `/auth/demo-users` only when `DEMO_MODE=true`. JWT secret from env, otherwise a random secret persisted next to the DB. Tokens carry `jti`; logout revokes it. Emails matched case-insensitively. | ARCH §8.2 |
| Scope checks (S-18) | Push is **not** checked against scope (LOGIC §7). Path *safety* (no `..`, no `.git/`) is enforced. | Spec |

## Phases

### Phase 1 — Git layer (`GitHost`, `GitService`)
T-01, T-02, T-14/T-41 (scrum commit + publish + sync), T-23, T-24, T-27, T-28 (batched `cat-file`), T-29 (reads never create repos), S-13.

### Phase 2 — Workflow & domain logic
- State-machine guards: T-03, T-04.
- Locks: T-11 (per-project), T-12 (path normalisation).
- Push / Commit Done: T-05, T-13, T-40.
- Projects: T-08, T-09, T-10 (`adm-zip` + zip-slip guard), T-20, T-21 (atomic create + rollback).
- Validation & errors: T-22, T-30.
- Access & data: T-15, T-19 (activity rows carry `project_id`), T-25, T-26.
- T-41: hook a scrum commit into every mutating use case.

### Phase 3 — Auth
T-06, T-07, T-31, T-33, T-34. Adds `dotenv` loading and `.env.example`.

### Phase 4 — Client
- Downloads & editing: T-16 (pull → zip download via `jszip`), T-17 (workbench loads current file content).
- Modals & routing: T-18, T-19, T-32, T-39.
- Demo gating: T-33 (hide 1-click login and switcher unless the server reports demo mode).
- Status & polish: T-35, T-36, T-37.
- T-38/T-41: live polling + Live/Offline badge.

### Phase 5 — Verification
1. T-42: close DB in test cleanup; extend `server/test/workflow.test.ts` with regression tests (guards, per-project locks, path safety, Commit Done validation, scrum auto-commit, remote publish/sync).
2. Re-run the 66-check API harness and 6-check browser harness. Expected result: everything passes except W1/T18 (spec says no scope check; the expectation is updated).
3. **Two-machine simulation:** a bare repo as `origin`, plus a separate clone as "developer machine". Verify that each Scrum action appears there after `git pull`, and that a dev commit pushed from the clone is accepted by Commit Done.
4. `tsc --noEmit` on server and client; client `vite build`.
5. Restart the user's running app on 5173/3001.

## Deviations found while executing
- **T-43 (new):** the browser workbench used Node's `Buffer`, so staging a file crashed. Fixed with `TextEncoder`.
- **T-44 (new):** once Scrum changes became commits, the newest commit was usually a service bookkeeping commit. Commit Done now rejects service-authored commits, and the picker hides them.
- **Commit Done pending mode:** scope paths that don't exist yet are skipped, because git rejects unmatched pathspecs.
- **Import guard:** "installation directory" is anchored to the app's real location, not `process.cwd()`. Importing inside the managed `repos/` folder is also refused.
- **`/auth/demo-users`:** returns `{enabled:false}` instead of 404, so browsers don't log console errors.
- **Existing sessions:** tokens signed with the old hardcoded secret are now invalid, so everyone signs in once more.

## How to use Git sync across machines
1. Create a project whose repository URL is a real remote, e.g. `https://github.com/org/app.git`, `git@github.com:org/app.git`, or a shared bare repo path.
   - SprintVault clones it, or initialises it and pushes. The server's git credentials must be able to push there.
2. Each team member clones that remote. Every Scrum change arrives as a `chore(scrum): …` commit updating `.scrum.json`, so `git pull` brings it in.
3. Developers push their work commits to `origin`, then click **Commit Done**. SprintVault fetches and fast-forwards, verifies the commit, and completes the task.
4. Open browsers refresh within about 4 s. The navbar badge shows **Live**.
