import fs from 'fs';
import path from 'path';
import { db } from '../db/database';
import { Project } from '../models/Project';
import { Task } from '../models/Task';
import { FileLock } from '../models/FileLock';
import { TaskRow, FileLockRow, ActivityLogRow, LockStatus } from '../types';

export interface ScrumFileData {
  schemaVersion: string;
  projectId: number;
  projectName: string;
  repoUrl: string;
  defaultBranch: string;
  lastSyncedAt: string;
  members: Array<{ userId: number; name: string; email: string; role: string }>;
  tasks: Array<{
    taskId: number;
    title: string;
    scopePaths: string[];
    status: string;
    assigneeId: number | null;
    assigneeName?: string;
    commitSha: string | null;
    completedAt: string | null;
  }>;
  activeLocks: Array<{
    lockId: number;
    taskId: number;
    ownerId: number;
    ownerName?: string;
    scopePaths: string[];
    acquiredAt: string;
  }>;
  recentActivity: Array<{
    logId: number;
    userName: string;
    action: string;
    ref: string;
    createdAt: string;
  }>;
}

export class ScrumFileService {
  public static SCRUM_FILE_NAME = '.scrum.json';

  /**
   * Returns the absolute path to the project's .scrum.json file.
   */
  static getScrumFilePath(repoPath: string): string {
    return path.join(repoPath, this.SCRUM_FILE_NAME);
  }

  /**
   * Syncs the current database state of a project to its local .scrum.json file.
   */
  static syncProjectScrumFile(projectId: number, repoPath: string): void {
    try {
      if (!fs.existsSync(repoPath)) {
        fs.mkdirSync(repoPath, { recursive: true });
      }

      const project = Project.findById(projectId);
      if (!project) return;

      const members = db.prepare(`
        SELECT u.user_id as userId, u.name, u.email, u.role
        FROM project_members pm
        JOIN users u ON pm.user_id = u.user_id
        WHERE pm.project_id = ?
      `).all(projectId) as unknown as Array<{ userId: number; name: string; email: string; role: string }>;

      const taskRows = db.prepare(`
        SELECT t.*, u.name as assignee_name
        FROM tasks t
        LEFT JOIN users u ON t.assignee_id = u.user_id
        WHERE t.project_id = ?
        ORDER BY t.task_id ASC
      `).all(projectId) as unknown as Array<TaskRow & { assignee_name?: string }>;

      const tasks = taskRows.map((r) => {
        let scopes: string[] = [];
        try {
          scopes = JSON.parse(r.scope_paths);
        } catch {
          scopes = [];
        }
        return {
          taskId: r.task_id,
          title: r.title,
          scopePaths: scopes,
          status: r.status,
          assigneeId: r.assignee_id,
          assigneeName: r.assignee_name || undefined,
          commitSha: r.commit_sha,
          completedAt: r.completed_at,
        };
      });

      const lockRows = db.prepare(`
        SELECT fl.*, u.name as owner_name
        FROM file_locks fl
        JOIN tasks t ON fl.task_id = t.task_id
        JOIN users u ON fl.owner_id = u.user_id
        WHERE t.project_id = ? AND fl.status = ?
      `).all(projectId, LockStatus.ACTIVE) as unknown as Array<FileLockRow & { owner_name?: string }>;

      const activeLocks = lockRows.map((l) => {
        let scopes: string[] = [];
        try {
          scopes = JSON.parse(l.scope_paths);
        } catch {
          scopes = [];
        }
        return {
          lockId: l.lock_id,
          taskId: l.task_id,
          ownerId: l.owner_id,
          ownerName: l.owner_name,
          scopePaths: scopes,
          acquiredAt: l.acquired_at,
        };
      });

      const activityRows = db.prepare(`
        SELECT a.log_id as logId, u.name as userName, a.action, a.ref, a.created_at as createdAt
        FROM activity_log a
        JOIN users u ON a.user_id = u.user_id
        ORDER BY a.log_id DESC
        LIMIT 30
      `).all() as unknown as Array<{ logId: number; userName: string; action: string; ref: string; createdAt: string }>;

      const scrumData: ScrumFileData = {
        schemaVersion: '1.0',
        projectId: project.projectId,
        projectName: project.name,
        repoUrl: project.repoUrl,
        defaultBranch: project.defaultBranch,
        lastSyncedAt: new Date().toISOString(),
        members,
        tasks,
        activeLocks,
        recentActivity: activityRows,
      };

      const filePath = this.getScrumFilePath(repoPath);
      fs.writeFileSync(filePath, JSON.stringify(scrumData, null, 2), 'utf8');
    } catch (err) {
      console.error('Failed to sync .scrum.json:', err);
    }
  }

  /**
   * Reads .scrum.json if it exists in the given directory.
   */
  static readProjectScrumFile(repoPath: string): ScrumFileData | null {
    const filePath = this.getScrumFilePath(repoPath);
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as ScrumFileData;
    } catch (err) {
      console.error('Error reading .scrum.json:', err);
      return null;
    }
  }
}
