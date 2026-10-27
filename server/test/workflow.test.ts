import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

async function runTests() {
  console.log('🧪 Starting SprintVault Comprehensive Test Suite (Scrum + Git Commit Graph + .scrum.json)...\n');

  // Set test environment database before importing modules
  const testDbPath = path.resolve(process.cwd(), 'test-sprintvault.db');
  const testReposPath = path.resolve(process.cwd(), 'test-repos');
  process.env.DB_PATH = testDbPath;
  process.env.REPOS_PATH = testReposPath;

  // Clean prior test artifacts
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  if (fs.existsSync(testReposPath)) fs.rmSync(testReposPath, { recursive: true, force: true });

  const { db, initDatabase } = await import('../src/db/database');
  const { User, Manager, Developer } = await import('../src/models/User');
  const { Project } = await import('../src/models/Project');
  const { Task } = await import('../src/models/Task');
  const { FileLock } = await import('../src/models/FileLock');
  const { DeveloperStats } = await import('../src/models/DeveloperStats');
  const { ActivityLog } = await import('../src/models/ActivityLog');
  const { WorkflowService } = await import('../src/services/WorkflowService');
  const { LockManager } = await import('../src/services/LockManager');
  const { GitHost } = await import('../src/services/GitHost');
  const { GitService } = await import('../src/services/GitService');
  const { ScrumFileService } = await import('../src/services/ScrumFileService');
  const { ActionType, LockStatus, TaskStatus, UserRole } = await import('../src/types');

  // Test 1: Database and 5 Users enforcement
  console.log('▶ Test 1: Database and 5 Users enforcement');
  initDatabase();

  const users = db.prepare('SELECT * FROM users').all() as any[];
  assert.strictEqual(users.length, 5, 'Must contain exactly 5 users');

  const managers = users.filter((u) => u.role === UserRole.MANAGER);
  assert.strictEqual(managers.length, 1, 'Must have exactly 1 Manager / Team Lead');
  assert.strictEqual(managers[0].email, 'lead@sprintvault.com');

  const developers = users.filter((u) => u.role === UserRole.DEVELOPER);
  assert.strictEqual(developers.length, 4, 'Must have exactly 4 Developers');

  const devStats = DeveloperStats.findAll();
  assert.strictEqual(devStats.length, 4, 'Each developer must have a developer_stats record');
  console.log('  ✔ 5 Users (1 TL + 4 Devs) initialized and verified');

  // Test 2: Authentication
  console.log('▶ Test 2: Authentication & Class specialisation');
  const loginRes = User.login('lead@sprintvault.com', 'password123');
  assert.ok(loginRes, 'Manager login should succeed');
  assert.ok(loginRes.token, 'Should return JWT token');
  assert.ok(loginRes.user instanceof Manager, 'Manager instance must be of class Manager');

  const devLogin = User.login('alex@sprintvault.com', 'password123');
  assert.ok(devLogin, 'Developer login should succeed');
  assert.ok(devLogin.user instanceof Developer, 'Developer instance must be of class Developer');
  console.log('  ✔ Authentication and OOP class hierarchies verified');

  // Test 3: Project Creation & Single .scrum.json File Tracking
  console.log('▶ Test 3: Project Creation & .scrum.json tracking file');
  const leadId = managers[0].user_id;
  const dev1Id = developers[0].user_id;
  const dev2Id = developers[1].user_id;

  const project = WorkflowService.createProject(
    'Payment Service',
    'git://local/payment-service.git',
    'main',
    leadId,
    [dev1Id, dev2Id]
  );
  assert.strictEqual(project.name, 'Payment Service');

  // Check physical git repository
  const repoPath = GitService.getProjectRepoPath(project.projectId);
  assert.ok(fs.existsSync(path.join(repoPath, '.git')), 'Git repository must be initialized on disk');

  // Check single .scrum.json tracking file inside the project directory
  const scrumFilePath = path.join(repoPath, '.scrum.json');
  assert.ok(fs.existsSync(scrumFilePath), '.scrum.json file must exist in project root');
  const scrumContent = JSON.parse(fs.readFileSync(scrumFilePath, 'utf8'));
  assert.strictEqual(scrumContent.projectName, 'Payment Service');
  console.log(`  ✔ Project created with .git and .scrum.json tracking file at ${repoPath}`);

  // Test 4: Task Creation & Assignment
  console.log('▶ Test 4: Task State Machine (CREATED -> ASSIGNED)');
  const task1 = WorkflowService.createTask(
    project.projectId,
    'Stripe Checkout Integration',
    ['src/stripe/', 'src/config/stripe.ts'],
    leadId
  );
  assert.strictEqual(task1.status, TaskStatus.CREATED);

  WorkflowService.assignTask(task1.taskId, dev1Id, leadId);
  const reloadedTask1 = Task.findById(task1.taskId);
  assert.strictEqual(reloadedTask1?.status, TaskStatus.ASSIGNED);

  // Check .scrum.json is updated
  const scrumAfterAssign = JSON.parse(fs.readFileSync(scrumFilePath, 'utf8'));
  assert.strictEqual(scrumAfterAssign.tasks[0].status, 'ASSIGNED');
  console.log('  ✔ Task created, assigned, and synced to .scrum.json');

  // Test 5: Start Work (Active Lock Acquisition)
  console.log('▶ Test 5: Start Work & Lock Acquisition (ASSIGNED -> IN_PROGRESS)');
  const startRes = WorkflowService.startWork(task1.taskId, dev1Id);
  assert.strictEqual(startRes.lock.status, LockStatus.ACTIVE);

  const inProgTask = Task.findById(task1.taskId);
  assert.strictEqual(inProgTask?.status, TaskStatus.IN_PROGRESS);
  console.log('  ✔ Active lock acquired in atomic transaction, Task is IN_PROGRESS');

  // Test 6: Overlap Guard
  console.log('▶ Test 6: Lock Overlap Rejection');
  const task2 = WorkflowService.createTask(
    project.projectId,
    'Stripe Webhook Handler',
    ['src/stripe/webhook.ts'],
    leadId
  );
  WorkflowService.assignTask(task2.taskId, dev2Id, leadId);

  try {
    WorkflowService.startWork(task2.taskId, dev2Id);
    assert.fail('Should have rejected startWork due to overlapping scope');
  } catch (err: any) {
    assert.strictEqual(err.type, 'rejectStart');
  }
  console.log('  ✔ Overlapping scope correctly rejected with rejectStart');

  // Test 7: Pull Code
  console.log('▶ Test 7: Pull Code Snapshot');
  const pullRes = WorkflowService.pullCode(project.projectId, ['src/stripe/'], dev1Id);
  assert.ok(Array.isArray(pullRes.snapshot));
  const statsAfterPull = DeveloperStats.findByUserId(dev1Id);
  assert.strictEqual(statsAfterPull?.pullCount, 1);
  console.log('  ✔ Pull code snapshot succeeded, pullCount incremented');

  // Test 8: Commit Done Flow (Developer commits locally; clicks Commit Done)
  console.log('▶ Test 8: "Commit Done" action with local Git commit detection');

  // Simulate developer writing code locally in repo and committing with Git CLI
  const testFile = path.join(repoPath, 'src', 'stripe', 'checkout.ts');
  fs.mkdirSync(path.dirname(testFile), { recursive: true });
  fs.writeFileSync(testFile, 'export function checkout() { return true; }\n');

  // Developer triggers commitDone (with commit message for local changes or HEAD detection)
  const commitDoneRes = WorkflowService.commitDone(
    task1.taskId,
    dev1Id,
    undefined,
    'feat(stripe): complete checkout implementation'
  );

  assert.ok(commitDoneRes.sha, 'Must return commit SHA');
  assert.strictEqual(commitDoneRes.status, TaskStatus.COMPLETED);
  assert.strictEqual(commitDoneRes.sha.length, 40, 'SHA must be 40-character git commit hash');

  const completedTask = Task.findById(task1.taskId);
  assert.strictEqual(completedTask?.status, TaskStatus.COMPLETED);
  assert.strictEqual(completedTask?.commitSha, commitDoneRes.sha);

  // Lock must be RELEASED
  const releasedLock = FileLock.findActiveByTaskId(task1.taskId);
  assert.strictEqual(releasedLock, null, 'No active lock should remain for completed task');

  // Developer stats updated
  const statsAfterCommitDone = DeveloperStats.findByUserId(dev1Id);
  assert.strictEqual(statsAfterCommitDone?.pushCount, 1);
  assert.strictEqual(statsAfterCommitDone?.tasksCompleted, 1);

  // Verify .scrum.json contains completed task and linked commit SHA!
  const scrumAfterDone = JSON.parse(fs.readFileSync(scrumFilePath, 'utf8'));
  const taskInScrum = scrumAfterDone.tasks.find((t: any) => t.taskId === task1.taskId);
  assert.strictEqual(taskInScrum.status, 'COMPLETED');
  assert.strictEqual(taskInScrum.commitSha, commitDoneRes.sha);
  console.log(`  ✔ "Commit Done" detected Git commit (${commitDoneRes.sha.substring(0, 8)}), completed task, released lock, updated .scrum.json!`);

  // Test 9: Git Commit Graph DAG Generation
  console.log('▶ Test 9: Git Commit Graph DAG generation from .git folder');
  const graphData = WorkflowService.getProjectCommitGraph(project.projectId);
  assert.ok(graphData.nodes.length >= 2, 'Graph must contain commit nodes');

  // Find the node linked to task1
  const linkedNode = graphData.nodes.find((n) => n.sha === commitDoneRes.sha);
  assert.ok(linkedNode, 'Commit node for commitDone must exist in graph');
  assert.ok(linkedNode.linkedTask, 'Graph node must be linked to Scrum task');
  assert.strictEqual(linkedNode.linkedTask.taskId, task1.taskId);
  console.log('  ✔ Git commit graph DAG correctly parsed with task linkage badge');

  // Test 10: Git Metadata inspection
  console.log('▶ Test 10: .git folder metadata inspection');
  const meta = WorkflowService.getProjectGitMetadata(project.projectId);
  assert.strictEqual(meta.gitDirExists, true);
  assert.strictEqual(meta.scrumFileExists, true);
  assert.strictEqual(meta.currentBranch, 'main');
  assert.ok(meta.totalCommits >= 2);
  console.log('  ✔ .git folder metadata and .scrum.json status inspected');

  // Test 11: Task 2 unblocked and Force-Release
  console.log('▶ Test 11: Scope unblocking and Force-Release');
  const startTask2Res = WorkflowService.startWork(task2.taskId, dev2Id);
  assert.strictEqual(startTask2Res.lock.status, LockStatus.ACTIVE);

  WorkflowService.forceRelease(task2.taskId, leadId);
  const task2Reset = Task.findById(task2.taskId);
  assert.strictEqual(task2Reset?.status, TaskStatus.ASSIGNED);
  console.log('  ✔ Task 2 acquired lock and was force-released back to ASSIGNED');

  const git = (cwd: string, ...args: string[]) =>
    execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  const expectReject = (fn: () => unknown, type: string, pattern: RegExp) => {
    try {
      fn();
    } catch (err: any) {
      assert.strictEqual(err.type, type, `expected ${type}, got ${err.type || err.message}`);
      assert.match(err.reason, pattern);
      return;
    }
    assert.fail(`expected ${type} matching ${pattern}`);
  };

  // Test 12: State-machine guards (LOGIC §2)
  console.log('▶ Test 12: assignTask only from CREATED / ASSIGNED');
  WorkflowService.startWork(task2.taskId, dev2Id);
  assert.throws(() => WorkflowService.assignTask(task2.taskId, dev1Id, leadId), /cannot be assigned from status 'IN_PROGRESS'/);
  assert.ok(FileLock.findActiveByTaskId(task2.taskId), 'Lock must stay with the IN_PROGRESS task');
  assert.throws(() => WorkflowService.assignTask(task1.taskId, dev2Id, leadId), /cannot be assigned from status 'COMPLETED'/);
  WorkflowService.forceRelease(task2.taskId, leadId);
  console.log('  ✔ IN_PROGRESS and COMPLETED tasks cannot be reassigned');

  // Test 13: Locks are per project and paths are normalized
  console.log('▶ Test 13: Per-project locks and path normalization');
  const otherProject = WorkflowService.createProject('Other Service', 'git://local/other.git', 'main', leadId, [dev1Id, dev2Id]);
  const lockA = WorkflowService.createTask(project.projectId, 'Lib A', ['lib/core/'], leadId);
  const lockB = WorkflowService.createTask(otherProject.projectId, 'Lib B', ['lib/core/'], leadId);
  const lockC = WorkflowService.createTask(project.projectId, 'Lib C', ['.\\lib\\core\\x.ts'], leadId);
  assert.deepStrictEqual(lockC.scopePaths, ['lib/core/x.ts'], 'Scope paths are normalized on creation');
  WorkflowService.assignTask(lockA.taskId, dev1Id, leadId);
  WorkflowService.assignTask(lockB.taskId, dev2Id, leadId);
  WorkflowService.assignTask(lockC.taskId, dev2Id, leadId);
  WorkflowService.startWork(lockA.taskId, dev1Id);
  WorkflowService.startWork(lockB.taskId, dev2Id); // same path, different project: allowed
  expectReject(() => WorkflowService.startWork(lockC.taskId, dev2Id), 'rejectStart', /overlaps/);
  assert.throws(() => WorkflowService.createTask(project.projectId, 'Bad', ['../etc'], leadId), /must not contain '\.\.'/);
  assert.throws(() => WorkflowService.createTask(project.projectId, '   ', ['a/'], leadId), /Title is required/);
  assert.throws(() => WorkflowService.createTask(project.projectId, 'Empty', [], leadId), /non-empty array/);
  console.log('  ✔ Same scope in another project allowed; ./ and \\ variants detected; bad input rejected');

  // Test 14: Push safety, no-op pushes, .scrum.json stays out of developer commits
  console.log('▶ Test 14: Push path safety and Scrum auto-commits');
  assert.throws(() => WorkflowService.pushWork(lockA.taskId, dev1Id, [{ path: '../escape.txt', content: 'x' }], 'x'), /'\.\.'/);
  assert.throws(() => WorkflowService.pushWork(lockA.taskId, dev1Id, [{ path: '.git/config', content: 'x' }], 'x'), /inside \.git/);
  expectReject(
    () => WorkflowService.pushWork(lockA.taskId, dev1Id, [{ path: 'README.md', content: fs.readFileSync(path.join(repoPath, 'README.md'), 'utf8') }], 'noop'),
    'rejectPush',
    /outside this task's scope/
  );
  const pushRes = WorkflowService.pushWork(lockA.taskId, dev1Id, [{ path: 'lib/core/index.ts', content: 'export {};\n' }], 'feat: core\n\nmulti-line body | with pipe');
  const pushedFiles = git(repoPath, 'show', '--name-only', '--format=', pushRes.sha);
  assert.strictEqual(pushedFiles, 'lib/core/index.ts', 'Developer commit contains only the pushed file');
  assert.strictEqual(git(repoPath, 'log', '-1', '--format=%B', pushRes.sha), 'feat: core\n\nmulti-line body | with pipe');
  assert.match(git(repoPath, 'log', '-1', '--format=%s'), /^chore\(scrum\): complete task #\d+/, 'Scrum change committed after the push');
  assert.strictEqual(git(repoPath, 'status', '--porcelain'), '', 'Working tree clean after every Scrum change');
  console.log('  ✔ Unsafe paths and no-op pushes rejected; every Scrum change is a service-account commit');

  // Test 15: Commit Done validates the commit
  console.log('▶ Test 15: Commit Done verification');
  const cdTask = WorkflowService.createTask(project.projectId, 'Docs', ['docs/'], leadId);
  WorkflowService.assignTask(cdTask.taskId, dev1Id, leadId);
  // A developer commit made (and backdated) before the task was started
  fs.writeFileSync(path.join(repoPath, 'OLD_NOTES.md'), 'old\n');
  git(repoPath, 'add', 'OLD_NOTES.md');
  execFileSync('git', ['commit', '-q', '-m', 'old work', '--author=Alex <alex@sprintvault.com>', '--date=2020-01-01T00:00:00'], {
    cwd: repoPath,
    env: { ...process.env, GIT_COMMITTER_DATE: '2020-01-01T00:00:00' },
  });
  const oldSha = git(repoPath, 'rev-parse', 'HEAD');
  WorkflowService.startWork(cdTask.taskId, dev1Id);
  expectReject(() => WorkflowService.commitDone(cdTask.taskId, dev1Id, 'deadbeef'), 'rejectPush', /does not exist/);
  expectReject(() => WorkflowService.commitDone(cdTask.taskId, dev1Id, pushRes.sha), 'rejectPush', /already linked to Task/);
  expectReject(() => WorkflowService.commitDone(cdTask.taskId, dev1Id), 'rejectPush', /bookkeeping commit/);
  expectReject(() => WorkflowService.commitDone(cdTask.taskId, dev1Id, oldSha), 'rejectPush', /before work on this task started/);
  fs.mkdirSync(path.join(repoPath, 'docs'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'docs', 'guide.md'), '# Guide\n');
  fs.writeFileSync(path.join(repoPath, 'SOMEONE_ELSES_WIP.txt'), 'not mine');
  const cdRes = WorkflowService.commitDone(cdTask.taskId, dev1Id, undefined, 'docs: guide');
  assert.strictEqual(git(repoPath, 'show', '--name-only', '--format=', cdRes.sha), 'docs/guide.md', 'Pending mode commits task scope only');
  fs.unlinkSync(path.join(repoPath, 'SOMEONE_ELSES_WIP.txt'));
  console.log('  ✔ Fake, foreign-task and pre-lock commits rejected; pending mode stays in scope');

  // Test 16: Scrum changes reach every machine through the remote (T-41)
  console.log('▶ Test 16: Two-machine sync through origin');
  const remotePath = path.join(testReposPath, 'remote', 'shared.git');
  fs.mkdirSync(remotePath, { recursive: true });
  git(remotePath, 'init', '--bare', '-b', 'main');
  const shared = WorkflowService.createProject('Shared', remotePath, 'main', leadId, [dev1Id, dev2Id]);
  const devMachine = path.join(testReposPath, 'dev-machine');
  git(testReposPath, 'clone', '--quiet', remotePath, devMachine);
  git(devMachine, 'config', 'user.name', 'Alex');
  git(devMachine, 'config', 'user.email', 'alex@sprintvault.com');
  const readScrum = () => JSON.parse(fs.readFileSync(path.join(devMachine, '.scrum.json'), 'utf8'));
  assert.strictEqual(readScrum().projectName, 'Shared', 'Project creation published to origin');

  const remoteTask = WorkflowService.createTask(shared.projectId, 'Remote feature', ['feature/'], leadId);
  WorkflowService.assignTask(remoteTask.taskId, dev1Id, leadId);
  WorkflowService.startWork(remoteTask.taskId, dev1Id);
  git(devMachine, 'pull', '--quiet');
  assert.strictEqual(readScrum().tasks[0].status, 'IN_PROGRESS', 'Developer machine sees the Scrum change after git pull');
  assert.match(git(devMachine, 'log', '-1', '--format=%s'), /^chore\(scrum\): start task/);

  fs.mkdirSync(path.join(devMachine, 'feature'), { recursive: true });
  fs.writeFileSync(path.join(devMachine, 'feature', 'work.ts'), 'export const done = true;\n');
  git(devMachine, 'add', 'feature/work.ts');
  git(devMachine, 'commit', '--quiet', '-m', 'feat: remote work');
  const devSha = git(devMachine, 'rev-parse', 'HEAD');
  git(devMachine, 'push', '--quiet', 'origin', 'main');
  const remoteDone = WorkflowService.commitDone(remoteTask.taskId, dev1Id, devSha);
  assert.strictEqual(remoteDone.sha, devSha, 'Commit pushed from the developer machine is linked');
  git(devMachine, 'pull', '--quiet');
  assert.strictEqual(readScrum().tasks[0].status, 'COMPLETED');
  assert.strictEqual(readScrum().tasks[0].commitSha, devSha);
  console.log('  ✔ Every Scrum change is committed and pushed; developer commits are synced back');

  // Test 17: Developer dashboard row shape, import-local and atomic project creation
  console.log('▶ Test 17: Dashboard shape, import-local, atomic create');
  const devDash = WorkflowService.getDashboard(dev1Id);
  assert.ok('push_count' in devDash.developerStats[0], 'Developer stats use the same snake_case shape as the manager view');
  const importDir = path.join(testReposPath, 'existing-app');
  fs.mkdirSync(path.join(importDir, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(importDir, 'README.md'), 'ORIGINAL');
  fs.writeFileSync(path.join(importDir, 'lib', 'mine.js'), 'module.exports = 1;\n');
  const imported = WorkflowService.createProject('Existing', `file://${importDir}`, 'main', leadId, [dev1Id], importDir);
  assert.strictEqual(fs.readFileSync(path.join(importDir, 'README.md'), 'utf8'), 'ORIGINAL', 'Import never overwrites files');
  const importedFiles = WorkflowService.browseFiles(imported.projectId).map((f) => f.path).sort();
  assert.deepStrictEqual(importedFiles, ['README.md', 'lib/mine.js'], 'Imported project browses its own directory');
  const projectCount = Project.findAll().length;
  assert.throws(() => WorkflowService.createProject('Broken', 'git://local/x.git', 'bad branch..', leadId, []), /not a valid branch name/);
  assert.strictEqual(Project.findAll().length, projectCount, 'Failed creation leaves no project row');
  console.log('  ✔ Dashboard shape consistent; import is non-destructive; failed creation rolls back');

  // Test 18: Scope enforcement, stale locks and governance metrics
  console.log('▶ Test 18: Scope enforcement, stale lock release, metrics');
  const { GovernanceEvent } = await import('../src/models/GovernanceEvent');
  const { GovernanceKind } = await import('../src/types');
  const scoped = WorkflowService.createTask(project.projectId, 'Auth fix', ['src/auth/'], leadId);
  WorkflowService.assignTask(scoped.taskId, dev1Id, leadId);
  WorkflowService.startWork(scoped.taskId, dev1Id);
  expectReject(
    () => WorkflowService.pushWork(scoped.taskId, dev1Id, [{ path: 'src/auth/auth.ts', content: fs.readFileSync(path.join(repoPath, 'src', 'auth', 'auth.ts'), 'utf8') }], 'noop'),
    'rejectPush',
    /No changes to commit/
  );
  const headBefore = git(repoPath, 'rev-parse', 'HEAD');
  expectReject(
    () => WorkflowService.pushWork(scoped.taskId, dev1Id, [
      { path: 'src/auth/auth.ts', content: 'export const ok = 1;\n' },
      { path: 'src/payments/pay.ts', content: 'export const sneaky = 1;\n' },
    ], 'feat: auth'),
    'rejectPush',
    /'src\/payments\/pay\.ts', outside this task's scope \(src\/auth\)/
  );
  assert.strictEqual(git(repoPath, 'rev-parse', 'HEAD'), headBefore, 'Rejected push leaves the repository untouched');
  assert.strictEqual(Task.findById(scoped.taskId)?.status, TaskStatus.IN_PROGRESS, 'Task stays in progress');
  // A scope directory is not a prefix match on names: src/authority is outside src/auth
  expectReject(
    () => WorkflowService.pushWork(scoped.taskId, dev1Id, [{ path: 'src/authority.ts', content: 'x\n' }], 'x'),
    'rejectPush',
    /outside this task's scope/
  );
  // Commit Done also checks the files of a commit made outside SprintVault
  fs.mkdirSync(path.join(repoPath, 'src', 'payments'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'src', 'payments', 'pay.ts'), 'export const sneaky = 1;\n');
  git(repoPath, 'add', 'src/payments/pay.ts');
  git(repoPath, '-c', 'user.name=Alex', '-c', 'user.email=alex@sprintvault.com', 'commit', '-q', '-m', 'sneaky');
  expectReject(() => WorkflowService.commitDone(scoped.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')), 'rejectPush', /outside this task's scope/);
  const inScope = WorkflowService.pushWork(scoped.taskId, dev1Id, [{ path: 'src/auth/auth.ts', content: 'export const ok = 1;\n' }], 'feat: auth');
  assert.strictEqual(git(repoPath, 'show', '--name-only', '--format=', inScope.sha), 'src/auth/auth.ts', 'In-scope push succeeds');

  // Stale locks: backdate a lock beyond the threshold, then release it with a reason
  process.env.STALE_LOCK_HOURS = '1';
  assert.strictEqual(LockManager.staleAfterHours(), 1);
  const idle = WorkflowService.createTask(project.projectId, 'Idle work', ['src/idle/'], leadId);
  WorkflowService.assignTask(idle.taskId, dev2Id, leadId);
  WorkflowService.startWork(idle.taskId, dev2Id);
  assert.strictEqual(LockManager.isStale(LockManager.lastActivity(idle.taskId)), false, 'A fresh lock is not stale');
  const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
  db.prepare("UPDATE file_locks SET acquired_at = ? WHERE task_id = ? AND status = 'ACTIVE'").run(twoHoursAgo, idle.taskId);
  assert.strictEqual(LockManager.isStale(LockManager.lastActivity(idle.taskId)), true, 'Lock idle for 2h is stale at a 1h threshold');
  assert.strictEqual(WorkflowService.getDashboard(leadId).activeLocks.find((l: any) => l.task_id === idle.taskId).is_stale, true);
  // Downloading the task's project counts as activity
  WorkflowService.pullCode(project.projectId, ['src/idle/'], dev2Id);
  assert.strictEqual(LockManager.isStale(LockManager.lastActivity(idle.taskId)), false, 'A download refreshes the lock');
  db.prepare("UPDATE activity_log SET created_at = ? WHERE user_id = ? AND action = 'PULL'").run(twoHoursAgo, dev2Id);
  assert.throws(() => WorkflowService.forceRelease(idle.taskId, dev1Id, 'x'), /access denied/, 'Only the team lead can release');
  assert.deepStrictEqual(WorkflowService.forceRelease(idle.taskId, leadId, 'Priya is on leave'), { stale: true });
  assert.strictEqual(Task.findById(idle.taskId)?.status, TaskStatus.ASSIGNED);
  const staleEvent = GovernanceEvent.recent(null, 1)[0];
  assert.strictEqual(staleEvent.kind, GovernanceKind.STALE_RELEASE);
  assert.match(staleEvent.detail, /^Priya is on leave \(no activity since /);
  delete process.env.STALE_LOCK_HOURS;

  // Metrics count what the rules stopped
  const metrics = WorkflowService.getDashboard(leadId).metrics;
  assert.strictEqual(metrics.conflictsPrevented, 2, 'Both overlapping starts (Tests 6 and 13) were recorded');
  assert.strictEqual(metrics.scopeViolationsBlocked, 4, 'Test 14 README push plus three in this test');
  assert.strictEqual(metrics.staleLocksReleased, 1);
  assert.strictEqual(metrics.forceReleases, 2, 'Tests 11 and 12 released fresh locks');
  assert.ok(metrics.completedThisWeek >= 5);
  assert.ok(metrics.avgCycleHours !== null && metrics.avgCycleHours >= 0);
  assert.strictEqual(metrics.staleAfterHours, 24, 'Default threshold is 24 hours');
  const otherDev = developers[3].user_id;
  assert.strictEqual(WorkflowService.getDashboard(otherDev).metrics.conflictsPrevented, 0, 'Developers only see metrics of their projects');
  console.log('  ✔ Out-of-scope pushes and commits blocked; stale locks detected and released; metrics counted');

  // Test 19: Bypass fixes from the end-to-end test pass
  console.log('▶ Test 19: Merge/chain/author/case bypasses, failed-push cleanup, dedupe, stale notice, revocation');
  const { ChangeFeed } = await import('../src/services/ChangeFeed');
  const commitAs = (cwd: string, email: string, msg: string) =>
    git(cwd, '-c', `user.name=${email.split('@')[0]}`, '-c', `user.email=${email}`, 'commit', '-q', '-m', msg);
  const alexEmail = User.findById(dev1Id)!.email;
  const priyaEmail = User.findById(dev2Id)!.email;
  const startNew = (title: string, scope: string[], dev: number, projectId = project.projectId) => {
    const t = WorkflowService.createTask(projectId, title, scope, leadId);
    WorkflowService.assignTask(t.taskId, dev, leadId);
    WorkflowService.startWork(t.taskId, dev);
    return t;
  };

  // 1. A merge cannot hide an out-of-scope commit from the side branch
  const mergeTask = startNew('Merge work', ['merge/'], dev1Id);
  git(repoPath, 'checkout', '-q', '-b', 'side');
  fs.writeFileSync(path.join(repoPath, 'MERGED_OUT.txt'), 'x\n');
  fs.mkdirSync(path.join(repoPath, 'merge'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'merge', 'a.ts'), 'a\n');
  git(repoPath, 'add', 'MERGED_OUT.txt', 'merge/a.ts');
  commitAs(repoPath, alexEmail, 'side work');
  git(repoPath, 'checkout', '-q', 'main');
  git(repoPath, '-c', `user.email=${alexEmail}`, '-c', 'user.name=alex', 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  git(repoPath, 'branch', '-q', '-D', 'side');
  expectReject(() => WorkflowService.commitDone(mergeTask.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')), 'rejectPush', /MERGED_OUT\.txt/);
  git(repoPath, 'rm', '-q', 'MERGED_OUT.txt');
  commitAs(repoPath, alexEmail, 'remove out-of-scope file');
  expectReject(() => WorkflowService.commitDone(mergeTask.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')), 'rejectPush', /outside this task's scope/);
  WorkflowService.forceRelease(mergeTask.taskId, leadId, 'cleanup');

  // 4. Every commit since the lock is checked, not only the linked one
  const chainTask = startNew('Chain work', ['chain/'], dev1Id);
  fs.writeFileSync(path.join(repoPath, 'CHAIN_OUT.txt'), 'x\n');
  git(repoPath, 'add', 'CHAIN_OUT.txt');
  commitAs(repoPath, alexEmail, 'out of scope first');
  fs.mkdirSync(path.join(repoPath, 'chain'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'chain', 'a.ts'), 'a\n');
  git(repoPath, 'add', 'chain/a.ts');
  commitAs(repoPath, alexEmail, 'clean last');
  expectReject(() => WorkflowService.commitDone(chainTask.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')), 'rejectPush', /CHAIN_OUT\.txt/);
  WorkflowService.forceRelease(chainTask.taskId, leadId, 'cleanup');
  // Commits by other people and work under the developer's other locks are not held against the task
  const mineTask = startNew('Mine', ['mine/'], dev1Id);
  const alsoMine = startNew('Also mine', ['also/'], dev1Id);
  fs.writeFileSync(path.join(repoPath, 'PRIYA.txt'), 'p\n');
  git(repoPath, 'add', 'PRIYA.txt');
  commitAs(repoPath, priyaEmail, 'priya elsewhere');
  fs.mkdirSync(path.join(repoPath, 'also'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'also', 'b.ts'), 'b\n');
  git(repoPath, 'add', 'also/b.ts');
  commitAs(repoPath, alexEmail, 'other task of mine');
  fs.mkdirSync(path.join(repoPath, 'mine'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'mine', 'a.ts'), 'a\n');
  git(repoPath, 'add', 'mine/a.ts');
  commitAs(repoPath, alexEmail, 'mine');
  assert.strictEqual(WorkflowService.commitDone(mineTask.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')).status, TaskStatus.COMPLETED);
  WorkflowService.forceRelease(alsoMine.taskId, leadId, 'cleanup');

  // 5. The linked commit must be written by the developer
  const authorTask = startNew('Author', ['author/'], dev1Id);
  fs.mkdirSync(path.join(repoPath, 'author'), { recursive: true });
  fs.writeFileSync(path.join(repoPath, 'author', 'a.ts'), 'a\n');
  git(repoPath, 'add', 'author/a.ts');
  commitAs(repoPath, priyaEmail, 'priya wrote this');
  expectReject(() => WorkflowService.commitDone(authorTask.taskId, dev1Id, git(repoPath, 'rev-parse', 'HEAD')), 'rejectPush', /written by .*priya.*not by you/);
  WorkflowService.forceRelease(authorTask.taskId, leadId, 'cleanup');

  // 2. Paths that differ only in case are the same lock and cannot be pushed under another spelling
  const caseA = startNew('Case lower', ['src/auth/'], dev1Id, otherProject.projectId);
  const caseB = WorkflowService.createTask(otherProject.projectId, 'Case upper', ['SRC/Auth/'], leadId);
  WorkflowService.assignTask(caseB.taskId, dev2Id, leadId);
  expectReject(() => WorkflowService.startWork(caseB.taskId, dev2Id), 'rejectStart', /overlaps/);
  const otherRepo = GitService.getProjectRepoPath(otherProject.projectId);
  const authBefore = fs.readFileSync(path.join(otherRepo, 'src', 'auth', 'auth.ts'), 'utf8');
  expectReject(
    () => WorkflowService.pushWork(caseA.taskId, dev1Id, [{ path: 'SRC/Auth/auth.ts', content: 'overwrite\n' }], 'x'),
    'rejectPush',
    /differs only in letter case from 'src'/
  );
  assert.strictEqual(fs.readFileSync(path.join(otherRepo, 'src', 'auth', 'auth.ts'), 'utf8'), authBefore, 'Case variant did not touch the file');

  // 3. A failed push restores the working tree
  expectReject(
    () => WorkflowService.pushWork(caseA.taskId, dev1Id, [
      { path: 'src/auth/new.ts', content: 'new\n' },
      { path: 'src/auth/auth.ts', content: authBefore },
    ].slice(1), 'noop'),
    'rejectPush',
    /No changes/
  );
  fs.writeFileSync(path.join(otherRepo, 'src', 'auth', 'wip.ts'), 'untracked wip\n');
  // A refusing pre-commit hook makes git commit fail after the files were written
  const hookPath = path.join(otherRepo, '.git', 'hooks', 'pre-commit');
  fs.writeFileSync(hookPath, '#!/bin/sh\necho "blocked by test hook" >&2\nexit 1\n', { mode: 0o755 });
  try {
    expectReject(
      () => WorkflowService.pushWork(caseA.taskId, dev1Id, [
        { path: 'src/auth/auth.ts', content: 'changed\n' },
        { path: 'src/auth/brand-new.ts', content: 'new\n' },
        { path: 'src/auth/wip.ts', content: 'overwritten\n' },
      ], 'will fail'),
      'rejectPush',
      /Git commit and push failed/
    );
  } finally {
    fs.unlinkSync(hookPath);
  }
  assert.strictEqual(fs.readFileSync(path.join(otherRepo, 'src', 'auth', 'auth.ts'), 'utf8'), authBefore, 'Tracked file restored');
  assert.ok(!fs.existsSync(path.join(otherRepo, 'src', 'auth', 'brand-new.ts')), 'New file removed');
  assert.strictEqual(fs.readFileSync(path.join(otherRepo, 'src', 'auth', 'wip.ts'), 'utf8'), 'untracked wip\n', 'Untracked file restored, not deleted');
  fs.unlinkSync(path.join(otherRepo, 'src', 'auth', 'wip.ts'));
  assert.strictEqual(git(otherRepo, 'status', '--porcelain'), '', 'Working tree clean after a failed push');

  // 7. Retrying a blocked action counts once per blocking lock
  const conflictsBefore = WorkflowService.getMetrics(null).conflictsPrevented;
  for (let i = 0; i < 4; i++) {
    try { WorkflowService.startWork(caseB.taskId, dev2Id); } catch { /* blocked */ }
  }
  assert.strictEqual(WorkflowService.getMetrics(null).conflictsPrevented, conflictsBefore, 'Repeated clicks are not new conflicts');
  const scopeBefore = WorkflowService.getMetrics(null).scopeViolationsBlocked;
  for (let i = 0; i < 3; i++) {
    try { WorkflowService.pushWork(caseA.taskId, dev1Id, [{ path: 'README.md', content: 'x' }], 'x'); } catch { /* blocked */ }
  }
  assert.strictEqual(WorkflowService.getMetrics(null).scopeViolationsBlocked, scopeBefore + 1, 'Same out-of-scope push counts once');
  WorkflowService.forceRelease(caseA.taskId, leadId, 'cleanup');
  WorkflowService.startWork(caseA.taskId, dev1Id);
  try { WorkflowService.startWork(caseB.taskId, dev2Id); } catch { /* blocked by the new lock */ }
  assert.strictEqual(WorkflowService.getMetrics(null).conflictsPrevented, conflictsBefore + 1, 'A new blocking lock is a new conflict');

  // 6. A lock turning stale bumps the change feed so open boards refresh
  process.env.STALE_LOCK_HOURS = '1';
  LockManager.noticeStaleLocks();
  const feedBefore = ChangeFeed.current();
  LockManager.noticeStaleLocks();
  assert.strictEqual(ChangeFeed.current(), feedBefore, 'No bump while nothing changes');
  db.prepare("UPDATE file_locks SET acquired_at = ? WHERE task_id = ? AND status = 'ACTIVE'").run(new Date(Date.now() - 2 * 3600 * 1000).toISOString(), caseA.taskId);
  LockManager.noticeStaleLocks();
  assert.ok(ChangeFeed.current() > feedBefore, 'Lock going stale bumps the feed');
  delete process.env.STALE_LOCK_HOURS;

  // 8. Logout revocation is stored in the database
  const session = User.login('alex@sprintvault.com', 'password123')!;
  const claims = JSON.parse(Buffer.from(session.token.split('.')[1], 'base64url').toString());
  User.revokeToken(claims.jti, claims.exp);
  assert.ok(db.prepare('SELECT 1 FROM revoked_tokens WHERE jti = ?').get(claims.jti), 'Revocation persisted');
  assert.ok(User.isTokenRevoked(claims.jti));
  console.log('  ✔ Merge, chained and foreign-author commits caught; case variants locked; failed pushes leave no trace; dedupe; stale notice; revocation persisted');

  // Clean up test DB & test repos
  db.close();
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);
  if (fs.existsSync(`${testDbPath}-wal`)) fs.unlinkSync(`${testDbPath}-wal`);
  if (fs.existsSync(`${testDbPath}-shm`)) fs.unlinkSync(`${testDbPath}-shm`);
  if (fs.existsSync(testReposPath)) fs.rmSync(testReposPath, { recursive: true, force: true });

  console.log('\n======================================================');
  console.log('🎉 ALL TESTS PASSED! SprintVault features verified 100%');
  console.log('======================================================\n');
}

runTests().catch((e) => {
  console.error('❌ Test failed:', e);
  process.exit(1);
});
