import { db } from '../db/database';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { FileLock } from '../models/FileLock';
import { ActivityLog } from '../models/ActivityLog';
import { DeveloperStats } from '../models/DeveloperStats';
import { User } from '../models/User';
import { LockManager } from './LockManager';
import { GitService } from './GitService';
import { GitHost } from './GitHost';
import { ScrumFileService } from './ScrumFileService';
import { ActionType, GitFileItem, TaskStatus, UserRole, GitGraphNode, GitMetadata } from '../types';

export class WorkflowService {
  /**
   * UC-02: createProject (Manager only)
   */
  static createProject(
    name: string,
    repoUrl: string,
    defaultBranch: string = 'main',
    createdBy: number,
    initialMemberIds: number[] = [],
    customPath?: string
  ): Project {
    const user = User.findById(createdBy);
    if (!user || user.role !== UserRole.MANAGER) {
      throw new Error('access denied');
    }

    const res = db.prepare(`
      INSERT INTO projects (name, repo_url, default_branch, created_by)
      VALUES (?, ?, ?, ?)
    `).run(name, repoUrl, defaultBranch, createdBy);

    const projectId = Number(res.lastInsertRowid);
    const project = new Project(projectId, name, repoUrl, defaultBranch, createdBy);

    const repoPath = customPath || GitService.getProjectRepoPath(projectId);
    GitHost.ensureRepo(repoPath, defaultBranch, [
      {
        path: 'README.md',
        content: `# ${name}\n\nManaged by SprintVault Scrum App.\n`,
      },
      {
        path: 'src/main.ts',
        content: `// Entry point for ${name}\nconsole.log('SprintVault project active.');\n`,
      },
      {
        path: 'src/auth/auth.ts',
        content: `// Authentication module\nexport function verifyToken(token: string) {\n  return token.length > 0;\n}\n`,
      },
    ]);

    // Add initial project members
    if (initialMemberIds && initialMemberIds.length > 0) {
      for (const devId of initialMemberIds) {
        project.addMember(devId);
      }
    }

    // Sync .scrum.json in project root
    ScrumFileService.syncProjectScrumFile(projectId, repoPath);

    return project;
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
    const user = User.findById(createdBy);
    if (!user || user.role !== UserRole.MANAGER) {
      throw new Error('access denied');
    }

    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const scopeJson = JSON.stringify(scopePaths);
    const res = db.prepare(`
      INSERT INTO tasks (project_id, title, scope_paths, status, assignee_id, commit_sha, completed_at)
      VALUES (?, ?, ?, ?, NULL, NULL, NULL)
    `).run(projectId, title, scopeJson, TaskStatus.CREATED);

    const taskId = Number(res.lastInsertRowid);
    const task = new Task(taskId, projectId, title, scopePaths, TaskStatus.CREATED);

    // Sync .scrum.json
    const repoPath = GitService.getProjectRepoPath(projectId);
    ScrumFileService.syncProjectScrumFile(projectId, repoPath);

    return task;
  }

