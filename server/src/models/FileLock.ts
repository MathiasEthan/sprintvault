import { db } from '../db/database';
import { FileLockRow, LockStatus } from '../types';

function normalizePrefix(p: string): string {
  return p
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .join('/');
}

export function prefixOverlaps(p1: string, p2: string): boolean {
  // Normalize separators, './' and duplicate/leading/trailing slashes
  const norm1 = normalizePrefix(p1);
  const norm2 = normalizePrefix(p2);

  // Root or empty matches everything
  if (norm1 === '' || norm2 === '') return true;
  // Exact match
  if (norm1 === norm2) return true;
  // One contains the other as path directory or subpath
  if (norm1.startsWith(norm2 + '/')) return true;
  if (norm2.startsWith(norm1 + '/')) return true;

  return false;
}

export class FileLock {
  public lockId: number;
  public taskId: number;
  public ownerId: number;
  public scopePaths: string[];
  public acquiredAt: string;
  public releasedAt: string | null;
  public status: LockStatus;

  constructor(
    lockId: number,
    taskId: number,
    ownerId: number,
    scopePaths: string[],
    acquiredAt: string,
    releasedAt: string | null,
    status: LockStatus
  ) {
    this.lockId = lockId;
    this.taskId = taskId;
    this.ownerId = ownerId;
    this.scopePaths = scopePaths;
    this.acquiredAt = acquiredAt;
    this.releasedAt = releasedAt;
    this.status = status;
  }

  static fromRow(row: FileLockRow): FileLock {
    let scopePaths: string[] = [];
    try {
      scopePaths = JSON.parse(row.scope_paths);
    } catch {
      scopePaths = [];
    }
    return new FileLock(
      row.lock_id,
      row.task_id,
      row.owner_id,
      scopePaths,
      row.acquired_at,
      row.released_at,
      row.status
    );
  }

  static findActiveByTaskId(taskId: number): FileLock | null {
    const row = db.prepare(`
      SELECT * FROM file_locks
      WHERE task_id = ? AND status = ?
      LIMIT 1
    `).get(taskId, LockStatus.ACTIVE) as FileLockRow | undefined;
    if (!row) return null;
    return FileLock.fromRow(row);
  }

  static findAllActive(): FileLock[] {
    const rows = db.prepare(`
      SELECT * FROM file_locks
      WHERE status = ?
    `).all(LockStatus.ACTIVE) as unknown as FileLockRow[];
    return rows.map((r) => FileLock.fromRow(r));
  }

  overlaps(paths: string[]): boolean {
    for (const p1 of this.scopePaths) {
      for (const p2 of paths) {
        if (prefixOverlaps(p1, p2)) {
          return true;
        }
      }
    }
    return false;
  }

  isActive(): boolean {
    return this.status === LockStatus.ACTIVE;
  }
}
