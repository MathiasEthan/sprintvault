import React, { useState, useEffect } from 'react';
import { Project, GitFileItem, GitMetadata, ScrumFileData } from '../types';
import { api } from '../api';
import {
  FileCode,
  HardDrive,
  GitBranch,
  FolderGit2,
  Download,
  RefreshCw,
  Tag,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';

interface GitInspectorProps {
  project: Project;
  onPullScope: (scope: string[]) => void;
}

export const GitInspector: React.FC<GitInspectorProps> = ({ project, onPullScope }) => {
  const [activeSubTab, setActiveSubTab] = useState<'files' | 'scrumFile' | 'gitMeta'>('scrumFile');
  const [files, setFiles] = useState<GitFileItem[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileItem | null>(null);
  const [metadata, setMetadata] = useState<GitMetadata | null>(null);
  const [scrumFile, setScrumFile] = useState<ScrumFileData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const loadData = async () => {
    setLoading(true);
    try {
      const [filesRes, metaRes, scrumRes] = await Promise.all([
        api.browseFiles(project.projectId).catch(() => ({ files: [] })),
        api.getGitMetadata(project.projectId).catch(() => ({ metadata: null })),
        api.getScrumFile(project.projectId).catch(() => ({ scrumFile: null })),
      ]);
      setFiles(filesRes.files);
      setMetadata(metaRes.metadata);
      setScrumFile(scrumRes.scrumFile);
      if (filesRes.files.length > 0 && !selectedFile) {
        setSelectedFile(filesRes.files[0]);
      }
    } catch (err) {
      console.error('Failed to load inspector data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [project.projectId]);

  return (
    <div className="space-y-5">
      {/* Sub-tab navigation */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setActiveSubTab('scrumFile')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'scrumFile'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <HardDrive className="w-3.5 h-3.5" />
            <span>.scrum.json (Scrum Tracker File)</span>
          </button>

          <button
            onClick={() => setActiveSubTab('gitMeta')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'gitMeta'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderGit2 className="w-3.5 h-3.5" />
            <span>.git Folder Inspector</span>
          </button>

          <button
            onClick={() => setActiveSubTab('files')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
              activeSubTab === 'files'
                ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Project Files Tree ({files.length})</span>
          </button>
        </div>

        <button
          onClick={loadData}
          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
          title="Refresh inspection"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Sub-tab 1: .scrum.json Viewer */}
      {activeSubTab === 'scrumFile' && (
        <div className="space-y-3">
          <div className="bg-slate-900/80 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between text-xs">
            <div>
              <span className="font-bold text-white flex items-center gap-1.5">
                <HardDrive className="w-4 h-4 text-blue-400" />
                <span>Single Scrum Tracking File: <code className="text-blue-300">.scrum.json</code></span>
              </span>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Lives in the root of the project directory alongside the <code className="text-slate-300">.git</code> folder. Synchronized automatically on every task and lock action.
              </p>
            </div>
            {scrumFile && (
              <span className="text-[10px] text-slate-400 font-mono">
                Last synced: {new Date(scrumFile.lastSyncedAt).toLocaleTimeString()}
              </span>
            )}
          </div>

          <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-xs overflow-auto max-h-[550px] shadow-inner text-emerald-300 leading-relaxed">
            {scrumFile ? (
              <pre>{JSON.stringify(scrumFile, null, 2)}</pre>
            ) : (
              <div className="text-slate-500 italic py-8 text-center">
                .scrum.json file not created yet or empty.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab 2: .git Folder Inspector */}
      {activeSubTab === 'gitMeta' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            {/* HEAD info */}
            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                .git/HEAD
              </span>
              <div className="font-mono text-white text-sm">
                {metadata?.currentBranch || 'main'}
              </div>
              <div className="text-[10px] text-slate-500 font-mono truncate">
                {metadata?.headRef || 'ref: refs/heads/main'}
              </div>
            </div>

            {/* Total Commits */}
            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Total Commits
              </span>
              <div className="font-mono text-emerald-400 text-sm font-bold">
                {metadata?.totalCommits || 0} commits
              </div>
              <div className="text-[10px] text-slate-500">
                Directly counted via git rev-list
              </div>
            </div>

            {/* Working Tree Status */}
            <div className="bg-slate-900/70 p-4 rounded-xl border border-slate-800 space-y-1">
              <span className="text-[10px] uppercase font-bold text-slate-400 block">
                Working Tree Status
              </span>
              <div className="text-sm font-medium">
                {metadata?.hasUncommittedChanges ? (
                  <span className="text-amber-400">Modified (Uncommitted files)</span>
                ) : (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    Clean working tree
                  </span>
                )}
              </div>
              {metadata?.hasUncommittedChanges && (
                <div className="text-[10px] text-amber-300 font-mono">
                  {metadata.uncommittedFiles.length} file(s) changed
                </div>
              )}
            </div>
          </div>

          {/* .git/config Viewer */}
          <div className="bg-slate-900/70 rounded-xl border border-slate-800 p-4 space-y-2">
            <span className="text-xs font-bold text-white block">
              .git/config file contents:
            </span>
            <pre className="bg-slate-950 p-3 rounded-lg border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto">
              {metadata?.config || 'No config found'}
            </pre>
          </div>
        </div>
      )}

      {/* Sub-tab 3: Project Files Tree */}
      {activeSubTab === 'files' && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
          {/* File Tree */}
          <div className="md:col-span-4 bg-slate-900/60 rounded-xl border border-slate-800 p-3 h-[480px] overflow-y-auto space-y-1">
            <span className="text-[11px] uppercase font-bold text-slate-400 block px-2 mb-2">
              Tracked Code Files
            </span>
            {files.map((file) => {
              const isSelected = selectedFile?.path === file.path;
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedFile(file)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center space-x-2 transition ${
                    isSelected
                      ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                      : 'text-slate-300 hover:bg-slate-800'
                  }`}
                >
                  <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                  <span className="truncate">{file.path}</span>
                </button>
              );
            })}
          </div>

          {/* File Viewer */}
          <div className="md:col-span-8 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col h-[480px] overflow-hidden">
            <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700 flex items-center justify-between text-xs">
              <span className="font-mono text-slate-200">
                {selectedFile ? selectedFile.path : 'No file selected'}
              </span>
              {selectedFile?.size !== undefined && (
                <span className="text-[10px] text-slate-400 font-mono">{selectedFile.size} bytes</span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-200">
              {selectedFile ? (
                <pre className="whitespace-pre-wrap leading-relaxed">{selectedFile.content}</pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Select a file from the tree to preview
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
