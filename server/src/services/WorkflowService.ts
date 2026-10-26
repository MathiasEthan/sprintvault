import fs from 'fs';
import { db } from '../db/database';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { FileLock } from '../models/FileLock';
import { ActivityLog } from '../models/ActivityLog';
import { User } from '../models/User';
import { LockManager } from './LockManager';
import { GitService } from './GitService';
import { ScrumFileService } from './ScrumFileService';
import { ChangeFeed } from './ChangeFeed';
import { ActionType, GitFileItem, TaskStatus, UserRole, GitGraphNode, GitMetadata } from '../types';
import { ValidationError, normalizeScopePaths, requireText, validatePushFiles } from '../validation';

export class WorkflowService {
  /**
   * Writes .scrum.json, commits it as the service account and publishes it to origin,
   * so every clone of the project sees the Scrum change on `git pull`.
   */
  static recordScrumChange(projectId: number, message: string): void {
    const project = Project.findById(projectId);
    if (!project) return;
    const git = GitService.forProject(project);
    ScrumFileService.syncProjectScrumFile(projectId, git.repoPath);
    git.recordScrumChange(`chore(scrum): ${message}`);
    ChangeFeed.bump();
  }

  private static requireManager(userId: number): User {
    const user = User.findById(userId);
    if (!user || user.role !== UserRole.MANAGER) {
      throw new Error('access denied');
    }
    return user;
  }

  private static requireDeveloper(devId: number): void {
    const user = User.findById(devId);
    if (!user || user.role !== UserRole.DEVELOPER) {
      throw new ValidationError(`User #${devId} is not a developer`);
    }
  }

  /**
   * UC-02: createProject (Manager only)
   * Atomic: if the repository cannot be created/populated, the project row and directory are removed.
   */
  static createProject(
    name: string,
    repoUrl: string,
    defaultBranch: string = 'main',
    createdBy: number,
    initialMemberIds: number[] = [],
    customPath?: string,
    populate?: (repoPath: string) => void
  ): Project {
    WorkflowService.requireManager(createdBy);
    const cleanName = requireText(name, 'Project name');
    const cleanUrl = requireText(repoUrl, 'Repository URL', 1000);
    const branch = requireText(defaultBranch, 'Default branch', 100);
    if (!GitService.isValidBranchName(branch)) {
      throw new ValidationError(`'${branch}' is not a valid branch name`);
    }
    initialMemberIds.forEach((devId) => WorkflowService.requireDeveloper(devId));

    let project: Project;
    let repoPath = '';
    let createdDir = false;
    db.exec('BEGIN IMMEDIATE');
    try {
      const res = db.prepare(`
        INSERT INTO projects (name, repo_url, default_branch, created_by)
        VALUES (?, ?, ?, ?)
      `).run(cleanName, cleanUrl, branch, createdBy);

      const projectId = Number(res.lastInsertRowid);
      project = new Project(projectId, cleanName, cleanUrl, branch, createdBy);

      repoPath = customPath || GitService.getProjectRepoPath(projectId);
      createdDir = !fs.existsSync(repoPath);
      fs.mkdirSync(repoPath, { recursive: true });
      if (populate) populate(repoPath);

      // Starter files only for brand-new, empty projects: imports and uploads keep their own contents
      const starterFiles = customPath || populate ? [] : [
        { path: 'README.md', content: `# ${cleanName}\n\nManaged by SprintVault Scrum App.\n` },
        { path: 'src/main.ts', content: `// Entry point for ${cleanName}\nconsole.log('SprintVault project active.');\n` },
        { path: 'src/auth/auth.ts', content: `// Authentication module\nexport function verifyToken(token: string) {\n  return token.length > 0;\n}\n` },
      ];
      const git = new GitService(repoPath, branch);
      git.initialize(GitService.remoteUrlFor(cleanUrl), starterFiles);

      for (const devId of initialMemberIds) {
        project.addMember(devId);
      }
      db.exec('COMMIT');
    } catch (err) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      if (createdDir && repoPath) fs.rmSync(repoPath, { recursive: true, force: true });
      throw err;
    }

