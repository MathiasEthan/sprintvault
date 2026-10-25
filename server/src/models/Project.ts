import { db } from '../db/database';
import { ProjectRow, TaskRow } from '../types';
import { Task } from './Task';

export class Project {
  public projectId: number;
  public name: string;
  public repoUrl: string;
  public defaultBranch: string;
  public createdBy: number;

  constructor(
    projectId: number,
    name: string,
    repoUrl: string,
    defaultBranch: string,
    createdBy: number
  ) {
    this.projectId = projectId;
    this.name = name;
    this.repoUrl = repoUrl;
    this.defaultBranch = defaultBranch;
    this.createdBy = createdBy;
  }

  static fromRow(row: ProjectRow): Project {
    return new Project(
      row.project_id,
      row.name,
      row.repo_url,
      row.default_branch,
      row.created_by
    );
  }

  static findById(projectId: number): Project | null {
    const row = db.prepare('SELECT * FROM projects WHERE project_id = ?').get(projectId) as ProjectRow | undefined;
    if (!row) return null;
    return Project.fromRow(row);
  }

  static findAll(): Project[] {
    const rows = db.prepare('SELECT * FROM projects ORDER BY project_id DESC').all() as unknown as ProjectRow[];
    return rows.map((r) => Project.fromRow(r));
  }

  addMember(devId: number): void {
    db.prepare(`
      INSERT OR IGNORE INTO project_members (project_id, user_id)
      VALUES (?, ?)
    `).run(this.projectId, devId);
  }

  removeMember(devId: number): void {
    db.prepare(`
      DELETE FROM project_members
      WHERE project_id = ? AND user_id = ?
    `).run(this.projectId, devId);
  }

  isMember(devId: number): boolean {
    const row = db.prepare(`
      SELECT 1 FROM project_members
      WHERE project_id = ? AND user_id = ?
    `).get(this.projectId, devId);
    return !!row;
  }

  getMembers(): number[] {
    const rows = db.prepare(`
      SELECT user_id FROM project_members
      WHERE project_id = ?
    `).all(this.projectId) as unknown as { user_id: number }[];
    return rows.map((r) => r.user_id);
  }

  getTasks(): Task[] {
    const rows = db.prepare(`
      SELECT * FROM tasks
      WHERE project_id = ?
      ORDER BY task_id ASC
    `).all(this.projectId) as unknown as TaskRow[];
    return rows.map((r) => Task.fromRow(r));
  }
}