  /**
   * UC-04: assignTask (Manager only)
   */
  static assignTask(taskId: number, devId: number, managerId: number): Task {
    const user = User.findById(managerId);
    if (!user || user.role !== UserRole.MANAGER) {
      throw new Error('access denied');
    }

    const task = Task.findById(taskId);
    if (!task) {
      throw new Error('Task not found');
    }

    const project = Project.findById(task.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (!project.isMember(devId)) {
      throw new Error('Developer is not a member of this project');
    }

    task.assign(devId);

    // Sync .scrum.json
    const repoPath = GitService.getProjectRepoPath(project.projectId);
    ScrumFileService.syncProjectScrumFile(project.projectId, repoPath);

    return task;
  }

  /**
   * UC-05: browseFiles (Read-only)
   */
  static browseFiles(projectId: number, branch?: string, scope?: string[]): GitFileItem[] {
    const project = Project.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    const repoPath = GitService.getProjectRepoPath(projectId);
    const gitService = new GitService(repoPath, branch || project.defaultBranch);
    return gitService.fetch(scope || []);
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

    // Sync .scrum.json
    const repoPath = GitService.getProjectRepoPath(task.projectId);
    ScrumFileService.syncProjectScrumFile(task.projectId, repoPath);

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

    const repoPath = GitService.getProjectRepoPath(projectId);
    const gitService = new GitService(repoPath, project.defaultBranch);

    const snapshot = gitService.fetch(scope);
    ActivityLog.record(devId, ActionType.PULL, projectId);

    return { snapshot };
  }

  /**
   * Commit Done action:
   * Developer works locally in their own IDE/terminal.
   * When they click "Commit Done", SprintVault reads the Git commit from the project repository,
   * verifies lock ownership, links the SHA, marks task COMPLETED, releases lock, and syncs .scrum.json!
   */
  static commitDone(
    taskId: number,
    devId: number,
    commitSha?: string,
    pendingMessage?: string
  ): { sha: string; status: TaskStatus; message: string } {
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

    const repoPath = GitService.getProjectRepoPath(project.projectId);

    let finalSha = commitSha?.trim();

    // If developer wants to commit pending local changes from disk
    if (pendingMessage && pendingMessage.trim()) {
      try {
        finalSha = GitHost.commitPendingChanges(
          repoPath,
          { name: dev.name, email: dev.email },
          pendingMessage.trim()
        );
      } catch (err: any) {
        throw { type: 'rejectPush', reason: `Git commit failed: ${err.message}` };
      }
    }

    // If no SHA provided or produced, read latest commit from HEAD
    if (!finalSha) {
      const latest = GitHost.getLatestCommit(repoPath);
      if (!latest) {
        throw { type: 'rejectPush', reason: 'No Git commits found in project repository' };
      }
      finalSha = latest.sha;
    }

    // 1. Task.complete(sha) - status = COMPLETED, commitSha, completedAt
    task.complete(finalSha);

    // 2. LockManager.release(taskId) - lock = RELEASED
    LockManager.release(taskId);

    // 3. ActivityLog.record(PUSH, sha) - pushCount += 1, tasksCompleted += 1
    ActivityLog.record(devId, ActionType.PUSH, finalSha);

    // 4. Sync .scrum.json in project root
    ScrumFileService.syncProjectScrumFile(project.projectId, repoPath);

    return {
      sha: finalSha,
      status: TaskStatus.COMPLETED,
      message: `Task #${taskId} completed and linked to Git commit ${finalSha.substring(0, 7)}`,
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

    const repoPath = GitService.getProjectRepoPath(project.projectId);
    const gitService = new GitService(repoPath, project.defaultBranch);

    let sha: string;
    try {
      sha = gitService.commitAndPush(files, msg, {
        name: dev.name,
        email: dev.email,
      });
    } catch (err: any) {
      throw { type: 'rejectPush', reason: `Git commit and push failed: ${err.message}` };
    }

    task.complete(sha);
    LockManager.release(taskId);
    ActivityLog.record(devId, ActionType.PUSH, sha);

    // Sync .scrum.json
    ScrumFileService.syncProjectScrumFile(project.projectId, repoPath);

    return { sha, status: TaskStatus.COMPLETED };
  }

  /**
   * Flow 4.4: Force-release (UC-13, Manager only)
   */
  static forceRelease(taskId: number, managerId: number): void {
    const user = User.findById(managerId);
    if (!user || user.role !== UserRole.MANAGER) {
      throw new Error('access denied');
    }

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

    // Sync .scrum.json
    const repoPath = GitService.getProjectRepoPath(task.projectId);
    ScrumFileService.syncProjectScrumFile(task.projectId, repoPath);
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

    const repoPath = GitService.getProjectRepoPath(projectId);
    const { nodes, rawGraphText } = GitHost.getCommitGraph(repoPath, 60);

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

    const repoPath = GitService.getProjectRepoPath(projectId);
    return GitHost.getGitMetadata(repoPath);
  }

  /**
   * Flow 4.6: Dashboard (UC-12)
   */
  static getDashboard(userId: number) {
    const user = User.findById(userId);
    if (!user) {
      throw new Error('access denied');
    }

    if (user.role === UserRole.MANAGER) {
      const tasks = db.prepare(`
        SELECT t.*, p.name as project_name, u.name as assignee_name, u.email as assignee_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.project_id
        LEFT JOIN users u ON t.assignee_id = u.user_id
        ORDER BY t.task_id DESC
      `).all() as unknown as any[];

      const developerStats = db.prepare(`
        SELECT s.*, u.name, u.email
        FROM developer_stats s
        JOIN users u ON s.user_id = u.user_id
        ORDER BY s.tasks_completed DESC, s.push_count DESC
      `).all() as unknown as any[];

      const activeLocks = db.prepare(`
        SELECT l.*, t.title as task_title, u.name as owner_name
        FROM file_locks l
        JOIN tasks t ON l.task_id = t.task_id
        JOIN users u ON l.owner_id = u.user_id
        WHERE l.status = 'ACTIVE'
      `).all() as unknown as any[];

      const recentActivity = ActivityLog.findAll(30);

      return {
        role: UserRole.MANAGER,
        user: { userId: user.userId, name: user.name, email: user.email, role: user.role },
        tasks,
        developerStats,
        activeLocks,
        recentActivity,
      };
    } else {
      const tasks = db.prepare(`
        SELECT t.*, p.name as project_name, u.name as assignee_name, u.email as assignee_email
        FROM tasks t
        JOIN projects p ON t.project_id = p.project_id
        LEFT JOIN users u ON t.assignee_id = u.user_id
        WHERE t.assignee_id = ?
        ORDER BY t.task_id DESC
      `).all(userId) as unknown as any[];

      const stats = DeveloperStats.findByUserId(userId);

      const activeLocks = db.prepare(`
        SELECT l.*, t.title as task_title, u.name as owner_name
        FROM file_locks l
        JOIN tasks t ON l.task_id = t.task_id
        JOIN users u ON l.owner_id = u.user_id
        WHERE l.owner_id = ? AND l.status = 'ACTIVE'
      `).all(userId) as unknown as any[];

      const recentActivity = ActivityLog.findByUserId(userId, 30);

      return {
        role: UserRole.DEVELOPER,
        user: { userId: user.userId, name: user.name, email: user.email, role: user.role },
        tasks,
        developerStats: stats ? [{ ...stats, name: user.name, email: user.email }] : [],
        activeLocks,
        recentActivity,
      };
    }
  }
}
