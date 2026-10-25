import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, GitFileItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import {
  Upload,
  Lock,
  GitCommit,
  CheckCircle2,
  FileCode,
  AlertTriangle,
  Plus,
  Trash2,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';

interface PushWorkbenchProps {
  tasks: Task[];
  selectedTask?: Task | null;
  onPushComplete: () => void;
  onOpenCommitDetails: (sha: string) => void;
}

export const PushWorkbench: React.FC<PushWorkbenchProps> = ({
  tasks,
  selectedTask,
  onPushComplete,
  onOpenCommitDetails,
}) => {
  const { currentUser } = useAuth();

  // Find active IN_PROGRESS tasks for this user
  const userInProgressTasks = tasks.filter(
    (t) => t.status === TaskStatus.IN_PROGRESS && t.assignee_id === currentUser?.userId
  );

  const [activeTaskId, setActiveTaskId] = useState<number | null>(
    selectedTask?.task_id || (userInProgressTasks[0]?.task_id ?? null)
  );

  const currentTask = tasks.find((t) => t.task_id === activeTaskId);

  // Staged files to push
  const [stagedFiles, setStagedFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [filePath, setFilePath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pushReceipt, setPushReceipt] = useState<{ sha: string; status: TaskStatus } | null>(null);

  useEffect(() => {
    if (selectedTask) {
      setActiveTaskId(selectedTask.task_id);
    } else if (userInProgressTasks.length > 0 && !activeTaskId) {
      setActiveTaskId(userInProgressTasks[0].task_id);
    }
  }, [selectedTask, userInProgressTasks]);

  // When task changes, preload first scope path as suggested file path
  useEffect(() => {
    if (currentTask && currentTask.scope_paths && currentTask.scope_paths.length > 0) {
      const prefix = currentTask.scope_paths[0];
      const suggested = prefix.endsWith('/') ? `${prefix}index.ts` : prefix;
      setFilePath(suggested);
      setCommitMessage(`feat(${prefix.replace(/\/$/, '')}): update implementation`);
    }
  }, [currentTask?.task_id]);

  const handleAddOrUpdateFile = () => {
    if (!filePath.trim()) return;
    const trimmedPath = filePath.trim();

    setStagedFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== trimmedPath);
      return [...filtered, { path: trimmedPath, content: fileContent }];
    });
  };

  const handleRemoveStaged = (pathToRemove: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.path !== pathToRemove));
  };

  const handlePush = async () => {
    if (!currentTask) return;
    setErrorMsg(null);

    // Make sure we have at least one file staged
    let filesToPush = [...stagedFiles];
    if (filesToPush.length === 0 && filePath.trim()) {
      filesToPush = [{ path: filePath.trim(), content: fileContent }];
    }

    if (filesToPush.length === 0) {
      setErrorMsg('Please stage at least one file before pushing.');
      return;
    }

    if (!commitMessage.trim()) {
      setErrorMsg('Commit message cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.pushWork(currentTask.task_id, filesToPush, commitMessage.trim());
      setPushReceipt({ sha: res.sha, status: res.status });
      setStagedFiles([]);
      onPushComplete();
    } catch (err: any) {
      setErrorMsg(err.message || 'Push failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentTask || currentTask.status !== TaskStatus.IN_PROGRESS) {
    return (
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center max-w-2xl mx-auto space-y-4">
        <div className="w-12 h-12 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded-xl flex items-center justify-center mx-auto">
          <Lock className="w-6 h-6" />
        </div>
        <h3 className="text-lg font-bold text-white">No Active Task In Progress</h3>
        <p className="text-sm text-slate-400">
          In SprintVault, developers push code strictly through assigned tasks holding an exclusive active lock.
        </p>
        <div className="pt-2 text-xs text-slate-500">
          Go to the <span className="text-blue-400 font-medium">Scrum Board</span>, locate a task assigned to you, and click <span className="text-emerald-400 font-medium">Start Work</span> to acquire its lock and begin editing.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Workbench Header */}
      <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <span className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
              <Lock className="w-5 h-5" />
            </span>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-mono text-slate-400">Task #{currentTask.task_id}</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-semibold">
                  ACTIVE LOCK HELD
                </span>
              </div>
              <h2 className="text-lg font-bold text-white">{currentTask.title}</h2>
            </div>
          </div>

          {userInProgressTasks.length > 1 && (
            <div className="flex items-center space-x-2">
              <label className="text-xs text-slate-400">Active Task:</label>
              <select
                aria-label="Active Task in Progress"
                value={activeTaskId || ''}
                onChange={(e) => {
                  setActiveTaskId(Number(e.target.value));
                  setPushReceipt(null);
                }}
                className="bg-slate-800 text-xs text-white p-1.5 rounded border border-slate-700"
              >
                {userInProgressTasks.map((t) => (
                  <option key={t.task_id} value={t.task_id}>
                    #{t.task_id} - {t.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Scope info */}
        <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-800/80 flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <span className="text-slate-400">Locked Scope:</span>
            <div className="flex gap-1.5">
              {currentTask.scope_paths.map((p, i) => (
                <span key={i} className="font-mono bg-slate-900 text-blue-300 px-2 py-0.5 rounded border border-slate-700">
                  {p}
                </span>
              ))}
            </div>
          </div>
          <span className="text-slate-500 text-[11px] flex items-center gap-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            Guaranteed conflict-free Git push
          </span>
        </div>
      </div>

      {/* Push Receipt Alert */}
      {pushReceipt && (
        <div className="bg-emerald-950/70 border border-emerald-700/80 p-5 rounded-xl text-emerald-100 space-y-2">
          <div className="flex items-center space-x-2 text-emerald-400 font-bold text-base">
            <CheckCircle2 className="w-5 h-5" />
            <span>Work Pushed & Task Completed!</span>
          </div>
          <p className="text-xs text-emerald-300">
            GitHost accepted the commit via the service account. The file lock has been released and developer stats updated.
          </p>
          <div className="flex items-center space-x-4 pt-2">
            <span className="text-xs text-slate-300 font-mono">
              Commit SHA:{' '}
              <button
                onClick={() => onOpenCommitDetails(pushReceipt.sha)}
                className="text-emerald-300 font-bold underline hover:text-white"
              >
                {pushReceipt.sha}
              </button>
            </span>
            <button
              onClick={() => onOpenCommitDetails(pushReceipt.sha)}
              className="text-xs bg-emerald-800/60 hover:bg-emerald-800 text-emerald-200 px-3 py-1 rounded transition flex items-center gap-1"
            >
              <span>View Git Diff</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Error alert */}
      {errorMsg && (
        <div className="bg-rose-950/60 border border-rose-800/80 text-rose-200 text-xs p-3.5 rounded-lg flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Staged Files List */}
      <div className="bg-slate-900/60 p-4 rounded-xl border border-slate-800 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase font-bold text-slate-400 tracking-wider">
            Staged Files for Commit ({stagedFiles.length})
          </h3>
          <span className="text-[11px] text-slate-500">Files to be committed and pushed to Git</span>
        </div>

        {stagedFiles.length > 0 ? (
          <div className="space-y-1.5">
            {stagedFiles.map((sf) => (
              <div
                key={sf.path}
                className="flex items-center justify-between bg-slate-800/80 px-3 py-2 rounded-md border border-slate-700 text-xs font-mono"
              >
                <div className="flex items-center space-x-2 text-blue-300">
                  <FileCode className="w-3.5 h-3.5 text-blue-400" />
                  <span>{sf.path}</span>
                  <span className="text-[10px] text-slate-400 font-sans">
                    ({Buffer.byteLength(sf.content, 'utf8')} bytes)
                  </span>
                </div>
                <button
                  onClick={() => handleRemoveStaged(sf.path)}
                  className="text-slate-400 hover:text-rose-400 p-1 transition"
                  title="Remove from staged files"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-500 italic py-2">
            No files staged yet. Use the editor below to stage code changes.
          </div>
        )}
      </div>

      {/* Code Editor */}
      <div className="bg-slate-900/90 rounded-xl border border-slate-800 p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex-1">
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              File Path (relative to repository root):
            </label>
            <input
              type="text"
              value={filePath}
              onChange={(e) => setFilePath(e.target.value)}
              placeholder="e.g. src/auth/tokenService.ts"
              className="w-full bg-slate-950 font-mono text-xs text-slate-200 px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div className="sm:self-end">
            <button
              onClick={handleAddOrUpdateFile}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Stage File</span>
            </button>
          </div>
        </div>

        <div>
          <label className="text-[11px] font-semibold text-slate-400 block mb-1">
            File Content:
          </label>
          <textarea
            rows={10}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            placeholder="// Write code changes to commit..."
            className="w-full bg-slate-950 font-mono text-xs text-slate-200 p-3 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500 resize-y leading-relaxed"
          />
        </div>

        {/* Commit Message & Push Action */}
        <div className="pt-2 border-t border-slate-800 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-slate-400 block mb-1">
              Git Commit Message:
            </label>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              placeholder="e.g. feat(auth): implement token refresh validation"
              className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div className="flex justify-end pt-2">
            <button
              disabled={submitting}
              onClick={handlePush}
              className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition shadow-lg shadow-blue-900/30 disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{submitting ? 'Committing & Pushing...' : 'Push Work (Commit & Complete Task)'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
