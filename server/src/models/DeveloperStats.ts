import { db } from '../db/database';
import { ActionType, DeveloperStatsRow } from '../types';

export class DeveloperStats {
  public userId: number;
  public pushCount: number;
  public pullCount: number;
  public tasksCompleted: number;
  public lastActivityAt: string | null;

  constructor(
    userId: number,
    pushCount: number,
    pullCount: number,
    tasksCompleted: number,
    lastActivityAt: string | null
  ) {
    this.userId = userId;
    this.pushCount = pushCount;
    this.pullCount = pullCount;
    this.tasksCompleted = tasksCompleted;
    this.lastActivityAt = lastActivityAt;
  }

  static fromRow(row: DeveloperStatsRow): DeveloperStats {
    return new DeveloperStats(
      row.user_id,
      row.push_count,
      row.pull_count,
      row.tasks_completed,
      row.last_activity_at
    );
  }

  static findByUserId(userId: number): DeveloperStats | null {
    const row = db.prepare('SELECT * FROM developer_stats WHERE user_id = ?').get(userId) as DeveloperStatsRow | undefined;
    if (!row) return null;
    return DeveloperStats.fromRow(row);
  }

  static findAll(): DeveloperStats[] {
    const rows = db.prepare(`
      SELECT * FROM developer_stats
    `).all() as unknown as DeveloperStatsRow[];
    return rows.map((r) => DeveloperStats.fromRow(r));
  }

  static increment(userId: number, action: ActionType): void {
    const now = new Date().toISOString();

    // Ensure record exists
    db.prepare(`
      INSERT OR IGNORE INTO developer_stats (user_id, push_count, pull_count, tasks_completed, last_activity_at)
      VALUES (?, 0, 0, 0, ?)
    `).run(userId, now);

    switch (action) {
      case ActionType.LOCK:
        db.prepare(`
          UPDATE developer_stats
          SET last_activity_at = ?
          WHERE user_id = ?
        `).run(now, userId);
        break;

      case ActionType.PULL:
        db.prepare(`
          UPDATE developer_stats
          SET pull_count = pull_count + 1,
              last_activity_at = ?
          WHERE user_id = ?
        `).run(now, userId);
        break;

      case ActionType.PUSH:
        db.prepare(`
          UPDATE developer_stats
          SET push_count = push_count + 1,
              tasks_completed = tasks_completed + 1,
              last_activity_at = ?
          WHERE user_id = ?
        `).run(now, userId);
        break;

      case ActionType.FORCE_UNLOCK:
        // Actor is Manager; no developer counters change
        break;
    }
  }
}
