import assert from 'assert';
import fs from 'fs';
import path from 'path';

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

  // Clean up test DB & test repos
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
