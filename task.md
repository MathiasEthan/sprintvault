# SprintVault — Test Report & Fix Tasks

Tested 2026-10-25 against an **isolated instance** (own DB + repos, server launched from PowerShell on Windows 11, Node 24).
- **API suite:** 66 functional + edge-case checks → 20 pass, 46 fail.
- **Browser suite:** 6 checks in Edge via Playwright → 1 pass, 5 fail.
- **Spec audit:** every rule in `LOGIC.md` / `ARCHITECTURE.md` checked against code + test results.

Test IDs (A*, P*, T*, W*, C*, G*, S*, U*) refer to the harness checks listed in each item.
## Status — all tasks done (2026-10-26)
Executed per [plan.md](plan.md). Verification:
- `npm test`: **17/17** (11 original + 6 new regression groups, incl. a two-machine sync through a bare `origin`).
- API harness: **67/67**.
- Browser harness: **12/12**.
- Server and client typecheck clean; `vite build` OK.

Spec table (§1) after fixes:
- **S-1 … S-13: resolved.**
- **S-10 partially:** invalid input now returns 400 and missing entities 404, with no internal error text.
- **S-14: kept by decision.** Extra features stay; demo shortcuts are gated behind `DEMO_MODE`.
- **S-18 unchanged** (spec-compliant).

Severity: **P0** = security / data loss / spec invariant broken · **P1** = feature broken · **P2** = wrong behaviour, workaround exists · **P3** = polish.

---

## 1. Spec discrepancies (LOGIC.md / ARCHITECTURE.md)

| # | Spec rule | Status | Evidence |
|---|---|---|---|
| S-1 | LOGIC §2: `assignTask` only from **CREATED / ASSIGNED** | ❌ Violated | T11, T20 — IN_PROGRESS and COMPLETED tasks can be reassigned |
| S-2 | LOGIC §3 invariant: IN_PROGRESS ⇔ exactly one ACTIVE lock | ❌ Violated | T11 — task goes ASSIGNED while its lock stays ACTIVE |
| S-3 | LOGIC §2: "Rejected requests change nothing" | ❌ Violated | P3, P12 — failed project create/upload leaves an orphan project row |
| S-4 | LOGIC §2/§4.3: only `pushWork` moves IN_PROGRESS → COMPLETED, via `GitService.commitAndPush` | ❌ Violated | Extra **Commit Done** flow (`POST /tasks/:id/commit-done`) completes tasks without a service-account push and links any SHA (C1–C6) |
| S-5 | LOGIC §4.3 step 16–17: sha comes from the commit just made | ❌ Violated | W4 — push with no changes returns existing HEAD and completes the task |
| S-6 | LOGIC §1 Overlap / §2 startWork guard | ⚠️ Over-strict + under-strict | T13/T17 — locks clash **across projects**; T15/T16 — `./x` and `x\y` paths bypass overlap |
| S-7 | LOGIC §4.2: Pull = **download** (`sendSnapshot`) | ❌ Not delivered in UI | U4 — snapshot is fetched then discarded; user only sees a banner |
| S-8 | LOGIC §4.6: Developer sees own stats | ❌ Broken in UI | U1 — developer dashboard shows blank counters (camelCase vs snake_case) |
| S-9 | LOGIC §5: PUSH ⇒ tasksCompleted +1 | ⚠️ Drifts | S2 — reopening a COMPLETED task (S-1) leaves counters inflated |
| S-10 | LOGIC §6: only `rejectStart` / `rejectPush` / `access denied` errors | ⚠️ Many extra | Raw 400/500s with internal messages (A4 `Unknown named parameter 'a'`, W11 Node error text) |
| S-11 | ARCH §8.1: devs have no write credential; only service account writes | ❌ Violated | W2/W3 — push writes anywhere on disk incl. `.git/`; Commit Done "pending" mode expects devs to edit the server repo directly |
| S-12 | ARCH §8.2: **every** request authenticated | ❌ Violated | A1 — `GET /api/auth/users` is public |
| S-13 | ARCH §4: GitService is the **only** component that talks to Git Host | ❌ Violated | `projects.routes.ts` and `WorkflowService` call `GitHost.*` directly (ensureRepo, getLog, getCommitDetails, getGitMetadata, commitPendingChanges, getCommitGraph) |
| S-14 | ARCH §2/§9 & LOGIC header: "do not add features" | ⚠️ Extra features | ZIP upload, import-local, `.scrum.json`, commit graph, .git inspector, Commit Done, browser push workbench, user switcher |
| S-15 | ARCH §8.3: overlap check + insert in one transaction | ✅ Met | T19 — concurrent starts: exactly one wins |
| S-16 | ARCH §8.4: every LOCK/PULL/PUSH/FORCE_UNLOCK logged | ✅ Met | |
| S-17 | ARCH §6: 7 tables, columns, `ref` semantics | ✅ Met | |
| S-18 | LOGIC §7: pushed files **not** checked against scope | ✅ As specified | W1 / T18 — out-of-scope push accepted. Spec says leave this out; listed under Notes |

