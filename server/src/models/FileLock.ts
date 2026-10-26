import { db } from '../db/database';
import { FileLockRow, LockStatus } from '../types';

// Comparison key for a repository path. Lower-cased because Windows and macOS checkouts treat
// 'SRC/Auth' and 'src/auth' as the same folder, so they must also be the same lock.
function normalizePrefix(p: string): string {
  return p
    .trim()
    .replace(/\\/g, '/')
    .split('/')
    .filter((s) => s !== '' && s !== '.')
    .join('/')
    .toLowerCase();
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

/**
 * True when filePath is the scope path itself or lies inside it (scope '/' covers the whole repository).
 */
export function pathInScope(filePath: string, scopePaths: string[]): boolean {
  const file = normalizePrefix(filePath);
  return scopePaths.some((scope) => {
    const s = normalizePrefix(scope);
    return s === '' || file === s || file.startsWith(s + '/');
  });
}

export class FileLock {
  public lockId: number;
  public taskId: number;
  public ownerId: number;
  public scopePaths: string[];
  public acquiredAt: string;
  public releasedAt: string | null;
  public status: LockStatus;
  public baseSha: string | null;

  constructor(
    lockId: number,
    taskId: number,
    ownerId: number,
    scopePaths: string[],
    acquiredAt: string,
    releasedAt: string | null,
    status: LockStatus,
    baseSha: string | null = null
  ) {
    this.baseSha = baseSha;
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
      row.status,
      row.base_sha
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