    WorkflowService.recordScrumChange(project.projectId, `create project '${cleanName}'`);
    return project;
  }

  /**
   * Project.addMember (Manager only)
   */
  static addMember(projectId: number, devId: number, managerId: number): number[] {
    WorkflowService.requireManager(managerId);
    const project = Project.findById(projectId);
    if (!project) throw new ValidationError('Project not found');
    WorkflowService.requireDeveloper(devId);
    project.addMember(devId);
    WorkflowService.recordScrumChange(projectId, `add member #${devId}`);
    return project.getMembers();
  }

  /**
   * UC-03: createTask (Manager only)
   */
  static createTask(
    projectId: number,
    title: string,
    scopePaths: string[],
    createdBy: number
  ): Task {
    WorkflowService.requireManager(createdBy);
    const cleanTitle = requireText(title, 'Title');
    const scopes = normalizeScopePaths(scopePaths);

    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const res = db.prepare(`
      INSERT INTO tasks (project_id, title, scope_paths, status, assignee_id, commit_sha, completed_at)
      VALUES (?, ?, ?, ?, NULL, NULL, NULL)
    `).run(projectId, cleanTitle, JSON.stringify(scopes), TaskStatus.CREATED);

    const taskId = Number(res.lastInsertRowid);
    const task = new Task(taskId, projectId, cleanTitle, scopes, TaskStatus.CREATED);

    WorkflowService.recordScrumChange(projectId, `create task #${taskId} '${cleanTitle}'`);
    return task;
  }

  /**
   * UC-04: assignTask (Manager only) — allowed only from CREATED / ASSIGNED (LOGIC §2)
   */
  static assignTask(taskId: number, devId: number, managerId: number): Task {
    WorkflowService.requireManager(managerId);

    const task = Task.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== TaskStatus.CREATED && task.status !== TaskStatus.ASSIGNED) {
      throw new ValidationError(`Task cannot be assigned from status '${task.status}'`);
    }

    const project = Project.findById(task.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    WorkflowService.requireDeveloper(devId);
    if (!project.isMember(devId)) {
      throw new ValidationError('Developer is not a member of this project');
    }

    task.assign(devId);
    WorkflowService.recordScrumChange(project.projectId, `assign task #${taskId} to user #${devId}`);
    return task;
  }

  /**
   * UC-05: browseFiles (Read-only). Developers may only browse projects they belong to.
   */
  static browseFiles(projectId: number, branch?: string, scope?: string[], requesterId?: number): GitFileItem[] {
    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }
    if (requesterId !== undefined) {
      WorkflowService.assertCanView(project, requesterId);
    }

    const git = new GitService(GitService.getProjectRepoPath(projectId), branch || project.defaultBranch);
    return git.fetch(scope || []);
  }

  static assertCanView(project: Project, userId: number): void {
    const user = User.findById(userId);
    if (!user) throw new Error('access denied');
    if (user.role === UserRole.DEVELOPER && !project.isMember(userId)) {
      throw new Error('access denied');
    }
  }

  /**
   * Flow 4.1: Start Work (messages 1–7)
   */
  static startWork(taskId: number, devId: number): { lock: FileLock } {
    const task = Task.findById(taskId);
    if (!task) {
      throw { type: 'rejectStart', reason: 'Task not found' };
    }

    const isAssigned = task.isAssignedTo(devId);
    if (!isAssigned) {
      throw { type: 'rejectStart', reason: 'Developer is not the assigned developer for this task' };
    }

    if (task.status !== TaskStatus.ASSIGNED) {
      throw { type: 'rejectStart', reason: `Task cannot be started from status '${task.status}'` };
    }

    const { lock, reason } = LockManager.acquire(taskId, task.scopePaths, devId);

    if (!lock) {
      throw { type: 'rejectStart', reason: reason || 'Scope is locked by another active task' };
    }

    task.start();
    ActivityLog.record(devId, ActionType.LOCK, taskId);

    WorkflowService.recordScrumChange(task.projectId, `start task #${taskId} (lock ${task.scopePaths.join(', ')})`);
    return { lock };
  }

  /**
   * Flow 4.2: Pull Code (messages 8–12)
   */
  static pullCode(projectId: number, scope: string[], devId: number): { snapshot: GitFileItem[] } {
    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.isMember(devId)) {
      throw new Error('access denied');
    }

    const gitService = GitService.forProject(project);
    const snapshot = gitService.fetch(scope);
    ActivityLog.record(devId, ActionType.PULL, projectId);
    ChangeFeed.bump();

    return { snapshot };
  }

  /**
   * Commit Done action:
   * The developer committed (and, for remote projects, pushed) from their own machine.
   * SprintVault syncs from origin, verifies the commit belongs to this task's work and completes the task.
   */
  static commitDone(
    taskId: number,
    devId: number,
    commitSha?: string,
    pendingMessage?: string
  ): { sha: string; status: TaskStatus; message: string } {
    const reject = (reason: string) => ({ type: 'rejectPush', reason });

    const task = Task.findById(taskId);
    if (!task) {
      throw reject('Task not found');
    }

    const isOwner = LockManager.verifyOwner(taskId, devId);
    if (!isOwner) {
      throw reject('Pusher does not own an active lock for this task');
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw reject('Task is not currently IN_PROGRESS');
    }

    const project = Project.findById(task.projectId);
    if (!project) {
      throw reject('Associated project not found');
    }

    const dev = User.findById(devId);
    if (!dev) {
      throw reject('Developer identity not found');
    }

    const git = GitService.forProject(project);
    try {
      git.sync();
    } catch (err: any) {
      throw reject(`Could not sync with remote: ${err.message}`);
    }

    let finalSha: string | null | undefined = typeof commitSha === 'string' ? commitSha.trim() : undefined;

    // Developer asks SprintVault to commit their pending on-disk changes (task scope only)
    if (typeof pendingMessage === 'string' && pendingMessage.trim()) {
      try {
        finalSha = git.commitScopeChanges(task.scopePaths, { name: dev.name, email: dev.email }, pendingMessage.trim());
      } catch (err: any) {
        throw reject(`Git commit failed: ${err.message}`);
      }
    }

    if (!finalSha) {
      const latest = git.latestCommit();
      if (!latest) {
        throw reject('No Git commits found in project repository');
      }
      finalSha = latest.sha;
    }

    const resolved = git.resolveCommit(finalSha);
    if (!resolved) {
      throw reject(`Commit '${finalSha}' does not exist in this project's repository`);
    }
    if (git.isServiceCommit(resolved)) {
      throw reject(`Commit ${resolved.substring(0, 7)} is a SprintVault bookkeeping commit, not your work`);
    }
    if (!git.isOnDefaultBranch(resolved)) {
      throw reject(`Commit ${resolved.substring(0, 7)} is not on branch '${project.defaultBranch}'${git.hasRemote() ? ' — push it to origin first' : ''}`);
    }

    const alreadyLinked = db.prepare(`
      SELECT task_id FROM tasks WHERE project_id = ? AND commit_sha = ? AND task_id != ?
    `).get(project.projectId, resolved, taskId) as { task_id: number } | undefined;
    if (alreadyLinked) {
      throw reject(`Commit ${resolved.substring(0, 7)} is already linked to Task #${alreadyLinked.task_id}`);
    }

    const lock = FileLock.findActiveByTaskId(taskId)!;
    const lockStartedAt = Math.floor(new Date(lock.acquiredAt).getTime() / 1000);
    if (git.commitTime(resolved) < lockStartedAt) {
      throw reject(`Commit ${resolved.substring(0, 7)} was made before work on this task started (${lock.acquiredAt})`);
    }

    task.complete(resolved);
    LockManager.release(taskId);
    ActivityLog.record(devId, ActionType.PUSH, resolved);

    WorkflowService.recordScrumChange(project.projectId, `complete task #${taskId} via ${resolved.substring(0, 7)}`);

    return {
      sha: resolved,
      status: TaskStatus.COMPLETED,
      message: `Task #${taskId} completed and linked to Git commit ${resolved.substring(0, 7)}`,
    };
  }

  /**
   * Flow 4.3: Push Work (messages 13–21)
   */
  static pushWork(
    taskId: number,
    devId: number,
    files: { path: string; content: string }[],
    msg: string
  ): { sha: string; status: TaskStatus } {
    const task = Task.findById(taskId);
    if (!task) {
      throw { type: 'rejectPush', reason: 'Task not found' };
    }

    const isOwner = LockManager.verifyOwner(taskId, devId);
    if (!isOwner) {
      throw { type: 'rejectPush', reason: 'Pusher does not own an active lock for this task' };
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw { type: 'rejectPush', reason: 'Task is not currently IN_PROGRESS' };
    }

    const project = Project.findById(task.projectId);
    if (!project) {
      throw { type: 'rejectPush', reason: 'Associated project not found' };
    }

    const dev = User.findById(devId);
    if (!dev) {
      throw { type: 'rejectPush', reason: 'Developer identity not found' };
    }

    const cleanFiles = validatePushFiles(files);
    const cleanMsg = requireText(msg, 'Commit message', 5000);

    let sha: string;
    try {
      sha = GitService.forProject(project).commitAndPush(cleanFiles, cleanMsg, {
        name: dev.name,
        email: dev.email,
      });
    } catch (err: any) {
      throw { type: 'rejectPush', reason: `Git commit and push failed: ${err.message}` };
    }

    task.complete(sha);
    LockManager.release(taskId);
    ActivityLog.record(devId, ActionType.PUSH, sha);

    WorkflowService.recordScrumChange(project.projectId, `complete task #${taskId} via ${sha.substring(0, 7)}`);

    return { sha, status: TaskStatus.COMPLETED };
  }

  /**
   * Flow 4.4: Force-release (UC-13, Manager only)
   */
  static forceRelease(taskId: number, managerId: number): void {
    WorkflowService.requireManager(managerId);

    const task = Task.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    if (task.status !== TaskStatus.IN_PROGRESS) {
      throw new Error('Task is not in IN_PROGRESS state');
    }

    LockManager.revoke(taskId);
    task.reset();
    ActivityLog.record(managerId, ActionType.FORCE_UNLOCK, taskId);

    WorkflowService.recordScrumChange(task.projectId, `force-release task #${taskId}`);
  }

  /**
   * Reads Git Commit Graph and maps Scrum tasks to commits
   */
  static getProjectCommitGraph(projectId: number): {
    nodes: GitGraphNode[];
    rawGraphText: string;
  } {
    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const { nodes, rawGraphText } = GitService.forProject(project).commitGraph(60);

    // Fetch all completed tasks with commit_sha for this project
    const tasksWithSha = db.prepare(`
      SELECT t.task_id, t.title, t.commit_sha, u.name as assignee_name
      FROM tasks t
      LEFT JOIN users u ON t.assignee_id = u.user_id
      WHERE t.project_id = ? AND t.commit_sha IS NOT NULL
    `).all(projectId) as unknown as Array<{
      task_id: number;
      title: string;
      commit_sha: string;
      assignee_name?: string;
    }>;

    const taskMap = new Map<string, { taskId: number; title: string; assigneeName?: string }>();
    for (const t of tasksWithSha) {
      taskMap.set(t.commit_sha, {
        taskId: t.task_id,
        title: t.title,
        assigneeName: t.assignee_name,
      });
    }

    // Attach linkedTask info to matching graph nodes
    const enrichedNodes = nodes.map((node) => {
      const match = taskMap.get(node.sha);
      return {
        ...node,
        linkedTask: match || undefined,
      };
    });

    return { nodes: enrichedNodes, rawGraphText };
  }

  /**
   * Reads .git directory and .scrum.json metadata
   */
  static getProjectGitMetadata(projectId: number): GitMetadata {
    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    return GitService.forProject(project).metadata();
  }

  /**
   * Flow 4.6: Dashboard (UC-12)
   */
  static getDashboard(userId: number) {
    const user = User.findById(userId);
    if (!user) {
      throw new Error('access denied');
    }

    const isManager = user.role === UserRole.MANAGER;
    const tasks = db.prepare(`
      SELECT t.*, p.name as project_name, u.name as assignee_name, u.email as assignee_email
      FROM tasks t
      JOIN projects p ON t.project_id = p.project_id
      LEFT JOIN users u ON t.assignee_id = u.user_id
      ${isManager ? '' : 'WHERE t.assignee_id = ?'}
      ORDER BY t.task_id DESC
    `).all(...(isManager ? [] : [userId])) as unknown as any[];

    // Same row shape for both roles (snake_case, as the client expects)
    const developerStats = db.prepare(`
      SELECT s.*, u.name, u.email
      FROM developer_stats s
      JOIN users u ON s.user_id = u.user_id
      ${isManager ? '' : 'WHERE s.user_id = ?'}
      ORDER BY s.tasks_completed DESC, s.push_count DESC
    `).all(...(isManager ? [] : [userId])) as unknown as any[];

    const activeLocks = db.prepare(`
      SELECT l.*, t.title as task_title, t.project_id, u.name as owner_name
      FROM file_locks l
      JOIN tasks t ON l.task_id = t.task_id
      JOIN users u ON l.owner_id = u.user_id
      WHERE l.status = 'ACTIVE' ${isManager ? '' : 'AND l.owner_id = ?'}
    `).all(...(isManager ? [] : [userId])) as unknown as any[];

    const recentActivity = isManager ? ActivityLog.findAll(30) : ActivityLog.findByUserId(userId, 30);

    return {
      role: user.role,
      user: { userId: user.userId, name: user.name, email: user.email, role: user.role },
      tasks,
      developerStats,
      activeLocks,
      recentActivity,
    };
  }
}
