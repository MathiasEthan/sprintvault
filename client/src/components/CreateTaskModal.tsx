import React, { useState } from 'react';
import { Project } from '../types';
import { X, Plus, Trash2 } from 'lucide-react';

interface CreateTaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  defaultProjectId: number | null;
  onSubmit: (projectId: number, title: string, scopePaths: string[]) => Promise<void>;
}

export const CreateTaskModal: React.FC<CreateTaskModalProps> = ({
  isOpen,
  onClose,
  projects,
  defaultProjectId,
  onSubmit,
}) => {
  const [projectId, setProjectId] = useState<number>(defaultProjectId || projects[0]?.projectId || 1);
  const [title, setTitle] = useState<string>('');
  const [scopeInputs, setScopeInputs] = useState<string[]>(['src/']);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAddScope = () => {
    setScopeInputs([...scopeInputs, '']);
  };

  const handleRemoveScope = (idx: number) => {
    setScopeInputs(scopeInputs.filter((_, i) => i !== idx));
  };

  const handleScopeChange = (idx: number, val: string) => {
    const updated = [...scopeInputs];
    updated[idx] = val;
    setScopeInputs(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Task title is required');
      return;
    }

    const cleanedScopes = scopeInputs.map((s) => s.trim()).filter(Boolean);
    if (cleanedScopes.length === 0) {
      setError('At least one scope path prefix is required (e.g. src/auth/)');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      await onSubmit(projectId, title.trim(), cleanedScopes);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create task');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl max-w-lg w-full p-6 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <h3 className="text-base font-bold text-white">Create New Scrum Task (UC-03)</h3>
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
              Select Project:
            </label>
            <select
              aria-label="Select Project for new task"
              value={projectId}
              onChange={(e) => setProjectId(Number(e.target.value))}
              className="w-full bg-slate-950 text-xs text-white p-2 rounded-lg border border-slate-700"
            >
              {projects.map((p) => (
                <option key={p.projectId} value={p.projectId}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              Task Title:
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Implement user authentication middleware"
              className="w-full bg-slate-950 text-xs text-white px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-slate-300">
                Scope Path Prefixes (Exclusive Lock Zone):
              </label>
              <button
                type="button"
                onClick={handleAddScope}
                className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Prefix</span>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2">
              Any file beginning with these path prefixes will be locked when the developer starts work.
            </p>

            <div className="space-y-2 max-h-40 overflow-y-auto">
              {scopeInputs.map((val, idx) => (
                <div key={idx} className="flex items-center space-x-2">
                  <input
                    type="text"
                    value={val}
                    onChange={(e) => handleScopeChange(idx, e.target.value)}
                    placeholder="e.g. src/auth/ or src/components/Header.tsx"
                    className="flex-1 bg-slate-950 font-mono text-xs text-blue-300 px-3 py-1.5 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
                  />
                  {scopeInputs.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveScope(idx)}
                      className="text-slate-400 hover:text-rose-400 p-1"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
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
              {loading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
