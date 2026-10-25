import React, { useState, useEffect } from 'react';
import { Project, GitFileItem, GitMetadata, ScrumFileData } from '../types';
import { api } from '../api';
import { Button, Code, Segmented, Spinner } from './ui';

interface GitInspectorProps {
  project: Project;
  onPullScope: (scope: string[]) => void;
  refreshKey?: number;
}

type View = 'files' | 'scrumFile' | 'gitMeta';

export const GitInspector: React.FC<GitInspectorProps> = ({ project, onPullScope, refreshKey }) => {
  const [view, setView] = useState<View>('files');
  const [files, setFiles] = useState<GitFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileItem | null>(null);
  const [metadata, setMetadata] = useState<GitMetadata | null>(null);
  const [scrumFile, setScrumFile] = useState<ScrumFileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [filesRes, metaRes, scrumRes] = await Promise.all([
        api.browseFiles(project.projectId).catch(() => ({ files: [] as GitFileItem[] })),
        api.getGitMetadata(project.projectId).catch(() => ({ metadata: null })),
        api.getScrumFile(project.projectId).catch(() => ({ scrumFile: null })),
      ]);
      setFiles(filesRes.files);
      setMetadata(metaRes.metadata);
      setScrumFile(scrumRes.scrumFile);
      // Keep the open file if it still exists in this project, otherwise show the first one
      setSelectedFile((prev) => filesRes.files.find((f) => f.path === prev?.path) || filesRes.files[0] || null);
    } catch (err) {
      console.error('Failed to load inspector data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setSelectedFile(null);
    loadData();
  }, [project.projectId]);

  useEffect(() => {
    if (refreshKey) loadData(true);
  }, [refreshKey]);

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Repository view"
          value={view}
          onChange={setView}
          options={[
            { value: 'files', label: `Files (${files.length})` },
            { value: 'scrumFile', label: 'Scrum file' },
            { value: 'gitMeta', label: 'Git status' },
          ]}
        />
        <div className="flex items-center gap-2">
          {view === 'files' && (
            <Button size="sm" onClick={() => onPullScope([])}>
              Download all files
            </Button>
          )}
          <Button size="sm" onClick={() => loadData()}>
            Refresh
          </Button>
        </div>
      </div>

      {loading ? (
        <Spinner label="Reading the repository…" />
      ) : view === 'files' ? (
        files.length === 0 ? (
          <p className="text-sm text-slate-400">No files are committed on this branch yet.</p>
        ) : (
          <div className="grid overflow-hidden rounded-md border border-slate-800 md:grid-cols-[minmax(200px,280px)_1fr]">
            <ul className="max-h-[520px] overflow-y-auto border-b border-slate-800 py-1 md:border-b-0 md:border-r" aria-label="Files">
              {files.map((file) => (
                <li key={file.path}>
                  <button
                    onClick={() => setSelectedFile(file)}
                    aria-current={selectedFile?.path === file.path}
                    className={`block w-full truncate px-3 py-1 text-left font-mono text-[12px] ${
                      selectedFile?.path === file.path ? 'bg-slate-800 text-slate-50' : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {file.path}
                  </button>
                </li>
              ))}
            </ul>
            <div className="min-w-0">
              <div className="flex items-baseline justify-between border-b border-slate-800 px-4 py-2">
                <Code>{selectedFile?.path}</Code>
                {selectedFile?.size !== undefined && <span className="tabular text-xs text-slate-500">{selectedFile.size} bytes</span>}
              </div>
              <pre className="max-h-[480px] overflow-auto p-4 font-mono text-[12px] leading-relaxed text-slate-200">
                {selectedFile?.content}
              </pre>
            </div>
          </div>
        )
      ) : view === 'scrumFile' ? (
        <div>
          <p className="mb-3 max-w-prose text-sm text-slate-400">
            <Code>.scrum.json</Code> holds this project's tasks, locks and recent activity. SprintVault commits it after every change,
            so anyone with a clone sees the board's state after <Code>git pull</Code>.
            {scrumFile && <> Last written {new Date(scrumFile.lastSyncedAt).toLocaleString()}.</>}
          </p>
          {scrumFile ? (
            <pre className="max-h-[560px] overflow-auto rounded-md border border-slate-800 bg-slate-950 p-4 font-mono text-[12px] leading-relaxed text-slate-300">
              {JSON.stringify(scrumFile, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-slate-400">The Scrum file is created with the first task or assignment.</p>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <dl className="grid max-w-3xl grid-cols-1 gap-x-10 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-slate-500">Checked-out branch</dt>
              <dd className="mt-0.5">
                <Code className="text-sm">{metadata?.currentBranch}</Code>
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Commits</dt>
              <dd className="tabular mt-0.5 text-slate-100">{metadata?.totalCommits ?? 0}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Working tree</dt>
              <dd className={`mt-0.5 ${metadata?.hasUncommittedChanges ? 'text-amber-300' : 'text-slate-100'}`}>
                {metadata?.hasUncommittedChanges ? `${metadata.uncommittedFiles.length} uncommitted changes` : 'Clean'}
              </dd>
            </div>
          </dl>

          {metadata?.hasUncommittedChanges && (
            <pre className="rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-[12px] text-amber-200">
              {metadata.uncommittedFiles.join('\n')}
            </pre>
          )}

          <div>
            <h2 className="mb-2 text-sm font-semibold text-slate-200">
              <Code className="text-sm">.git/config</Code>
            </h2>
            <pre className="overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-3 font-mono text-[12px] text-slate-300">
              {metadata?.config || 'No config found'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
};
