import React, { useState } from 'react';
import { UserRole } from '../types';
import { api } from '../api';
import {
  X,
  Upload,
  FolderArchive,
  FolderGit2,
  AlertCircle,
  CheckCircle2,
  FileCode,
} from 'lucide-react';

interface UploadProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: Array<{ user_id: number; name: string; email: string; role: string }>;
  onSuccess: (projectId: number) => void;
}

export const UploadProjectModal: React.FC<UploadProjectModalProps> = ({
  isOpen,
  onClose,
  users,
  onSuccess,
}) => {
  const developers = users.filter((u) => u.role === UserRole.DEVELOPER);
  const [tab, setTab] = useState<'upload' | 'local'>('upload');

  // Zip upload state
  const [file, setFile] = useState<File | null>(null);
  const [projectName, setProjectName] = useState<string>('');
  const [defaultBranch, setDefaultBranch] = useState<string>('main');
  const [selectedMembers, setSelectedMembers] = useState<number[]>(developers.map((d) => d.user_id));

  // Local folder import state
  const [dirPath, setDirPath] = useState<string>('');

  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMemberToggle = (devId: number) => {
    if (selectedMembers.includes(devId)) {
      setSelectedMembers(selectedMembers.filter((id) => id !== devId));
    } else {
      setSelectedMembers([...selectedMembers, devId]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);
      if (!projectName) {
        setProjectName(selected.name.replace(/\.zip$/i, ''));
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (tab === 'upload') {
        if (!file) {
          setError('Please select a .zip project file to upload');
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append('projectZip', file);
        formData.append('name', projectName.trim() || file.name.replace(/\.zip$/i, ''));
        formData.append('defaultBranch', defaultBranch.trim() || 'main');
        formData.append('memberIds', JSON.stringify(selectedMembers));

        const res = await api.uploadProjectZip(formData);
        onSuccess(res.project.projectId);
        onClose();
      } else {
        if (!dirPath.trim()) {
          setError('Please provide a local directory path');
          setLoading(false);
          return;
        }

        const res = await api.importLocalProject(
          dirPath.trim(),
          projectName.trim() || undefined,
          defaultBranch.trim() || 'main',
          selectedMembers
        );
        onSuccess(res.project.projectId);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to upload/import project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/40 flex items-center justify-center">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Add Project to SprintVault</h3>
              <p className="text-[11px] text-slate-400">Upload ZIP archive or import local codebase directory</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switch */}
        <div className="grid grid-cols-2 gap-2 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs">
          <button
            type="button"
            onClick={() => setTab('upload')}
            className={`flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium transition ${
              tab === 'upload' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderArchive className="w-4 h-4" />
            <span>Upload ZIP Archive</span>
          </button>
          <button
            type="button"
            onClick={() => setTab('local')}
            className={`flex items-center justify-center space-x-1.5 py-1.5 rounded-md font-medium transition ${
              tab === 'local' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderGit2 className="w-4 h-4" />
            <span>Link Local Directory</span>
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/70 border border-rose-800 text-rose-200 text-xs p-3 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === 'upload' ? (
            /* ZIP Upload */
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Select Project ZIP File:
                </label>
                <div className="border-2 border-dashed border-slate-700 hover:border-blue-500 rounded-xl p-5 text-center cursor-pointer transition bg-slate-950/40">
                  <input
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    className="hidden"
                    id="zip-upload-input"
                  />
                  <label htmlFor="zip-upload-input" className="cursor-pointer block">
                    <FolderArchive className="w-8 h-8 text-blue-400 mx-auto mb-2" />
                    {file ? (
                      <div className="text-xs font-medium text-emerald-400">
                        Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                      </div>
                    ) : (
                      <>
                        <div className="text-xs font-medium text-white">Click or drag & drop project .zip here</div>
                        <div className="text-[10px] text-slate-500 mt-1">Contains codebase and .git folder</div>
                      </>
                    )}
                  </label>
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Project Name:
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="e.g. Microservice API"
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          ) : (
            /* Local Directory Path */
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Local Absolute Directory Path:
                </label>
                <input
                  type="text"
                  value={dirPath}
                  onChange={(e) => setDirPath(e.target.value)}
                  placeholder="/home/ethan/Work/my-scrum-project"
                  className="w-full bg-slate-950 font-mono text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
                <span className="text-[10px] text-slate-500 mt-1 block">
                  SprintVault will read the existing <code className="text-blue-300">.git</code> folder and initialize <code className="text-blue-300">.scrum.json</code> in this directory.
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Project Display Name:
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Leave blank to use folder name"
                  className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Default Branch:
            </label>
            <input
              type="text"
              value={defaultBranch}
              onChange={(e) => setDefaultBranch(e.target.value)}
              placeholder="main"
              className="w-full bg-slate-950 font-mono text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1.5">
              Assign Developers to Project:
            </label>
            <div className="space-y-1 max-h-32 overflow-y-auto bg-slate-950/70 p-2 rounded-lg border border-slate-800">
              {developers.map((dev) => (
                <label key={dev.user_id} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(dev.user_id)}
                    onChange={() => handleMemberToggle(dev.user_id)}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>{dev.name}</span>
                </label>
              ))}
            </div>
          </div>

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
              disabled={loading}
              className="flex items-center space-x-1.5 px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
            >
              <Upload className="w-4 h-4" />
              <span>{loading ? 'Processing...' : 'Add Project'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
