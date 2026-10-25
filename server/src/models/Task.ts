import { db } from '../db/database';
import { TaskRow, TaskStatus } from '../types';

export class Task {
  public taskId: number;
  public projectId: number;
  public title: string;
  public scopePaths: string[];
  public status: TaskStatus;
  public assigneeId: number | null;
  public commitSha: string | null;
  public completedAt: string | null;

  constructor(
    taskId: number,
    projectId: number,
    title: string,
    scopePaths: string[],
    status: TaskStatus,
    assigneeId: number | null = null,
    commitSha: string | null = null,
    completedAt: string | null = null
  ) {
    this.taskId = taskId;
    this.projectId = projectId;
    this.title = title;
    this.scopePaths = scopePaths;
    this.status = status;
    this.assigneeId = assigneeId;
    this.commitSha = commitSha;
    this.completedAt = completedAt;
  }

  static fromRow(row: TaskRow): Task {
    let scopePaths: string[] = [];
    try {
      scopePaths = JSON.parse(row.scope_paths);
    } catch {
      scopePaths = [];
    }
    return new Task(
      row.task_id,
      row.project_id,
      row.title,
      scopePaths,
      row.status,
      row.assignee_id,
      row.commit_sha,
      row.completed_at
    );
  }

  static findById(taskId: number): Task | null {
    const row = db.prepare('SELECT * FROM tasks WHERE task_id = ?').get(taskId) as TaskRow | undefined;
    if (!row) return null;
    return Task.fromRow(row);
  }

  isAssignedTo(devId: number): boolean {
    return this.assigneeId === devId;
  }

  assign(devId: number): void {
    this.assigneeId = devId;
    this.status = TaskStatus.ASSIGNED;
    db.prepare('UPDATE tasks SET assignee_id = ?, status = ? WHERE task_id = ?').run(
      devId,
      TaskStatus.ASSIGNED,
      this.taskId
    );
  }

  start(): void {
    this.status = TaskStatus.IN_PROGRESS;
    db.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run(
      TaskStatus.IN_PROGRESS,
      this.taskId
    );
  }

  complete(sha: string): void {
    const now = new Date().toISOString();
    this.status = TaskStatus.COMPLETED;
    this.commitSha = sha;
    this.completedAt = now;
    db.prepare('UPDATE tasks SET status = ?, commit_sha = ?, completed_at = ? WHERE task_id = ?').run(
      TaskStatus.COMPLETED,
      sha,
      now,
      this.taskId
    );
  }

  reset(): void {
    this.status = TaskStatus.ASSIGNED;
    db.prepare('UPDATE tasks SET status = ? WHERE task_id = ?').run(
      TaskStatus.ASSIGNED,
      this.taskId
    );
  }
}