---

## 2. Tasks

### P0 — Security / integrity

- [x] **T-01 Shell command injection in git calls.** `execSync` builds commands with string interpolation; `"` + `&` breaks out on Windows `cmd.exe`.
  - Confirmed: G1 (`GET /projects/:id/commits/:sha`, **any logged-in developer**), G2 (`?branch=` on browse), P4 (`defaultBranch` on create project).
  - Where: [GitHost.ts:26](server/src/services/GitHost.ts#L26), [GitHost.ts:53](server/src/services/GitHost.ts#L53), [GitHost.ts:389](server/src/services/GitHost.ts#L389), [projects.routes.ts:152](server/src/routes/projects.routes.ts#L152).
  - Fix: use `execFileSync('git', [...args])` everywhere; validate SHA (`/^[0-9a-f]{4,40}$/`) and branch (`git check-ref-format --branch`).
- [x] **T-02 Push writes arbitrary paths.** `../` escapes the repo (W2); `.git/...` is writable (W3 → hooks = code execution).
  - Where: `GitHost.push` (`path.join(repoPath, item.path)`).
  - Fix: resolve the path and reject it if outside `repoPath`, or if it starts with `.git/`.
- [x] **T-03 Reassigning an IN_PROGRESS task deadlocks it** (S-1, S-2). The task goes ASSIGNED and the old lock stays ACTIVE. The new dev gets "Task already has an active lock", and force-release fails with "not IN_PROGRESS" (T11, T12).
  - Where: [WorkflowService.ts:106](server/src/services/WorkflowService.ts#L106).
  - Fix: guard `task.status ∈ {CREATED, ASSIGNED}` per LOGIC §2.
- [x] **T-04 COMPLETED tasks can be reopened** via assign, keeping the stale `commit_sha` and inflating stats (T20, S2). Same guard as T-03.
- [x] **T-05 Commit Done accepts any SHA** (C1 fake SHA, C6 SHA from another repo, C4 same SHA on two tasks). With no SHA it links the current HEAD, even the initial repo commit (C2). "Pending" mode runs `git add -A` and commits other people's files and `.scrum.json` (C3).
  - Where: [WorkflowService.ts:211](server/src/services/WorkflowService.ts#L211).
  - Fix (spec-aligned): remove Commit Done (S-4) and complete tasks only through `pushWork`. If kept: verify `git cat-file -e <sha>^{commit}` in this repo, require a commit newer than lock acquisition, enforce one task per SHA, and stage only scope paths.
- [x] **T-06 Unauthenticated user directory.** `GET /api/auth/users` returns all names, emails and roles (A1, S-12).
  - Where: [auth.routes.ts:43](server/src/routes/auth.routes.ts#L43).
  - Fix: add `authenticate`. The login page's 1-click list needs another approach (demo flag).
- [x] **T-07 Hardcoded JWT secret fallback** lets anyone mint valid tokens (A6).
  - Where: [User.ts:6](server/src/models/User.ts#L6).
  - Fix: refuse to start without `JWT_SECRET`, or generate a random one per install.
- [x] **T-08 Import-local overwrites the user's files.** It replaces the folder's `README.md` and injects `src/main.ts` and `src/auth/auth.ts` (P7). It also accepts any server path (P9; it only failed on System32 because of permissions).
  - Fix: never write starter files into an imported dir; restrict to an allow-listed base path.

### P1 — Broken features

- [x] **T-09 Imported projects show the wrong repo.** `getProjectRepoPath()` always returns `repos/project-N` and ignores the imported directory, so browse, graph, commits, push and pull all target an empty auto-created repo (P8).
  - Where: [GitService.ts:15](server/src/services/GitService.ts#L15).
  - Fix: persist the repo path per project and use it everywhere.
- [x] **T-10 ZIP upload fails on Windows**: `unzip` is not on PATH when the server is started from PowerShell or cmd (P10). It only works if started from Git Bash.
  - Where: [projects.routes.ts:152](server/src/routes/projects.routes.ts#L152).
  - Fix: use a JS unzip library (e.g. `adm-zip`) and guard against zip-slip.
- [x] **T-11 Locks conflict across projects** (T13; also hit naturally during UI testing). `LockManager.acquire` checks every ACTIVE lock in the system, so `src/auth/` in project A blocks `src/auth/` in project B. A `/` scope blocks the whole installation.
  - Where: [LockManager.ts:25](server/src/services/LockManager.ts#L25).
  - Fix: join `tasks` and filter on the same `project_id`.
- [x] **T-12 Overlap check misses equivalent paths.** `./lib/core/x.ts` and `lib\core\y.ts` do not overlap `lib/core/` (T15, T16).
  - Where: [FileLock.ts:4](server/src/models/FileLock.ts#L4).
  - Fix: normalise (`\` → `/`, strip `./`, collapse `//`, reject `..`) at task creation and in `prefixOverlaps`.
- [x] **T-13 Push with no real change completes the task** with the pre-existing HEAD SHA (W4, S-5). Fix: reject with `rejectPush` when nothing is staged.
- [x] **T-14 `.scrum.json` pollutes git.** It is written into the working tree after every action, so the repo is always dirty (W9), and `git add -A` sweeps it into every developer commit (W8).
  - Fix: add it to `.git/info/exclude`, or store it outside the working tree, and stage explicit paths only.
- [x] **T-15 Developer dashboard shows blank stats** (U1). The manager endpoint returns `push_count`, but the developer endpoint returns the `DeveloperStats` object (`pushCount`, …).
  - Where: [WorkflowService.ts:500](server/src/services/WorkflowService.ts#L500).
  - Fix: return the same snake_case row shape.
- [x] **T-16 Pull does not download anything** (U4, S-7). `handlePullScope` discards `snapshot`.
  - Where: [App.tsx:155](client/src/App.tsx#L155).
  - Fix: build a zip or file download from the snapshot.
- [x] **T-17 Browser Push Workbench blindly overwrites files** (U3). It prefills an existing file path (`src/main.ts`) with an **empty** editor; pushing replaces the file's content.
  - Fix: load the current file content when a path is chosen.
- [x] **T-18 Create Task modal targets the wrong project** (U2). It preselects project #1 even when another project is selected. State is initialised once at mount.
  - Where: [CreateTaskModal.tsx:20](client/src/components/CreateTaskModal.tsx#L20).
  - Fix: sync on open (`useEffect` on `isOpen`/`defaultProjectId`).
- [x] **T-19 Commit links from Team Stats fail for other projects** (U5, "Commit not found"). The diff modal always uses the *selected* project, not the commit's project.
  - Where: [App.tsx:323](client/src/App.tsx#L323).
  - Fix: include `project_id` in activity rows and pass it through.
- [x] **T-20 Client calls a missing endpoint.** `api.addProjectMember` → `POST /projects/:id/members` returns 404 (P6). Add the route (ARCH lists `Project.addMember`) or remove the client call.
- [x] **T-21 Non-atomic project creation.** The DB row is inserted before `git init`. An invalid branch or corrupt zip returns 400/500 but leaves a broken project in the list (P3, P12). Fix: create the repo first, or wrap both in a transaction and roll back.

### P2 — Wrong behaviour / validation

- [x] **T-22 Input validation on task create.** Accepts whitespace-only titles (T1), empty scope `[]` (T2), `..` paths (T3) and non-string scopes (T5). Also whitespace-only project names (P1).
- [x] **T-23 Multi-line commit messages truncated to the first line** on Windows (W6). Fixed by T-01 (`execFileSync` / `-F` file).
- [x] **T-24 Commit history/graph mis-parses `|` in messages** (W7: message `"feat: a "`, author `" b"`).
  - Where: [GitHost.ts:167](server/src/services/GitHost.ts#L167), [GitHost.ts:252](server/src/services/GitHost.ts#L252).
  - Fix: use a `%x1f` separator or `-z`.
- [x] **T-25 `.scrum.json` recentActivity is not project-scoped.** A brand-new project lists 30 events from other projects (S1).
  - Where: [ScrumFileService.ts:130](server/src/services/ScrumFileService.ts#L130).
- [x] **T-26 Non-members can browse files and list tasks of any project** (G4, G5); pull is correctly blocked (G6). LOGIC §4.2 says "any project member", so apply the same membership check to browse and tasks.
- [x] **T-27 Browsing a nonexistent branch returns `[]` silently** (G3). It should return an error.
- [x] **T-28 `GET /api/projects` is slow.** It runs several git processes per project and took ~4 s with ~50 projects, which made the UI briefly show "Projects (0)". `readTree` also spawns one `git show` per file. Fix: lazy-load metadata; use `git cat-file --batch`.
- [x] **T-29 Read endpoints have side effects.** `getGitMetadata`/`readTree`/`getLog` call `ensureRepo`, which silently re-creates a missing repo with starter files.
- [x] **T-30 Malformed JSON bodies produce 500s with internal messages** (A4: `{"email":{"a":1}}` → `Unknown named parameter 'a'`). Validate types and return 400 (S-10).
- [x] **T-31 Logout does not invalidate the token** (A5); tokens live 7 days. Add a denylist/token version, or shorten expiry.
- [x] **T-32 Project member defaults can be empty.** `CreateProjectModal` and `UploadProjectModal` initialise `selectedMembers` from `allUsers` at first render. If users haven't loaded yet (page reload race), the project gets no members and every assign fails. *(Code review; not reproduced.)*
- [x] **T-33 User switcher logs in as anyone with the hardcoded `password123`** ([AuthContext.tsx](client/src/context/AuthContext.tsx), Navbar). Fine for a demo; gate it behind a dev flag.

### P3 — Polish

- [x] **T-34 Email login is case-sensitive** (A3). Normalise to lowercase.
- [x] **T-35 The ".git folder" / ".scrum.json" chips and the "Offline" badge are hardcoded** ([App.tsx](client/src/App.tsx), [Navbar.tsx:55](client/src/components/Navbar.tsx#L55)). Bind them to `gitMetadata`.
- [x] **T-36 React "missing key" warning in `DashboardView`** (seen in the browser console).
- [x] **T-37 Overlapping banner timeouts** (`showBanner` never clears the previous `setTimeout`). A new banner can be dismissed early.
- [x] **T-38 No refresh/polling.** Other users' lock, start and push changes are invisible until manual reload.
- [x] **T-39 Modals keep stale form state after submit/close** (CreateTask, CreateProject, Upload, Workbench).
- [x] **T-40 Null file content in a push returns 403 `rejectPush` with Node's internal error text** (W11). Should be a 400 validation error.

### New work

- [x] **T-41 Every Scrum change is acknowledged by Git and reaches every machine.** Any change to Scrum state must produce a git commit of `.scrum.json`, authored by the service account with a descriptive `chore(scrum): …` message, and be published to the project's remote so every clone sees it on `git pull`. Changes covered: project create, task create/assign, start, push, Commit Done, force-release, member add.
  - The working tree stays clean (supersedes the T-14 workaround: `.scrum.json` is tracked, but only ever committed by the service account, never swept into developer commits).
  - Before Commit Done / push, the server syncs from the remote (`fetch` + fast-forward), so commits developers pushed from their own machines are visible.
  - Browsers of all logged-in users auto-refresh (polling) so the board reflects other people's changes without a reload (covers T-38).
- [x] **T-42 Test suite cleanup crashes** (`EBUSY` unlinking `test-sprintvault.db` on Windows). The DB handle is never closed before cleanup.
- [x] **T-43 Browser Push Workbench crashed on "Stage File"** (found while fixing T-17). It used Node's `Buffer.byteLength`, which doesn't exist in browsers.
- [x] **T-44 Commit Done could link SprintVault's own bookkeeping commits** (introduced risk from T-41). The newest commit is often a `chore(scrum)` service commit, so it is now rejected and hidden from the commit picker.

---

## 3. Verified working ✅
Wrong password rejected (A2) · role re-checked against DB for manager actions (A7) · non-numeric/unknown project ids → 404 (P5) · task in unknown project rejected (T4) · assign to non-member/manager rejected (T6) · non-assignee start rejected (T7) · start → lock granted (T8) · double start rejected (T9) · non-owner push rejected (T10) · same-project overlap rejected (T14) · concurrent overlapping starts: exactly one wins (T19) · force-release only from IN_PROGRESS (T21) · `"` / `&` in a push message not injectable (W5) · manager cannot push (W10) · non-member pull rejected (G6) · no ghost repo for unknown project id (G8) · no runtime errors switching all 5 tabs (U6).

## 4. Notes
- **Out-of-scope pushes are accepted** (W1, T18: a task with empty scope pushed to `README.md`). LOGIC §7 explicitly leaves scope checking out, so this is **spec-compliant**. Worth revisiting, though: combined with T-11 and T-22, the lock guarantees very little.
- **Reproduce:** the test harnesses live in the session scratchpad (`apitest.mjs`, `uitest.mjs`). Run them against a server started with `PORT=3002 DB_PATH=… REPOS_PATH=…` so real data isn't touched.
