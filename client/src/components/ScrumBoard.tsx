import React, { useState } from 'react';
import { Task, TaskStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { Button, Code, displayScope } from './ui';

interface ScrumBoardProps {
  tasks: Task[];
  users: Array<{ user_id: number; name: string; email: string; role: string }>;
  onStartWork: (taskId: number) => Promise<void>;
  onOpenCommitDone: (task: Task) => void;
  onOpenPushModal: (task: Task) => void;
  onAssignTask: (taskId: number, devId: number) => Promise<void>;
  onForceRelease: (taskId: number, reason?: string) => Promise<void>;
  onOpenCommitDetails: (sha: string) => void;
  onCreateTaskClick: () => void;
  onPullCodeClick: (scope: string[]) => void;
  onViewCommitGraphClick?: () => void;
}

const LANES: { status: TaskStatus; title: string; empty: string }[] = [
  { status: TaskStatus.CREATED, title: 'Backlog', empty: 'New tasks start here.' },
  { status: TaskStatus.ASSIGNED, title: 'Assigned', empty: 'Nothing waiting to be started.' },
  { status: TaskStatus.IN_PROGRESS, title: 'In progress', empty: 'No code is locked right now.' },
  { status: TaskStatus.COMPLETED, title: 'Done', empty: 'Finished tasks appear here with their commit.' },
];

// The lock rail: the left edge of a task says who may touch its code
const RAIL: Record<TaskStatus, string> = {
  [TaskStatus.CREATED]: 'border-l-slate-700',
  [TaskStatus.ASSIGNED]: 'border-l-slate-500',
  [TaskStatus.IN_PROGRESS]: 'border-l-amber-400',
  [TaskStatus.COMPLETED]: 'border-l-blue-500',
};

function formatWhen(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function idleFor(iso?: string | null): string {
  if (!iso) return '';
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours < 48 ? `${hours}h` : `${Math.floor(hours / 24)}d`;
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
  onPullCodeClick,
}) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === UserRole.MANAGER;
  const [assigningTaskId, setAssigningTaskId] = useState<number | null>(null);
  const [selectedDevId, setSelectedDevId] = useState<number>(0);
  const [loadingTaskId, setLoadingTaskId] = useState<number | null>(null);
  const developers = users.filter((u) => u.role === UserRole.DEVELOPER);

  const run = async (taskId: number, action: () => Promise<void>) => {
    setLoadingTaskId(taskId);
    try {
      await action();
    } finally {
      setLoadingTaskId(null);
    }
  };

  const openAssign = (task: Task) => {
    setAssigningTaskId(task.task_id);
    setSelectedDevId(task.assignee_id || developers[0]?.user_id || 0);
  };

  const assignForm = (task: Task) => (
    <div className="flex items-center gap-2">
      <select
        aria-label={`Assign task #${task.task_id} to`}
        value={selectedDevId}
        onChange={(e) => setSelectedDevId(Number(e.target.value))}
        className="h-7 min-w-0 flex-1 rounded border border-slate-700 bg-slate-950 px-1.5 text-xs text-slate-100 focus:border-blue-500 focus:outline-none"
      >
        {developers.map((dev) => (
          <option key={dev.user_id} value={dev.user_id}>
            {dev.name}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="primary"
        disabled={!selectedDevId || loadingTaskId === task.task_id}
        onClick={() =>
          run(task.task_id, async () => {
            await onAssignTask(task.task_id, selectedDevId);
            setAssigningTaskId(null);
          })
        }
      >
        Assign
      </Button>
      <Button size="sm" variant="quiet" onClick={() => setAssigningTaskId(null)}>
        Cancel
      </Button>
    </div>
  );

  return (
    <div className="grid grid-cols-1 gap-px overflow-hidden rounded-md border border-slate-800 bg-slate-800 md:grid-cols-2 xl:grid-cols-4">
      {LANES.map((lane) => {
        const laneTasks = tasks.filter((t) => t.status === lane.status);
        return (
          <section key={lane.status} aria-label={lane.title} className="flex flex-col bg-black xl:min-h-[420px]">
            <h2 className="flex items-baseline justify-between px-4 pb-2 pt-4 text-sm font-semibold text-slate-200">
              {lane.title}
              <span className="tabular text-xs font-normal text-slate-500">{laneTasks.length}</span>
            </h2>

            <div className="flex-1 space-y-2 px-3 pb-3">
              {laneTasks.length === 0 && <p className="px-1 pt-2 text-xs text-slate-600">{lane.empty}</p>}

              {laneTasks.map((task) => {
                const isAssignee = currentUser?.userId === task.assignee_id;
                const busy = loadingTaskId === task.task_id;
                const stale = task.status === TaskStatus.IN_PROGRESS && !!task.lock_is_stale;
                return (
                  <article
                    key={task.task_id}
                    className={`rounded-md border border-l-[3px] border-slate-800 bg-slate-900 px-3 py-2.5 ${stale ? 'border-l-rose-500' : RAIL[task.status]}`}
                  >
                    <h3 className="text-sm font-medium leading-snug text-slate-50">
                      <span className="mr-1.5 font-normal text-slate-500">#{task.task_id}</span>
                      {task.title}
                    </h3>

                    <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5" aria-label="Scope">
                      {task.scope_paths.map((p) => (
                        <li key={p}>
                          <Code className="text-slate-400">{displayScope(p)}</Code>
                        </li>
                      ))}
                    </ul>

                    {/* Who holds this part of the code */}
                    <p className="mt-2 text-xs text-slate-400">
                      {task.status === TaskStatus.CREATED && 'Unassigned'}
                      {task.status === TaskStatus.ASSIGNED && <>Assigned to {isAssignee ? 'you' : task.assignee_name}</>}
                      {task.status === TaskStatus.IN_PROGRESS && (
                        <span className="text-amber-300">
                          Locked by {isAssignee ? 'you' : task.lock_owner_name || task.assignee_name}
                          {task.lock_acquired_at && ` since ${formatWhen(task.lock_acquired_at)}`}
                        </span>
                      )}
                      {stale && (
                        <span className="mt-1 block text-rose-300">
                          Stale: no activity for {idleFor(task.lock_last_activity_at)}.
                          {isAssignee ? ' The team lead may release this lock.' : ''}
                        </span>
                      )}
                      {task.status === TaskStatus.COMPLETED && (
                        <>
                          Done by {isAssignee ? 'you' : task.assignee_name}
                          {task.completed_at && `, ${formatWhen(task.completed_at)}`}
                          {task.commit_sha && (
                            <>
                              {' in '}
                              <button
                                onClick={() => onOpenCommitDetails(task.commit_sha!)}
                                className="font-mono text-[12px] text-blue-300 underline decoration-slate-600 underline-offset-2 hover:decoration-blue-300"
                              >
                                {task.commit_sha.substring(0, 7)}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </p>

                    {/* Actions */}
                    {isManager && assigningTaskId === task.task_id ? (
                      <div className="mt-2.5">{assignForm(task)}</div>
                    ) : (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2">
                        {task.status === TaskStatus.CREATED && isManager && (
                          <Button size="sm" onClick={() => openAssign(task)}>
                            Assign
                          </Button>
                        )}
                        {task.status === TaskStatus.ASSIGNED && isAssignee && (
                          <Button size="sm" variant="primary" disabled={busy} onClick={() => run(task.task_id, () => onStartWork(task.task_id))}>
                            {busy ? 'Locking…' : 'Start work'}
                          </Button>
                        )}
                        {task.status === TaskStatus.ASSIGNED && isManager && (
                          <Button size="sm" variant="quiet" onClick={() => openAssign(task)}>
                            Reassign
                          </Button>
                        )}
                        {task.status === TaskStatus.IN_PROGRESS && isAssignee && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => onOpenCommitDone(task)}>
                              Commit done
                            </Button>
                            <Button size="sm" variant="quiet" onClick={() => onOpenPushModal(task)}>
                              Edit in browser
                            </Button>
                          </>
                        )}
                        {task.status === TaskStatus.IN_PROGRESS && isManager && (
                          <Button
                            size="sm"
                            variant="quiet"
                            className="text-rose-300 hover:text-rose-200"
                            disabled={busy}
                            onClick={() => {
                              const reason = prompt(
                                `Release the ${stale ? 'stale ' : ''}lock on #${task.task_id}? The task goes back to ${task.assignee_name} as Assigned.\n\nReason (kept in the audit log):`,
                                stale ? `No activity for ${idleFor(task.lock_last_activity_at)}` : ''
                              );
                              if (reason !== null) {
                                run(task.task_id, () => onForceRelease(task.task_id, reason.trim() || undefined));
                              }
                            }}
                          >
                            {busy ? 'Releasing…' : stale ? 'Release stale lock' : 'Release lock'}
                          </Button>
                        )}
                        {task.status !== TaskStatus.COMPLETED && (
                          <Button size="sm" variant="quiet" onClick={() => onPullCodeClick(task.scope_paths)}>
                            Download files
                          </Button>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
};
