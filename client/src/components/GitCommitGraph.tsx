import React, { useState, useEffect } from 'react';
import { GitGraphNode } from '../types';
import { api } from '../api';
import { Button, Code, Segmented, Spinner } from './ui';

interface GitCommitGraphProps {
  projectId: number;
  onOpenCommitDetails: (sha: string) => void;
  refreshKey?: number;
}

// .scrum.json bookkeeping commits: shown dimmed and hidden by default
const isScrumUpdate = (n: GitGraphNode) => n.message.startsWith('chore(scrum):');

export const GitCommitGraph: React.FC<GitCommitGraphProps> = ({ projectId, onOpenCommitDetails, refreshKey }) => {
  const [nodes, setNodes] = useState<GitGraphNode[]>([]);
  const [rawGraphText, setRawGraphText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<'visual' | 'terminal'>('visual');
  const [showScrumCommits, setShowScrumCommits] = useState<boolean>(false);

  const loadGraph = async (background = false) => {
    if (!background) setLoading(true);
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

  useEffect(() => {
    if (refreshKey) loadGraph(true);
  }, [refreshKey]);

  if (loading) return <Spinner label="Reading commit history…" />;

  const scrumCount = nodes.filter(isScrumUpdate).length;
  const visible = showScrumCommits ? nodes : nodes.filter((n) => !isScrumUpdate(n));

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="History view"
          value={viewMode}
          onChange={setViewMode}
          options={[
            { value: 'visual', label: 'Timeline' },
            { value: 'terminal', label: 'git log' },
          ]}
        />
        <div className="flex items-center gap-4">
          {viewMode === 'visual' && scrumCount > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-400">
              <input type="checkbox" checked={showScrumCommits} onChange={(e) => setShowScrumCommits(e.target.checked)} />
              Show {scrumCount} Scrum updates
            </label>
          )}
          <Button size="sm" onClick={() => loadGraph()}>
            Refresh
          </Button>
        </div>
      </div>

      {nodes.length === 0 ? (
        <p className="text-sm text-slate-400">This repository has no commits yet.</p>
      ) : viewMode === 'terminal' ? (
        <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] leading-relaxed text-slate-300">
          <span className="text-slate-600">$ git log --graph --all{'\n'}</span>
          {rawGraphText || 'No output'}
        </pre>
      ) : (
        <ol className="relative ml-1.5 border-l border-slate-800">
          {visible.map((node) => {
            const isScrum = isScrumUpdate(node);
            const isMerge = node.parents.length > 1;
            return (
              <li key={node.sha} className="relative pb-5 pl-6 last:pb-0">
                <span
                  aria-hidden
                  className={`absolute -left-[5px] top-1.5 h-2.5 w-2.5 rounded-full border-2 ${
                    node.linkedTask
                      ? 'border-blue-400 bg-blue-400'
                      : isScrum
                      ? 'border-slate-700 bg-black'
                      : 'border-slate-400 bg-black'
                  }`}
                />
                <p className={`text-sm leading-snug ${isScrum ? 'text-slate-500' : 'text-slate-100'}`}>
                  {node.message}
                  {node.branches.map((b) => (
                    <Code key={b} className="ml-2 rounded-sm bg-slate-800 px-1.5 py-px text-slate-300">
                      {b}
                    </Code>
                  ))}
                  {node.tags.map((t) => (
                    <Code key={t} className="ml-2 rounded-sm border border-slate-700 px-1.5 text-slate-300">
                      {t}
                    </Code>
                  ))}
                </p>
                {node.linkedTask && (
                  <p className="mt-0.5 text-sm text-blue-300">
                    Completes #{node.linkedTask.taskId} {node.linkedTask.title}
                  </p>
                )}
                <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                  <button
                    onClick={() => onOpenCommitDetails(node.sha)}
                    className="font-mono text-[12px] text-slate-300 underline decoration-slate-700 underline-offset-2 hover:decoration-slate-300"
                  >
                    {node.shortSha}
                  </button>
                  <span>{isScrum ? 'SprintVault' : node.authorName}</span>
                  <span>{new Date(node.date).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                  {isMerge && <span>Merge of {node.parents.map((p) => p.substring(0, 7)).join(' and ')}</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
};
