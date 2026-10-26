import { db } from '../db/database';
import { GovernanceEventRow, GovernanceKind } from '../types';
import { ChangeFeed } from '../services/ChangeFeed';

type GovernanceEventWithNames = GovernanceEventRow & { user_name: string; task_title: string; project_name: string };

/**
 * Records every action a governance rule blocked (lock conflict, out-of-scope push)
 * and every lock a manager took back. Read by the dashboard metrics.
 */
export class GovernanceEvent {
  /**
   * With `since`, an identical event (same kind, user, task and detail) recorded at or after that time
   * is not counted again: retrying the same blocked action is one prevented conflict, not several.
   */
  static record(kind: GovernanceKind, userId: number, projectId: number, taskId: number, detail: string, since?: string): void {
    if (since) {
      const repeat = db.prepare(`
        SELECT 1 FROM governance_events
        WHERE kind = ? AND user_id = ? AND task_id = ? AND detail = ? AND created_at >= ?
        LIMIT 1
      `).get(kind, userId, taskId, detail, since);
      if (repeat) return;
    }
    db.prepare(`
      INSERT INTO governance_events (kind, user_id, project_id, task_id, detail, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(kind, userId, projectId, taskId, detail, new Date().toISOString());
    // Blocked actions change no Scrum state, but dashboards should still show them live
    ChangeFeed.bump();
  }

  /** Counts per kind, limited to the given projects (null = all projects). */
  static countsByKind(projectIds: number[] | null): Record<GovernanceKind, number> {
    const counts = {
      [GovernanceKind.LOCK_CONFLICT]: 0,
      [GovernanceKind.SCOPE_VIOLATION]: 0,
      [GovernanceKind.FORCE_RELEASE]: 0,
      [GovernanceKind.STALE_RELEASE]: 0,
    };
    const { clause, params } = projectFilter('project_id', projectIds);
    const rows = db.prepare(`
      SELECT kind, COUNT(*) as n FROM governance_events WHERE ${clause} GROUP BY kind
    `).all(...params) as unknown as Array<{ kind: GovernanceKind; n: number }>;
    for (const r of rows) counts[r.kind] = r.n;
    return counts;
  }

  static recent(projectIds: number[] | null, limit: number = 10): GovernanceEventWithNames[] {
    const { clause, params } = projectFilter('g.project_id', projectIds);
    return db.prepare(`
      SELECT g.*, u.name as user_name, t.title as task_title, p.name as project_name
      FROM governance_events g
      JOIN users u ON g.user_id = u.user_id
      JOIN tasks t ON g.task_id = t.task_id
      JOIN projects p ON g.project_id = p.project_id
      WHERE ${clause}
      ORDER BY g.event_id DESC
      LIMIT ?
    `).all(...params, limit) as unknown as GovernanceEventWithNames[];
  }
}

export function projectFilter(column: string, projectIds: number[] | null): { clause: string; params: number[] } {
  if (projectIds === null) return { clause: '1 = 1', params: [] };
  if (projectIds.length === 0) return { clause: '0 = 1', params: [] };
  return { clause: `${column} IN (${projectIds.map(() => '?').join(', ')})`, params: projectIds };
}
