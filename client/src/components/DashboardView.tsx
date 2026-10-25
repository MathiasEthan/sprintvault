import React, { useState, useEffect } from 'react';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { UserRole, TaskStatus, ActionType } from '../types';
import {
  BarChart3,
  GitCommit,
  Download,
  Lock,
  Unlock,
  Users,
  CheckCircle2,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';

interface DashboardViewProps {
  onOpenCommitDetails: (sha: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ onOpenCommitDetails }) => {
  const { currentUser } = useAuth();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const isManager = currentUser?.role === UserRole.MANAGER;

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const res = await api.getDashboard();
      setData(res);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
  }, [currentUser?.userId]);

  if (loading || !data) {
    return (
      <div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-2">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
        <span>Loading Scrum metrics and audit logs...</span>
      </div>
    );
  }

  const { tasks, developerStats, activeLocks, recentActivity } = data;

  const completedCount = tasks.filter((t: any) => t.status === TaskStatus.COMPLETED).length;
  const inProgressCount = tasks.filter((t: any) => t.status === TaskStatus.IN_PROGRESS).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <span>{isManager ? 'Team Scrum Metrics & Audit' : 'Personal Scrum Stats'}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {isManager
              ? 'Complete overview of all 4 developers, active scopes, Git commits, and audit logs.'
              : 'Your individual productivity counters, active locks, and recent actions.'}
          </p>
        </div>

        <button
          onClick={loadDashboard}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
          title="Refresh metrics"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <span className="text-[11px] uppercase font-bold text-slate-400 block mb-1">
            Total Tasks
          </span>
          <div className="text-2xl font-bold text-white">{tasks.length}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <span className="text-[11px] uppercase font-bold text-emerald-400 block mb-1">
            Completed Tasks
          </span>
          <div className="text-2xl font-bold text-emerald-300">{completedCount}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <span className="text-[11px] uppercase font-bold text-amber-400 block mb-1">
            Active Locks
          </span>
          <div className="text-2xl font-bold text-amber-300">{activeLocks.length}</div>
        </div>

        <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800">
          <span className="text-[11px] uppercase font-bold text-blue-400 block mb-1">
            In Progress
          </span>
          <div className="text-2xl font-bold text-blue-300">{inProgressCount}</div>
        </div>
      </div>

      {/* Developer Stats Table */}
      <div className="bg-slate-900/70 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-400" />
            <span>Developer Productivity Counters (Section 5)</span>
          </h3>
          <span className="text-xs text-slate-500">Pushes, pulls & task completions per developer</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Developer</th>
                <th className="px-4 py-3 text-center">Git Pushes</th>
                <th className="px-4 py-3 text-center">Git Pulls</th>
                <th className="px-4 py-3 text-center">Tasks Completed</th>
                <th className="px-4 py-3 text-right">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {developerStats.map((stat: any) => (
                <tr key={stat.user_id} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-medium text-white">
                    <div>{stat.name}</div>
                    <div className="text-[10px] text-slate-400 font-normal">{stat.email}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono bg-blue-950/70 text-blue-300 px-2.5 py-0.5 rounded-full border border-blue-800/60 font-semibold">
                      {stat.push_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono bg-purple-950/70 text-purple-300 px-2.5 py-0.5 rounded-full border border-purple-800/60 font-semibold">
                      {stat.pull_count}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-mono bg-emerald-950/70 text-emerald-300 px-2.5 py-0.5 rounded-full border border-emerald-800/60 font-semibold">
                      {stat.tasks_completed}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-slate-400">
                    {stat.last_activity_at ? (
                      <span className="text-[11px]">{new Date(stat.last_activity_at).toLocaleString()}</span>
                    ) : (
                      <span className="text-slate-500 italic">None</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Active Locks Monitor */}
      <div className="bg-slate-900/70 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Lock className="w-4 h-4 text-amber-400" />
            <span>Active Exclusive File Locks</span>
          </h3>
        </div>

        {activeLocks.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs italic">
            No active file locks currently held. Repository scopes are free for assignment.
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {activeLocks.map((lock: any) => {
              let scopeList: string[] = [];
              try {
                scopeList = JSON.parse(lock.scope_paths);
              } catch {
                scopeList = [];
              }

              return (
                <div key={lock.lock_id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-amber-400">Lock #{lock.lock_id}</span>
                      <span className="text-slate-400">on Task #{lock.task_id}:</span>
                      <span className="font-medium text-white">{lock.task_title}</span>
                    </div>
                    <div className="flex items-center space-x-2 mt-1">
                      <span className="text-slate-400">Locked Prefixes:</span>
                      <div className="flex gap-1">
                        {scopeList.map((p, i) => (
                          <span key={i} className="font-mono bg-slate-800 text-blue-300 px-1.5 py-0.5 rounded border border-slate-700">
                            {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="text-right text-slate-400">
                    <div>
                      Owner: <span className="text-white font-medium">{lock.owner_name}</span>
                    </div>
                    <div className="text-[10px] text-slate-500">
                      Acquired: {new Date(lock.acquired_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Activity Log Audit Timeline */}
      <div className="bg-slate-900/70 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Clock className="w-4 h-4 text-purple-400" />
            <span>Activity Audit Log (Section 4 & 5)</span>
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Action</th>
                <th className="px-4 py-3">Actor</th>
                <th className="px-4 py-3">Reference (ref)</th>
                <th className="px-4 py-3 text-right">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {recentActivity.map((log: any) => {
                let badgeClass = 'bg-slate-800 text-slate-300';
                if (log.action === ActionType.LOCK) badgeClass = 'bg-blue-950 text-blue-300 border border-blue-800';
                if (log.action === ActionType.PULL) badgeClass = 'bg-purple-950 text-purple-300 border border-purple-800';
                if (log.action === ActionType.PUSH) badgeClass = 'bg-emerald-950 text-emerald-300 border border-emerald-800';
                if (log.action === ActionType.FORCE_UNLOCK) badgeClass = 'bg-rose-950 text-rose-300 border border-rose-800';

                const isSha = log.action === ActionType.PUSH && log.ref && log.ref.length >= 7;

                return (
                  <tr key={log.log_id} className="hover:bg-slate-800/40 transition">
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${badgeClass}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-white">
                      {log.user_name}
                      <span className="text-[10px] text-slate-400 ml-1.5 font-normal">({log.user_role})</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-slate-300">
                      {isSha ? (
                        <button
                          onClick={() => onOpenCommitDetails(log.ref)}
                          className="text-emerald-300 underline hover:text-white flex items-center gap-1"
                        >
                          <span>{log.ref.substring(0, 10)}...</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      ) : (
                        <span>
                          {log.action === ActionType.PULL ? `Project #${log.ref}` : `Task #${log.ref}`}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-400">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
