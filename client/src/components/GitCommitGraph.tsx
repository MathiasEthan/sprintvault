import React, { useState, useEffect } from 'react';
import { GitGraphNode } from '../types';
import { api } from '../api';
import {
  GitCommit,
  GitBranch,
  GitMerge,
  Clock,
  User,
  ExternalLink,
  Tag,
  CheckCircle2,
  RefreshCw,
  Terminal,
  Layers,
} from 'lucide-react';

interface GitCommitGraphProps {
  projectId: number;
  onOpenCommitDetails: (sha: string) => void;
}

export const GitCommitGraph: React.FC<GitCommitGraphProps> = ({
  projectId,
  onOpenCommitDetails,
}) => {
  const [nodes, setNodes] = useState<GitGraphNode[]>([]);
  const [rawGraphText, setRawGraphText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'visual' | 'terminal'>('visual');

  const loadGraph = async () => {
    setLoading(true);
    try {
      const res = await api.getCommitGraph(projectId);
      setNodes(res.nodes);
      setRawGraphText(res.rawGraphText);
    } catch (err) {
      console.error('Failed to load git commit graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGraph();
  }, [projectId]);

  if (loading) {
    return (
      <div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-2">
        <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
        <span>Reading .git folder and parsing commit graph DAG...</span>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Graph Toolbar */}
      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <GitMerge className="w-5 h-5 text-emerald-400" />
            <span>Git Commit Graph (DAG)</span>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
              {nodes.length} commits
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time branch topology parsed directly from the project's <code className="text-blue-300">.git</code> folder.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          {/* View toggle */}
          <div className="bg-slate-800 p-1 rounded-lg border border-slate-700 flex text-xs">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded transition font-medium ${
                viewMode === 'visual'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Interactive Graph</span>
            </button>
            <button
              onClick={() => setViewMode('terminal')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded transition font-medium ${
                viewMode === 'terminal'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Terminal ASCII</span>
            </button>
          </div>

          <button
            onClick={loadGraph}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Refresh commit graph"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-12 text-center text-slate-400">
          No Git commits found in this project repository yet.
        </div>
      ) : viewMode === 'terminal' ? (
        /* Terminal ASCII View */
        <div className="bg-slate-950 rounded-xl border border-slate-800 p-5 font-mono text-xs overflow-x-auto shadow-inner">
          <div className="text-[11px] text-slate-500 mb-3 border-b border-slate-800 pb-2 flex items-center justify-between">
            <span>$ git log --graph --all --pretty=format:"%h %d %s (%an, %cd)"</span>
            <span className="text-emerald-400 font-semibold">READ DIRECTLY FROM .git</span>
          </div>
          <pre className="text-emerald-300 leading-relaxed whitespace-pre font-mono">
            {rawGraphText || 'No graph output'}
          </pre>
        </div>
      ) : (
        /* Visual Interactive DAG Graph */
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-6 space-y-4">
          <div className="relative pl-6 space-y-6 before:absolute before:left-9 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-700">
            {nodes.map((node, index) => {
              const isMerge = node.parents && node.parents.length > 1;
              const hasTask = !!node.linkedTask;

              // Node color based on state
              const dotColor = hasTask
                ? 'bg-emerald-500 ring-4 ring-emerald-500/20'
                : isMerge
                ? 'bg-purple-500 ring-4 ring-purple-500/20'
                : node.isHead
                ? 'bg-blue-500 ring-4 ring-blue-500/20'
                : 'bg-slate-400 ring-4 ring-slate-700';

              return (
                <div key={node.sha} className="relative flex items-start space-x-4 group">
                  {/* Visual Node Dot on timeline */}
                  <div
                    className={`w-3.5 h-3.5 rounded-full ${dotColor} z-10 flex-shrink-0 mt-1.5 transition-transform duration-200 group-hover:scale-125`}
                  />

                  {/* Commit Box */}
                  <div className="flex-1 bg-slate-800/90 rounded-xl p-4 border border-slate-700/80 hover:border-blue-500/60 transition shadow-sm space-y-2.5">
                    {/* Header: SHA + Refs + Task Link */}
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          onClick={() => onOpenCommitDetails(node.sha)}
                          className="font-mono text-xs font-bold text-blue-400 hover:text-blue-300 flex items-center gap-1 bg-slate-900 px-2 py-0.5 rounded border border-slate-700 transition"
                          title="Click to view full Git diff"
                        >
                          <GitCommit className="w-3.5 h-3.5" />
                          <span>{node.shortSha}</span>
                          <ExternalLink className="w-3 h-3 text-slate-500" />
                        </button>

                        {/* Head & Branches */}
                        {node.isHead && (
                          <span className="text-[10px] bg-blue-900/60 text-blue-300 font-semibold px-2 py-0.5 rounded border border-blue-700/60">
                            HEAD
                          </span>
                        )}

                        {node.branches.map((b) => (
                          <span
                            key={b}
                            className="text-[10px] bg-emerald-950/70 text-emerald-300 font-medium px-2 py-0.5 rounded border border-emerald-800/60 flex items-center gap-1"
                          >
                            <GitBranch className="w-3 h-3" />
                            <span>{b}</span>
                          </span>
                        ))}

                        {node.tags.map((t) => (
                          <span
                            key={t}
                            className="text-[10px] bg-amber-950/70 text-amber-300 font-medium px-2 py-0.5 rounded border border-amber-800/60 flex items-center gap-1"
                          >
                            <Tag className="w-3 h-3" />
                            <span>{t}</span>
                          </span>
                        ))}

                        {isMerge && (
                          <span className="text-[10px] bg-purple-950/70 text-purple-300 font-medium px-2 py-0.5 rounded border border-purple-800/60 flex items-center gap-1">
                            <GitMerge className="w-3 h-3" />
                            <span>Merge Commit</span>
                          </span>
                        )}
                      </div>

                      {/* Parent hashes for DAG lineage */}
                      {node.parents.length > 0 && (
                        <div className="text-[11px] font-mono text-slate-500 flex items-center gap-1">
                          <span>parents:</span>
                          {node.parents.map((p) => (
                            <span key={p} className="text-slate-400 hover:text-white cursor-pointer" onClick={() => onOpenCommitDetails(p)}>
                              {p.substring(0, 7)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Commit Message */}
                    <h4 className="text-sm font-semibold text-white leading-snug">
                      {node.message}
                    </h4>

                    {/* Scrum Task Badge (if this commit completed a Scrum task) */}
                    {node.linkedTask && (
                      <div className="bg-emerald-950/50 border border-emerald-700/60 rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-200">
                        <div className="flex items-center space-x-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                          <div>
                            <span className="font-bold text-emerald-300">
                              Linked Scrum Task #{node.linkedTask.taskId}:
                            </span>{' '}
                            <span>{node.linkedTask.title}</span>
                          </div>
                        </div>
                        {node.linkedTask.assigneeName && (
                          <span className="text-[10px] bg-emerald-900/60 px-2 py-0.5 rounded text-emerald-200 font-medium">
                            {node.linkedTask.assigneeName}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Author & Timestamp */}
                    <div className="flex items-center justify-between text-xs text-slate-400 pt-1.5 border-t border-slate-700/60">
                      <div className="flex items-center space-x-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span className="text-slate-300 font-medium">{node.authorName}</span>
                        <span className="text-[10px] text-slate-500">({node.authorEmail})</span>
                      </div>

                      <div className="flex items-center space-x-1 text-slate-400">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        <span>{new Date(node.date).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
