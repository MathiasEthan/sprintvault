import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { X, GitCommit, RefreshCw, FileText } from 'lucide-react';

interface CommitDiffModalProps {
  projectId: number | null;
  sha: string | null;
  onClose: () => void;
}

export const CommitDiffModal: React.FC<CommitDiffModalProps> = ({ projectId, sha, onClose }) => {
  const [details, setDetails] = useState<{ sha: string; message: string; diff: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !sha) return;
    setLoading(true);
    setError(null);
    api.getCommitDetails(projectId, sha)
      .then((res) => {
        setDetails(res.details);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load commit diff');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId, sha]);

  if (!sha) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-800/60">
          <div className="flex items-center space-x-2">
            <GitCommit className="w-5 h-5 text-emerald-400" />
            <h3 className="text-sm font-bold text-white">Git Commit Details & Diff</h3>
            <span className="text-xs font-mono bg-slate-800 text-emerald-300 px-2 py-0.5 rounded border border-slate-700">
              {sha.substring(0, 10)}
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {loading ? (
            <div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-2">
              <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
              <span>Fetching Git commit and diff from repository...</span>
            </div>
          ) : error ? (
            <div className="bg-rose-950/70 border border-rose-800 text-rose-200 text-xs p-4 rounded-lg">
              {error}
            </div>
          ) : details ? (
            <div className="space-y-4">
              {/* Commit Message Box */}
              <div className="bg-slate-950 p-3.5 rounded-lg border border-slate-800">
                <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">
                  Commit Message
                </span>
                <p className="text-xs font-medium text-white">{details.message}</p>
                <div className="text-[10px] text-slate-400 mt-2 font-mono">
                  Full SHA: {details.sha}
                </div>
              </div>

              {/* Diff Viewer */}
              <div className="space-y-1">
                <div className="flex items-center space-x-1.5 text-xs text-slate-400 font-semibold px-1">
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span>Repository Git Diff (git show):</span>
                </div>

                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-xs overflow-x-auto max-h-96">
                  {details.diff ? (
                    details.diff.split('\n').map((line, idx) => {
                      let colorClass = 'text-slate-300';
                      let bgClass = '';
                      if (line.startsWith('+') && !line.startsWith('+++')) {
                        colorClass = 'text-emerald-400';
                        bgClass = 'bg-emerald-950/40';
                      } else if (line.startsWith('-') && !line.startsWith('---')) {
                        colorClass = 'text-rose-400';
                        bgClass = 'bg-rose-950/40';
                      } else if (line.startsWith('@@')) {
                        colorClass = 'text-cyan-400';
                        bgClass = 'bg-cyan-950/20';
                      } else if (line.startsWith('diff ') || line.startsWith('index ')) {
                        colorClass = 'text-slate-500 font-semibold';
                      }

                      return (
                        <div key={idx} className={`whitespace-pre px-1 py-0.5 rounded-sm ${colorClass} ${bgClass}`}>
                          {line || ' '}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-slate-500 italic">No textual diff available for this commit.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-slate-800 bg-slate-900 text-right">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium rounded-lg transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
