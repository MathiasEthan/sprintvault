import { db } from '../db/database';
import { FileLock, prefixOverlaps } from '../models/FileLock';
import { FileLockRow, LockStatus } from '../types';
import { ChangeFeed } from './ChangeFeed';

const DEFAULT_STALE_LOCK_HOURS = 24;
let lastStaleSignature: string | null = null;

export class LockManager {
  /**
   * A lock is stale when its owner has done nothing on the project (start or file download)
   * for STALE_LOCK_HOURS. Decimals are allowed, e.g. 0.05 = 3 minutes for a demo.
   */
  static staleAfterHours(): number {
    const hours = parseFloat(process.env.STALE_LOCK_HOURS || '');
    return Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_STALE_LOCK_HOURS;
  }

  /**
   * SQL for a lock's last activity: when it was acquired, or the owner's latest download
   * from the same project since then (ISO timestamps compare as text).
   */
  static lastActivitySql(lockAlias: string, taskAlias: string): string {
    return `MAX(${lockAlias}.acquired_at, COALESCE((
      SELECT MAX(a.created_at) FROM activity_log a
      WHERE a.user_id = ${lockAlias}.owner_id AND a.action = 'PULL' AND a.ref = CAST(${taskAlias}.project_id AS TEXT)
    ), ${lockAlias}.acquired_at))`;
  }

  static isStale(lastActivityAt: string | null | undefined, now: number = Date.now()): boolean {
    if (!lastActivityAt) return false;
    return now - new Date(lastActivityAt).getTime() > LockManager.staleAfterHours() * 3600 * 1000;
  }

  /**
   * Called on every change-feed poll: a lock turning stale changes no data, so bump the feed
   * when the set of stale locks changes and open boards refresh to show it.
   */
  static noticeStaleLocks(): void {
    const rows = db.prepare(`
      SELECT l.lock_id, ${LockManager.lastActivitySql('l', 't')} as last_activity_at
      FROM file_locks l JOIN tasks t ON l.task_id = t.task_id
      WHERE l.status = ?
    `).all(LockStatus.ACTIVE) as unknown as Array<{ lock_id: number; last_activity_at: string }>;
    const signature = rows
      .filter((r) => LockManager.isStale(r.last_activity_at))
      .map((r) => r.lock_id)
      .sort((a, b) => a - b)
      .join(',');
    if (lastStaleSignature !== null && signature !== lastStaleSignature) ChangeFeed.bump();
    lastStaleSignature = signature;
  }

  /** Last activity of the active lock on taskId, or null when the task holds no lock. */
  static lastActivity(taskId: number): string | null {
    const row = db.prepare(`
      SELECT ${LockManager.lastActivitySql('l', 't')} as last_activity_at
      FROM file_locks l JOIN tasks t ON l.task_id = t.task_id
      WHERE l.task_id = ? AND l.status = ?
    `).get(taskId, LockStatus.ACTIVE) as { last_activity_at: string } | undefined;
    return row?.last_activity_at ?? null;
  }

  /**
   * acquire(taskId, scope): Overlap check + lock insert in ONE database transaction.
   * Returns FileLock on success, or null on conflict.
   */
  static acquire(
    taskId: number,
    scope: string[],
    devId: number,
    baseSha: string | null = null
  ): { lock: FileLock | null; reason?: string; conflict?: boolean; blockingSince?: string } {
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
                conflict: true,
                blockingSince: row.acquired_at,
              };
            }
          }
        }
      }

      // 4. Insert active lock
      const now = new Date().toISOString();
      const scopeJson = JSON.stringify(scope);

      const res = db.prepare(`
        INSERT INTO file_locks (task_id, owner_id, scope_paths, acquired_at, released_at, status, base_sha)
        VALUES (?, ?, ?, ?, NULL, ?, ?)
      `).run(taskId, devId, scopeJson, now, LockStatus.ACTIVE, baseSha);

      db.exec('COMMIT');

      const lockId = Number(res.lastInsertRowid);
      const lock = new FileLock(lockId, taskId, devId, scope, now, null, LockStatus.ACTIVE, baseSha);
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
