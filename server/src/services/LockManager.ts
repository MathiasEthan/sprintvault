import { db } from '../db/database';
import { FileLock, prefixOverlaps } from '../models/FileLock';
import { FileLockRow, LockStatus } from '../types';

export class LockManager {
  /**
   * acquire(taskId, scope): Overlap check + lock insert in ONE database transaction.
   * Returns FileLock on success, or null on conflict.
   */
  static acquire(taskId: number, scope: string[], devId: number): { lock: FileLock | null; reason?: string } {
    db.exec('BEGIN IMMEDIATE');
    try {
      // 1. Check if this task already has an active lock
      const existingTaskLock = db.prepare(`
        SELECT * FROM file_locks
        WHERE task_id = ? AND status = ?
      `).get(taskId, LockStatus.ACTIVE) as FileLockRow | undefined;

      if (existingTaskLock) {
        db.exec('ROLLBACK');
        return { lock: null, reason: 'Task already has an active lock' };
      }

      // 2. Fetch all currently active locks in the same project (scopes are paths within one repository)
      const activeRows = db.prepare(`
        SELECT fl.* FROM file_locks fl
        JOIN tasks t ON fl.task_id = t.task_id
        WHERE fl.status = ?
          AND t.project_id = (SELECT project_id FROM tasks WHERE task_id = ?)
      `).all(LockStatus.ACTIVE, taskId) as unknown as FileLockRow[];

      // 3. Overlap check against all active locks
      for (const row of activeRows) {
        let activePaths: string[] = [];
        try {
          activePaths = JSON.parse(row.scope_paths);
        } catch {
          activePaths = [];
        }

        for (const p1 of scope) {
          for (const p2 of activePaths) {
            if (prefixOverlaps(p1, p2)) {
              db.exec('ROLLBACK');
              return {
                lock: null,
                reason: `Scope path '${p1}' overlaps with active lock on path '${p2}' (Task #${row.task_id})`,
              };
            }
          }
        }
      }

      // 4. Insert active lock
      const now = new Date().toISOString();
      const scopeJson = JSON.stringify(scope);

      const res = db.prepare(`
        INSERT INTO file_locks (task_id, owner_id, scope_paths, acquired_at, released_at, status)
        VALUES (?, ?, ?, ?, NULL, ?)
      `).run(taskId, devId, scopeJson, now, LockStatus.ACTIVE);

      db.exec('COMMIT');

      const lockId = Number(res.lastInsertRowid);
      const lock = new FileLock(lockId, taskId, devId, scope, now, null, LockStatus.ACTIVE);
      return { lock };
    } catch (err: any) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Ignored
      }
      return { lock: null, reason: err.message || 'Database transaction failed' };
    }
  }

  /**
   * verifyOwner(taskId, devId): Verifies that developer devId owns the active lock on taskId.
   */
  static verifyOwner(taskId: number, devId: number): boolean {
    const row = db.prepare(`
      SELECT 1 FROM file_locks
      WHERE task_id = ? AND owner_id = ? AND status = ?
      LIMIT 1
    `).get(taskId, devId, LockStatus.ACTIVE);

    return !!row;
  }

  /**
   * release(taskId): Marks the active lock on taskId as RELEASED.
   */
  static release(taskId: number): boolean {
    const now = new Date().toISOString();
    const res = db.prepare(`
      UPDATE file_locks
      SET status = ?, released_at = ?
      WHERE task_id = ? AND status = ?
    `).run(LockStatus.RELEASED, now, taskId, LockStatus.ACTIVE);

    return res.changes > 0;
  }

  /**
   * revoke(taskId): Marks the active lock on taskId as REVOKED (for Manager force-release).
   */
  static revoke(taskId: number): boolean {
    const now = new Date().toISOString();
    const res = db.prepare(`
      UPDATE file_locks
      SET status = ?, released_at = ?
      WHERE task_id = ? AND status = ?
    `).run(LockStatus.REVOKED, now, taskId, LockStatus.ACTIVE);

    return res.changes > 0;
  }
}
