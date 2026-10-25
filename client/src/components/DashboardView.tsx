import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { TaskStatus, UserRole, ActionType } from '../types';
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
  const total = tasks.length;

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
                    <li key={lock.lock_id} className="flex flex-col gap-1 border-l-[3px] border-l-amber-400 py-3 pl-3 sm:flex-row sm:items-baseline sm:justify-between">
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
                      <p className="shrink-0 text-xs text-amber-300">
                        {lock.owner_name}, since {when(lock.acquired_at)}
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
                      <td className="py-2.5 text-right text-xs text-slate-500">{s.last_activity_at ? when(s.last_activity_at) : 'Not yet'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <section className="lg:col-span-2">
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
  );
};
