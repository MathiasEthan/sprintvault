import React, { useState } from 'react';
import { UserRole } from '../types';
import { X, FolderGit2 } from 'lucide-react';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: Array<{ user_id: number; name: string; email: string; role: string }>;
  onSubmit: (name: string, repoUrl: string, defaultBranch: string, memberIds: number[]) => Promise<void>;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({
  isOpen,
  onClose,
  users,
  onSubmit,
}) => {
  const developers = users.filter((u) => u.role === UserRole.DEVELOPER);
  const [name, setName] = useState<string>('');
  const [repoUrl, setRepoUrl] = useState<string>('git://local/');
  const [defaultBranch, setDefaultBranch] = useState<string>('main');
  const [selectedMembers, setSelectedMembers] = useState<number[]>(developers.map((d) => d.user_id));
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Project name is required');
      return;
    }
    if (!repoUrl.trim()) {
      setError('Repository URL is required');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(name.trim(), repoUrl.trim(), defaultBranch.trim() || 'main', selectedMembers);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center space-x-2">
            <FolderGit2 className="w-5 h-5 text-blue-400" />
            <h3 className="text-base font-bold text-white">Create New Scrum Project (UC-02)</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="bg-rose-950/70 border border-rose-800 text-rose-200 text-xs p-3 rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Project Name:
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '-');
                setRepoUrl(`git://local/${slug || 'project'}.git`);
              }}
              placeholder="e.g. SprintVault Payment Gateway"
              className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Git Repository URL:
            </label>
            <input
              type="text"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="git://local/repo.git or https://github.com/org/repo.git"
              className="w-full bg-slate-950 font-mono text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
            <span className="text-[10px] text-slate-500 mt-1 block">
              SprintVault automatically hosts and manages the Git repository for this project.
            </span>
          </div>

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
            <label className="text-xs font-semibold text-slate-300 block mb-2">
              Assign Developers to Project:
            </label>
            <div className="space-y-1.5 max-h-36 overflow-y-auto bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
              {developers.map((dev) => (
                <label key={dev.user_id} className="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer hover:text-white">
                  <input
                    type="checkbox"
                    checked={selectedMembers.includes(dev.user_id)}
                    onChange={() => handleMemberToggle(dev.user_id)}
                    className="rounded border-slate-700 text-blue-600 focus:ring-0"
                  />
                  <span>{dev.name}</span>
                  <span className="text-[10px] text-slate-500">({dev.email})</span>
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
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition disabled:opacity-50"
            >
              {loading ? 'Creating...' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
