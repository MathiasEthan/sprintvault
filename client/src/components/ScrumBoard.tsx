import React, { useState } from 'react';
import { Task, TaskStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  Plus,
  Play,
  Upload,
  Lock,
  GitCommit,
  User as UserIcon,
  Clock,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  GitMerge,
  HardDrive,
} from 'lucide-react';

interface ScrumBoardProps {
  tasks: Task[];
  users: Array<{ user_id: number; name: string; email: string; role: string }>;
  onStartWork: (taskId: number) => Promise<void>;
  onOpenCommitDone: (task: Task) => void;
  onOpenPushModal: (task: Task) => void;
  onAssignTask: (taskId: number, devId: number) => Promise<void>;
  onForceRelease: (taskId: number) => Promise<void>;
  onOpenCommitDetails: (sha: string) => void;
  onCreateTaskClick: () => void;
  onPullCodeClick: (scope: string[]) => void;
  onViewCommitGraphClick?: () => void;
}

export const ScrumBoard: React.FC<ScrumBoardProps> = ({
  tasks,
  users,
  onStartWork,
  onOpenCommitDone,
  onOpenPushModal,
  onAssignTask,
  onForceRelease,
  onOpenCommitDetails,
  onCreateTaskClick,
  onPullCodeClick,
  onViewCommitGraphClick,
}) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === UserRole.MANAGER;
  const [assigningTaskId, setAssigningTaskId] = useState<number | null>(null);
  const [selectedDevId, setSelectedDevId] = useState<number>(0);
  const [loadingTaskId, setLoadingTaskId] = useState<number | null>(null);

  const columns: { status: TaskStatus; title: string; color: string; badgeBg: string }[] = [
    {
      status: TaskStatus.CREATED,
      title: 'Created (Backlog)',
      color: 'border-slate-700',
      badgeBg: 'bg-slate-800 text-slate-300',
    },
    {
      status: TaskStatus.ASSIGNED,
      title: 'Assigned',
      color: 'border-blue-900/60',
      badgeBg: 'bg-blue-950/80 text-blue-300 border border-blue-800/60',
    },
    {
      status: TaskStatus.IN_PROGRESS,
      title: 'In Progress (Active Lock)',
      color: 'border-amber-900/60',
      badgeBg: 'bg-amber-950/80 text-amber-300 border border-amber-800/60',
    },
    {
      status: TaskStatus.COMPLETED,
      title: 'Completed (Git Linked)',
      color: 'border-emerald-900/60',
      badgeBg: 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60',
    },
  ];

  const developers = users.filter((u) => u.role === UserRole.DEVELOPER);

  const handleStart = async (taskId: number) => {
    setLoadingTaskId(taskId);
    try {
      await onStartWork(taskId);
    } finally {
      setLoadingTaskId(null);
    }
  };

  const handleForceRelease = async (taskId: number) => {
    if (confirm('Are you sure you want to force-release this lock? The lock will be revoked and the task reset to ASSIGNED.')) {
      setLoadingTaskId(taskId);
      try {
        await onForceRelease(taskId);
      } finally {
        setLoadingTaskId(null);
      }
    }
  };

  const handleAssignSubmit = async (taskId: number) => {
    if (!selectedDevId) return;
    setLoadingTaskId(taskId);
    try {
      await onAssignTask(taskId, selectedDevId);
      setAssigningTaskId(null);
    } finally {
      setLoadingTaskId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Board Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-xl border border-slate-800">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <span>Project Scrum Board</span>
            <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Work locally in your editor. Click <span className="text-emerald-400 font-semibold">Commit Done</span> to link Git commit & complete task. Synced into <code className="text-blue-300">.scrum.json</code>.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          {onViewCommitGraphClick && (
            <button
              onClick={onViewCommitGraphClick}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              <GitMerge className="w-3.5 h-3.5 text-emerald-400" />
              <span>View Git Graph</span>
            </button>
          )}

          {isManager && (
            <button
              onClick={onCreateTaskClick}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-md shadow-blue-900/30"
            >
              <Plus className="w-4 h-4" />
              <span>Create Task</span>
            </button>
          )}
        </div>
      </div>

      {/* 4 Kanban Columns */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        {columns.map((col) => {
          const colTasks = tasks.filter((t) => t.status === col.status);

          return (
            <div
              key={col.status}
              className={`flex flex-col bg-slate-900/70 rounded-xl border ${col.color} p-3.5 min-h-[500px] shadow-sm`}
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-md ${col.badgeBg}`}>
                  {col.title}
                </span>
                <span className="text-xs text-slate-400 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                  {colTasks.length}
                </span>
              </div>

              {/* Task Cards */}
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {colTasks.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs italic">
                    No tasks in this column
                  </div>
                ) : (
                  colTasks.map((task) => {
                    const isAssignee = currentUser?.userId === task.assignee_id;
                    const isTaskLoading = loadingTaskId === task.task_id;

                    return (
                      <div
                        key={task.task_id}
                        className={`bg-slate-800/90 rounded-lg p-3.5 border transition-all duration-200 shadow-md ${
                          task.status === TaskStatus.IN_PROGRESS
                            ? 'border-amber-500/50 hover:border-amber-400/80 bg-gradient-to-b from-slate-800 to-amber-950/20'
                            : task.status === TaskStatus.COMPLETED
                            ? 'border-emerald-500/40 hover:border-emerald-400/70'
                            : 'border-slate-700/80 hover:border-slate-600'
                        }`}
                      >
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className="text-xs font-mono text-slate-400">
                            #{task.task_id}
                          </span>
                          {task.status === TaskStatus.IN_PROGRESS && (
                            <span className="flex items-center space-x-1 text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-full font-medium animate-pulse">
                              <Lock className="w-3 h-3" />
                              <span>LOCKED</span>
                            </span>
                          )}
                          {task.status === TaskStatus.COMPLETED && (
                            <span className="flex items-center space-x-1 text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-1.5 py-0.5 rounded-full font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>LINKED</span>
                            </span>
                          )}
                        </div>

                        {/* Title */}
                        <h4 className="text-sm font-semibold text-white leading-snug mb-2">
                          {task.title}
                        </h4>

                        {/* Scope Paths */}
                        <div className="mb-3">
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block mb-1">
                            Scope Prefix
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {task.scope_paths && task.scope_paths.length > 0 ? (
                              task.scope_paths.map((p, idx) => (
                                <span
                                  key={idx}
                                  className="text-[11px] font-mono bg-slate-900 text-blue-300 px-1.5 py-0.5 rounded border border-slate-700"
                                >
                                  {p}
                                </span>
                              ))
                            ) : (
                              <span className="text-[11px] font-mono text-slate-500 italic">None</span>
                            )}
                          </div>
                        </div>

                        {/* Assignee Info */}
                        <div className="flex items-center justify-between text-xs text-slate-300 pt-2 border-t border-slate-700/60 mb-3">
                          <div className="flex items-center space-x-1.5">
                            <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                            <span className="truncate max-w-[120px]">
                              {task.assignee_name || (
                                <span className="text-slate-500 italic">Unassigned</span>
                              )}
                            </span>
                          </div>

                          <button
                            onClick={() => onPullCodeClick(task.scope_paths)}
                            className="text-[10px] text-blue-400 hover:text-blue-300 hover:underline"
                            title="Download/Pull snapshot for this task's scope"
                          >
                            Pull Scope
                          </button>
                        </div>

                        {/* Commit link if completed */}
                        {task.commit_sha && (
                          <div className="mb-3 bg-slate-900/90 rounded p-2 border border-emerald-900/50 text-xs">
                            <div className="flex items-center justify-between">
                              <span className="text-[11px] text-slate-400 flex items-center gap-1">
                                <GitCommit className="w-3.5 h-3.5 text-emerald-400" />
                                Git Commit:
                              </span>
                              <button
                                onClick={() => onOpenCommitDetails(task.commit_sha!)}
                                className="text-[11px] font-mono text-emerald-300 hover:text-emerald-200 flex items-center gap-0.5 underline font-bold"
                              >
                                {task.commit_sha.substring(0, 7)}
                                <ExternalLink className="w-3 h-3 ml-0.5" />
                              </button>
                            </div>
                            {task.completed_at && (
                              <div className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {new Date(task.completed_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="pt-2">
                          {/* CREATED state */}
                          {task.status === TaskStatus.CREATED && isManager && (
                            <div>
                              {assigningTaskId === task.task_id ? (
                                <div className="space-y-2 bg-slate-900 p-2 rounded border border-slate-700">
                                  <label className="text-[10px] uppercase font-semibold text-slate-400">
                                    Assign to:
                                  </label>
                                  <select
                                    aria-label="Assign to developer"
                                    value={selectedDevId}
                                    onChange={(e) => setSelectedDevId(Number(e.target.value))}
                                    className="w-full bg-slate-800 text-xs text-white p-1.5 rounded border border-slate-700 focus:outline-none"
                                  >
                                    <option value={0}>Choose developer...</option>
                                    {developers.map((dev) => (
                                      <option key={dev.user_id} value={dev.user_id}>
                                        {dev.name}
                                      </option>
                                    ))}
                                  </select>
                                  <div className="flex space-x-2">
                                    <button
                                      disabled={!selectedDevId || isTaskLoading}
                                      onClick={() => handleAssignSubmit(task.task_id)}
                                      className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 rounded transition disabled:opacity-50"
                                    >
                                      {isTaskLoading ? 'Assigning...' : 'Confirm'}
                                    </button>
                                    <button
                                      onClick={() => setAssigningTaskId(null)}
                                      className="bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs px-2 py-1 rounded transition"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <button
                                  onClick={() => {
                                    setAssigningTaskId(task.task_id);
                                    setSelectedDevId(developers[0]?.user_id || 0);
                                  }}
                                  className="w-full flex items-center justify-center space-x-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs py-1.5 rounded transition"
                                >
                                  <UserIcon className="w-3.5 h-3.5" />
                                  <span>Assign Developer</span>
                                </button>
                              )}
                            </div>
                          )}

                          {/* ASSIGNED state */}
                          {task.status === TaskStatus.ASSIGNED && (
                            <div className="space-y-2">
                              {isAssignee && (
                                <button
                                  disabled={isTaskLoading}
                                  onClick={() => handleStart(task.task_id)}
                                  className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 rounded font-medium transition shadow-md shadow-emerald-950/40"
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                  <span>{isTaskLoading ? 'Acquiring Lock...' : 'Start Work (Acquire Lock)'}</span>
                                </button>
                              )}

                              {isManager && (
                                <div>
                                  {assigningTaskId === task.task_id ? (
                                    <div className="space-y-2 bg-slate-900 p-2 rounded border border-slate-700">
                                      <select
                                        aria-label="Reassign to developer"
                                        value={selectedDevId}
                                        onChange={(e) => setSelectedDevId(Number(e.target.value))}
                                        className="w-full bg-slate-800 text-xs text-white p-1.5 rounded border border-slate-700"
                                      >
                                        <option value={0}>Reassign to...</option>
                                        {developers.map((dev) => (
                                          <option key={dev.user_id} value={dev.user_id}>
                                            {dev.name}
                                          </option>
                                        ))}
                                      </select>
                                      <div className="flex space-x-2">
                                        <button
                                          disabled={!selectedDevId || isTaskLoading}
                                          onClick={() => handleAssignSubmit(task.task_id)}
                                          className="flex-1 bg-blue-600 hover:bg-blue-500 text-white text-xs py-1 rounded transition"
                                        >
                                          Confirm
                                        </button>
                                        <button
                                          onClick={() => setAssigningTaskId(null)}
                                          className="bg-slate-700 text-slate-300 text-xs px-2 py-1 rounded"
                                        >
                                          Cancel
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() => {
                                        setAssigningTaskId(task.task_id);
                                        setSelectedDevId(developers[0]?.user_id || 0);
                                      }}
                                      className="w-full text-center text-[11px] text-slate-400 hover:text-white py-1 transition"
                                    >
                                      Reassign
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}

                          {/* IN_PROGRESS state */}
                          {task.status === TaskStatus.IN_PROGRESS && (
                            <div className="space-y-2">
                              {/* Prominent "Commit Done" action */}
                              {isAssignee && (
                                <div className="space-y-1.5">
                                  <button
                                    onClick={() => onOpenCommitDone(task)}
                                    className="w-full flex items-center justify-center space-x-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-2 rounded-lg font-bold transition shadow-lg shadow-emerald-950/50"
                                    title="Click when you have committed your changes locally"
                                  >
                                    <CheckCircle2 className="w-4 h-4" />
                                    <span>Commit Done</span>
                                  </button>

                                  <button
                                    onClick={() => onOpenPushModal(task)}
                                    className="w-full text-center text-[11px] text-slate-400 hover:text-blue-300 py-0.5 transition"
                                  >
                                    Push files in browser...
                                  </button>
                                </div>
                              )}

                              {/* Manager can force-release lock */}
                              {isManager && (
                                <button
                                  disabled={isTaskLoading}
                                  onClick={() => handleForceRelease(task.task_id)}
                                  className="w-full flex items-center justify-center space-x-1.5 bg-rose-950/70 hover:bg-rose-900 border border-rose-800 text-rose-300 text-xs py-1.5 rounded transition"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                  <span>{isTaskLoading ? 'Revoking...' : 'Force Release Lock'}</span>
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
