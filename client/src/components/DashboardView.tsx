import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { TaskStatus, UserRole, ActionType, GovernanceKind, GovernanceMetrics } from '../types';
import { Button, Code, displayScope, PageHeader, Spinner } from './ui';

interface DashboardViewProps {
  onOpenCommitDetails: (sha: string, projectId?: number | null) => void;
  refreshKey?: number;
}

const STATES: { status: TaskStatus; label: string; bar: string }[] = [
  { status: TaskStatus.CREATED, label: 'Backlog', bar: 'bg-slate-700' },
  { status: TaskStatus.ASSIGNED, label: 'Assigned', bar: 'bg-slate-500' },
  { status: TaskStatus.IN_PROGRESS, label: 'In progress', bar: 'bg-amber-400' },
  { status: TaskStatus.COMPLETED, label: 'Done', bar: 'bg-blue-500' },
];

function when(iso: string): string {
  return new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function hours(h: number | null | undefined): string {
  if (h === null || h === undefined) return '—';
  if (h < 1) return `${Math.max(1, Math.round(h * 60))}m`;
  return h < 48 ? `${h.toFixed(1)}h` : `${(h / 24).toFixed(1)}d`;
}

const EVENT_LABEL: Record<GovernanceKind, { text: string; tone: string }> = {
  LOCK_CONFLICT: { text: 'Lock conflict blocked', tone: 'text-amber-300' },
  SCOPE_VIOLATION: { text: 'Out-of-scope change blocked', tone: 'text-rose-300' },
  STALE_RELEASE: { text: 'Stale lock released', tone: 'text-slate-300' },
  FORCE_RELEASE: { text: 'Lock released by lead', tone: 'text-slate-300' },
};

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenCommitDetails, refreshKey }) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const isManager = currentUser?.role === UserRole.MANAGER;

  const loadDashboard = async (background = false) => {
    if (!background) setLoading(true);
    try {
      setData(await api.getDashboard());
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [currentUser?.userId]);

  // Live refresh when someone changes the Scrum (no spinner)
  useEffect(() => {
    if (refreshKey) loadDashboard(true);
  }, [refreshKey]);

  if (loading || !data) return <Spinner label="Loading team activity…" />;

  const { tasks, developerStats, activeLocks, recentActivity } = data;
  const metrics: GovernanceMetrics = data.metrics;
  const total = tasks.length;

  // What the governance rules did: the numbers that show the tool works
  const figures: { label: string; value: string; hint: string; tone?: string }[] = [
    { label: 'Conflicts prevented', value: String(metrics.conflictsPrevented), hint: 'Starts refused because the code was already locked', tone: 'text-amber-300' },
    { label: 'Out-of-scope changes blocked', value: String(metrics.scopeViolationsBlocked), hint: "Pushes or commits touching files outside the task's scope", tone: 'text-rose-300' },
    {
      label: 'Stale locks',
      value: `${metrics.staleLocks} open · ${metrics.staleLocksReleased} released`,
      hint: `Locks idle for more than ${hours(metrics.staleAfterHours)}`,
    },
    { label: 'Avg. cycle time', value: hours(metrics.avgCycleHours), hint: 'From starting a task to finishing it' },
    { label: 'Done this week', value: String(metrics.completedThisWeek), hint: 'Tasks completed in the last 7 days' },
  ];

  const describe = (log: any) => {
    const who = log.user_id === currentUser?.userId ? 'You' : log.user_name;
    switch (log.action) {
      case ActionType.LOCK:
        return <>{who} started task #{log.ref} and locked its scope</>;
      case ActionType.PULL:
        return <>{who} downloaded files from project #{log.ref}</>;
      case ActionType.FORCE_UNLOCK:
        return <>{who} released the lock on task #{log.ref}</>;
      case ActionType.PUSH:
        return (
          <>
            {who} finished a task in{' '}
            <button
              onClick={() => onOpenCommitDetails(log.ref, log.project_id)}
              className="font-mono text-[12px] text-blue-300 underline decoration-slate-600 underline-offset-2 hover:decoration-blue-300"
            >
              {String(log.ref).substring(0, 7)}
            </button>
          </>
        );
      default:
        return <>{who}: {log.action}</>;
    }
  };

  return (
    <div>
      <PageHeader
        title={isManager ? 'Team' : 'Your work'}
        meta={<span>{total === 0 ? 'No tasks yet.' : `${total} ${total === 1 ? 'task' : 'tasks'} across all projects`}</span>}
        actions={<Button onClick={() => loadDashboard()}>Refresh</Button>}
      />

      {/* Where the work is: one proportional bar instead of stat tiles */}
      {total > 0 && (
        <section aria-label="Task states" className="mb-10">
          <div className="flex h-2 overflow-hidden rounded-sm bg-slate-900">
            {STATES.map((s) => {
              const n = tasks.filter((t: any) => t.status === s.status).length;
              return n ? <div key={s.status} className={s.bar} style={{ width: `${(n / total) * 100}%` }} /> : null;
            })}
          </div>
          <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
            {STATES.map((s) => (
              <div key={s.status} className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-sm ${s.bar}`} />
                <dt className="text-slate-400">{s.label}</dt>
                <dd className="tabular font-semibold text-slate-100">{tasks.filter((t: any) => t.status === s.status).length}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-label="Governance metrics" className="mb-10">
        <h2 className="mb-3 text-base font-semibold text-slate-100">What the rules caught</h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-slate-800 bg-slate-800 md:grid-cols-3 xl:grid-cols-5">
          {figures.map((f) => (
            <div key={f.label} className="bg-black px-4 py-3">
              <dt className="text-xs text-slate-400">{f.label}</dt>
              <dd className={`tabular mt-1 text-xl font-semibold ${f.tone || 'text-slate-50'}`}>{f.value}</dd>
              <dd className="mt-1 text-xs leading-snug text-slate-600">{f.hint}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="grid gap-10 lg:grid-cols-5">
        <div className="space-y-10 lg:col-span-3">
          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-100">Locked code</h2>
            {activeLocks.length === 0 ? (
              <p className="text-sm text-slate-500">Nobody holds a lock. Every scope is free to start.</p>
            ) : (
              <ul className="divide-y divide-slate-800 border-y border-slate-800">
                {activeLocks.map((lock: any) => {
                  let scope: string[] = [];
                  try {
                    scope = JSON.parse(lock.scope_paths);
                  } catch {
                    scope = [];
                  }
                  return (
                    <li
                      key={lock.lock_id}
                      className={`flex flex-col gap-1 border-l-[3px] py-3 pl-3 sm:flex-row sm:items-baseline sm:justify-between ${lock.is_stale ? 'border-l-rose-500' : 'border-l-amber-400'}`}
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-slate-100">
                          <span className="text-slate-500">#{lock.task_id}</span> {lock.task_title}
                        </p>
                        <p className="mt-0.5 flex flex-wrap gap-x-3">
                          {scope.map((p) => (
                            <Code key={p} className="text-slate-400">
                              {displayScope(p)}
                            </Code>
                          ))}
                        </p>
                      </div>
                      <p className={`shrink-0 text-xs ${lock.is_stale ? 'text-rose-300' : 'text-amber-300'}`}>
                        {lock.owner_name}, since {when(lock.acquired_at)}
                        {lock.is_stale && <span className="block sm:text-right">Stale, last active {when(lock.last_activity_at)}</span>}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-slate-100">{isManager ? 'Developers' : 'Your counters'}</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left text-xs text-slate-500">
                    <th className="py-2 pr-4 font-normal">Name</th>
                    <th className="py-2 pr-4 text-right font-normal">Finished</th>
                    <th className="py-2 pr-4 text-right font-normal">Pushes</th>
                    <th className="py-2 pr-4 text-right font-normal">Downloads</th>
                    <th className="py-2 pr-4 text-right font-normal">Avg. cycle</th>
                    <th className="py-2 text-right font-normal">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {developerStats.map((s: any) => (
                    <tr key={s.user_id}>
                      <td className="py-2.5 pr-4 text-slate-100">{s.name}</td>
                      <td className="tabular py-2.5 pr-4 text-right font-semibold text-slate-50">{s.tasks_completed}</td>
                      <td className="tabular py-2.5 pr-4 text-right text-slate-300">{s.push_count}</td>
                      <td className="tabular py-2.5 pr-4 text-right text-slate-300">{s.pull_count}</td>
                      <td className="tabular py-2.5 pr-4 text-right text-slate-300">{hours(s.avg_cycle_hours)}</td>
                      <td className="py-2.5 text-right text-xs text-slate-500">{s.last_activity_at ? when(s.last_activity_at) : 'Not yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="space-y-10 lg:col-span-2">
        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-100">Blocked and overridden</h2>
          {metrics.recentEvents.length === 0 ? (
            <p className="text-sm text-slate-500">No rule has had to step in yet.</p>
          ) : (
            <ol className="space-y-3">
              {metrics.recentEvents.map((e) => (
                <li key={e.event_id} className="text-sm leading-snug text-slate-300">
                  <span className={EVENT_LABEL[e.kind].tone}>{EVENT_LABEL[e.kind].text}</span>
                  {' for '}
                  {e.user_id === currentUser?.userId ? 'you' : e.user_name} on #{e.task_id} {e.task_title}
                  <span className="block text-xs text-slate-500">{e.detail}</span>
                  <span className="block text-xs text-slate-600">{when(e.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-base font-semibold text-slate-100">Recent activity</h2>
          {recentActivity.length === 0 ? (
            <p className="text-sm text-slate-500">Nothing has happened yet.</p>
          ) : (
            <ol className="space-y-3">
              {recentActivity.map((log: any) => (
                <li key={log.log_id} className="text-sm leading-snug text-slate-300">
                  {describe(log)}
                  <span className="block text-xs text-slate-600">{when(log.created_at)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        </div>
      </div>
    </div>
  );
};
