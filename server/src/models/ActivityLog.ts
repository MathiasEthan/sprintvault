import { db } from '../db/database';
import { ActionType, ActivityLogRow, UserRole } from '../types';
import { DeveloperStats } from './DeveloperStats';
import { User } from './User';

// Project an activity belongs to: ref is a projectId (PULL), a commit SHA (PUSH) or a taskId (LOCK / FORCE_UNLOCK)
const PROJECT_ID_SQL = `
  CASE a.action
    WHEN 'PULL' THEN CAST(a.ref AS INTEGER)
    WHEN 'PUSH' THEN (SELECT t.project_id FROM tasks t WHERE t.commit_sha = a.ref LIMIT 1)
    ELSE (SELECT t.project_id FROM tasks t WHERE t.task_id = CAST(a.ref AS INTEGER))
  END`;

type ActivityRowWithUser = ActivityLogRow & { user_name: string; user_role: string; project_id: number | null };

export class ActivityLog {
  public logId: number;
  public userId: number;
  public action: ActionType;
  public ref: string;
  public createdAt: string;

  constructor(
    logId: number,
    userId: number,
    action: ActionType,
    ref: string,
    createdAt: string
  ) {
    this.logId = logId;
    this.userId = userId;
    this.action = action;
    this.ref = ref;
    this.createdAt = createdAt;
  }

  static fromRow(row: ActivityLogRow): ActivityLog {
    return new ActivityLog(
      row.log_id,
      row.user_id,
      row.action,
      row.ref,
      row.created_at
    );
  }

  static record(userId: number, action: ActionType, ref: string | number): ActivityLog {
    const now = new Date().toISOString();
    const refStr = String(ref);

    const res = db.prepare(`
      INSERT INTO activity_log (user_id, action, ref, created_at)
      VALUES (?, ?, ?, ?)
    `).run(userId, action, refStr, now);

    const logId = Number(res.lastInsertRowid);

    // Call DeveloperStats.increment(action) for acting developer
    const user = User.findById(userId);
    if (user && user.role === UserRole.DEVELOPER) {
      DeveloperStats.increment(userId, action);
    }

    return new ActivityLog(logId, userId, action, refStr, now);
  }

  static findAll(limit: number = 50): ActivityRowWithUser[] {
    const rows = db.prepare(`
      SELECT a.*, u.name as user_name, u.role as user_role, ${PROJECT_ID_SQL} as project_id
      FROM activity_log a
      JOIN users u ON a.user_id = u.user_id
      ORDER BY a.log_id DESC
      LIMIT ?
    `).all(limit) as unknown as ActivityRowWithUser[];
    return rows;
  }

  static findByUserId(userId: number, limit: number = 50): ActivityRowWithUser[] {
    const rows = db.prepare(`
      SELECT a.*, u.name as user_name, u.role as user_role, ${PROJECT_ID_SQL} as project_id
      FROM activity_log a
      JOIN users u ON a.user_id = u.user_id
      WHERE a.user_id = ?
      ORDER BY a.log_id DESC
      LIMIT ?
    `).all(userId, limit) as unknown as ActivityRowWithUser[];
    return rows;
  }

  static findByProjectId(projectId: number, limit: number = 50): ActivityRowWithUser[] {
    return db.prepare(`
      SELECT * FROM (
        SELECT a.*, u.name as user_name, u.role as user_role, ${PROJECT_ID_SQL} as project_id
        FROM activity_log a
        JOIN users u ON a.user_id = u.user_id
      )
      WHERE project_id = ?
      ORDER BY log_id DESC
      LIMIT ?
    `).all(projectId, limit) as unknown as ActivityRowWithUser[];
  }
}
