import React, { useState, useEffect } from 'react';
import { Task, GitCommit } from '../types';
import { api } from '../api';
import {
  CheckCircle2,
  GitCommit as GitCommitIcon,
  X,
  Lock,
  Clock,
  User,
  AlertCircle,
  FileCode,
  Terminal,
  ShieldCheck,
} from 'lucide-react';

interface CommitDoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  projectId: number;
  onSuccess: (sha: string) => void;
}

export const CommitDoneModal: React.FC<CommitDoneModalProps> = ({
  isOpen,
  onClose,
  task,
  projectId,
  onSuccess,
}) => {
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedSha, setSelectedSha] = useState<string>('');
  const [customSha, setCustomSha] = useState<string>('');
  const [pendingMessage, setPendingMessage] = useState<string>('');
  const [commitMode, setCommitMode] = useState<'existing' | 'pending'>('existing');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !task) return;
    setLoading(true);
    setError(null);
    api.getCommits(projectId)
      .then((res) => {
        setCommits(res.commits);
        if (res.commits.length > 0) {
          setSelectedSha(res.commits[0].sha);
        }
      })
      .catch((err) => {
        console.error('Failed to load commits:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, task?.task_id, projectId]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let shaToLink: string | undefined = undefined;

    if (commitMode === 'existing') {
      shaToLink = customSha.trim() || selectedSha;
      if (!shaToLink) {
        setError('Please select or specify a commit SHA from your repository.');
        return;
      }
    } else {
      if (!pendingMessage.trim()) {
        setError('Please enter a commit message for your pending changes.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.commitDone(
        task.task_id,
        commitMode === 'existing' ? shaToLink : undefined,
        commitMode === 'pending' ? pendingMessage.trim() : undefined
      );
      onSuccess(res.sha);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete task');
    } finally {
      setSubmitting(false);
    }
  };

  const latestCommit = commits[0] || null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Commit Done — Complete Task</h3>
              <p className="text-[11px] text-slate-400">Link your local Git commit & release file lock</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Task Info Summary */}
        <div className="bg-slate-950/70 p-3 rounded-xl border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-slate-400">Task #{task.task_id}</span>
            <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
              <Lock className="w-3 h-3" />
              <span>ACTIVE LOCK HELD</span>
            </span>
          </div>
          <div className="text-sm font-semibold text-white">{task.title}</div>
          <div className="flex items-center space-x-1.5 text-xs text-slate-400">
            <span>Locked Scope:</span>
            {task.scope_paths.map((p, i) => (
              <span key={i} className="font-mono text-[11px] text-blue-300 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">
                {p}
              </span>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-rose-950/70 border border-rose-800 text-rose-200 text-xs p-3 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Mode Tabs */}
          <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
            <button
              type="button"
              onClick={() => setCommitMode('existing')}
              className={`py-1.5 rounded-md font-medium transition ${
                commitMode === 'existing'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Link Git Commit (Terminal)
            </button>
            <button
              type="button"
              onClick={() => setCommitMode('pending')}
              className={`py-1.5 rounded-md font-medium transition ${
                commitMode === 'pending'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Commit Local Changes Now
            </button>
          </div>

          {commitMode === 'existing' ? (
            <div className="space-y-3">
              {/* Latest commit detected */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Detected Commit at HEAD:
                </label>

                {loading ? (
                  <div className="text-xs text-slate-500 py-3 text-center">Reading repository commits...</div>
                ) : latestCommit ? (
                  <div
                    onClick={() => {
                      setSelectedSha(latestCommit.sha);
                      setCustomSha('');
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition ${
                      selectedSha === latestCommit.sha && !customSha
                        ? 'bg-emerald-950/40 border-emerald-500/80 text-emerald-100'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs font-mono mb-1">
                      <span className="text-emerald-400 font-bold flex items-center gap-1">
                        <GitCommitIcon className="w-3.5 h-3.5" />
                        {latestCommit.sha.substring(0, 8)}
                      </span>
                      <span className="text-[10px] text-slate-400">
                        {new Date(latestCommit.date).toLocaleTimeString()}
                      </span>
                    </div>
                    <div className="text-xs font-medium text-white">{latestCommit.message}</div>
                    <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>{latestCommit.authorName}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">No commits found yet</div>
                )}
              </div>

              {/* Or choose from other recent commits */}
              {commits.length > 1 && (
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                    Or select another recent commit:
                  </label>
                  <select
                    aria-label="Select Git Commit to link"
                    value={selectedSha}
                    onChange={(e) => {
                      setSelectedSha(e.target.value);
                      setCustomSha('');
                    }}
                    className="w-full bg-slate-950 text-xs text-white p-2 rounded-lg border border-slate-700"
                  >
                    {commits.map((c) => (
                      <option key={c.sha} value={c.sha}>
                        {c.sha.substring(0, 7)} — {c.message} ({c.authorName})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Manual SHA override */}
              <div>
                <label className="text-[11px] font-semibold text-slate-400 block mb-1">
                  Or paste exact commit SHA:
                </label>
                <input
                  type="text"
                  value={customSha}
                  onChange={(e) => setCustomSha(e.target.value)}
                  placeholder="Paste 40-character commit hash..."
                  className="w-full bg-slate-950 font-mono text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ) : (
            /* Pending changes commit mode */
            <div className="space-y-3">
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs text-slate-300 flex items-start space-x-2">
                <Terminal className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                <p>
                  SprintVault will stage your local working directory files (<code className="text-blue-300">git add -A</code>) and commit them via the service account with you as author.
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Commit Message:
                </label>
                <input
                  type="text"
                  value={pendingMessage}
                  onChange={(e) => setPendingMessage(e.target.value)}
                  placeholder="e.g. feat(auth): complete token validation logic"
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          {/* Scrum tracking file notice */}
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 pt-1">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
            <span>Updates <code className="text-slate-400">.scrum.json</code> directly in the project root folder.</span>
          </div>

          {/* Actions */}
          <div className="flex justify-end space-x-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs text-slate-300 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center space-x-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition shadow-md shadow-emerald-950/40 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{submitting ? 'Completing...' : 'Confirm Commit Done'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
