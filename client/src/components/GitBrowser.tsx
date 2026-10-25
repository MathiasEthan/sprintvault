import React, { useState, useEffect } from 'react';
import { GitFileItem, GitCommit, Project } from '../types';
import { api } from '../api';
import {
  FolderGit2,
  FileCode,
  Download,
  GitCommit as GitCommitIcon,
  RefreshCw,
  Clock,
  User,
  Check,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

interface GitBrowserProps {
  project: Project | null;
  onOpenCommitDetails: (sha: string) => void;
  onPullCompleted?: () => void;
}

export const GitBrowser: React.FC<GitBrowserProps> = ({
  project,
  onOpenCommitDetails,
  onPullCompleted,
}) => {
  const [files, setFiles] = useState<GitFileItem[]>([]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileItem | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [pulling, setPulling] = useState<boolean>(false);
  const [pullSuccess, setPullSuccess] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'files' | 'history'>('files');

  const loadRepoData = async () => {
    if (!project) return;
    setLoading(true);
    try {
      const [filesRes, commitsRes] = await Promise.all([
        api.browseFiles(project.projectId),
        api.getCommits(project.projectId),
      ]);
      setFiles(filesRes.files);
      setCommits(commitsRes.commits);
      if (filesRes.files.length > 0 && !selectedFile) {
        setSelectedFile(filesRes.files[0]);
      }
    } catch (err) {
      console.error('Failed to load repo data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRepoData();
  }, [project?.projectId]);

  const handlePullSnapshot = async () => {
    if (!project) return;
    setPulling(true);
    setPullSuccess(null);
    try {
      const res = await api.pullCode(project.projectId, []);
      setPullSuccess(`Successfully pulled ${res.snapshot.length} files into snapshot. Pull counter incremented!`);
      if (onPullCompleted) onPullCompleted();
      setTimeout(() => setPullSuccess(null), 4000);
    } catch (err: any) {
      alert(`Pull failed: ${err.message}`);
    } finally {
      setPulling(false);
    }
  };

  if (!project) {
    return (
      <div className="p-8 text-center text-slate-500">
        Please select a project to browse its Git repository.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Git Repository Header Bar */}
      <div className="bg-slate-900/80 p-4 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <FolderGit2 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-bold text-white">{project.name}</h2>
            <span className="text-xs bg-slate-800 text-slate-300 px-2 py-0.5 rounded font-mono border border-slate-700">
              branch: {project.defaultBranch}
            </span>
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            {project.repoUrl}
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <button
            disabled={pulling}
            onClick={handlePullSnapshot}
            className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-1.5 rounded-lg text-xs font-medium transition shadow-md shadow-blue-900/30 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{pulling ? 'Pulling...' : 'Pull Code Snapshot'}</span>
          </button>

          <button
            onClick={loadRepoData}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg border border-slate-700 transition"
            title="Refresh repository"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {pullSuccess && (
        <div className="bg-emerald-950/60 border border-emerald-800/80 text-emerald-200 text-xs px-4 py-2.5 rounded-lg flex items-center space-x-2">
          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span>{pullSuccess}</span>
        </div>
      )}

      {/* Tabs: File Tree vs Git Commit History */}
      <div className="flex items-center space-x-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveSubTab('files')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
            activeSubTab === 'files'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <FileCode className="w-3.5 h-3.5" />
          <span>Tracked Files ({files.length})</span>
        </button>

        <button
          onClick={() => setActiveSubTab('history')}
          className={`flex items-center space-x-2 px-3 py-1.5 rounded-md text-xs font-semibold transition ${
            activeSubTab === 'history'
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <GitCommitIcon className="w-3.5 h-3.5" />
          <span>Commit Log ({commits.length})</span>
        </button>
      </div>

      {activeSubTab === 'files' ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* File Tree List */}
          <div className="md:col-span-4 bg-slate-900/60 rounded-xl border border-slate-800 p-3 h-[520px] overflow-y-auto">
            <span className="text-[11px] uppercase font-bold text-slate-400 block px-2 mb-2">
              Repository Tree
            </span>
            <div className="space-y-1">
              {files.map((file) => {
                const isSelected = selectedFile?.path === file.path;
                return (
                  <button
                    key={file.path}
                    onClick={() => setSelectedFile(file)}
                    className={`w-full text-left px-2.5 py-1.5 rounded-md text-xs font-mono flex items-center justify-between transition ${
                      isSelected
                        ? 'bg-blue-600/20 text-blue-300 font-semibold border border-blue-500/30'
                        : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate">
                      <FileCode className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
                      <span className="truncate">{file.path}</span>
                    </div>
                    {isSelected && <ChevronRight className="w-3 h-3 text-blue-400" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* File Content Preview */}
          <div className="md:col-span-8 bg-slate-900/90 rounded-xl border border-slate-800 flex flex-col h-[520px] overflow-hidden">
            <div className="bg-slate-800/80 px-4 py-2 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-mono text-slate-300 font-medium">
                {selectedFile ? selectedFile.path : 'No file selected'}
              </span>
              {selectedFile?.size !== undefined && (
                <span className="text-[10px] text-slate-400 font-mono">
                  {selectedFile.size} bytes
                </span>
              )}
            </div>

            <div className="flex-1 overflow-auto p-4 bg-slate-950 font-mono text-xs text-slate-200">
              {selectedFile ? (
                <pre className="whitespace-pre-wrap leading-relaxed">
                  {selectedFile.content}
                </pre>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-500">
                  Select a file from the tree to view contents
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Git Commit History Table */
        <div className="bg-slate-900/70 rounded-xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-800/60 text-slate-400 uppercase text-[10px] font-semibold border-b border-slate-800">
              <tr>
                <th className="px-4 py-3">Commit SHA</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Author</th>
                <th className="px-4 py-3">Date</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {commits.map((c) => (
                <tr key={c.sha} className="hover:bg-slate-800/40 transition">
                  <td className="px-4 py-3 font-mono text-emerald-400 font-medium">
                    {c.sha.substring(0, 8)}
                  </td>
                  <td className="px-4 py-3 text-white font-medium">
                    {c.message}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>{c.authorName}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    <div className="flex items-center space-x-1">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(c.date).toLocaleString()}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => onOpenCommitDetails(c.sha)}
                      className="text-xs bg-slate-800 hover:bg-slate-700 text-blue-400 px-2.5 py-1 rounded border border-slate-700 transition"
                    >
                      View Diff
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
