import React, { useState, useEffect } from 'react';
import { Project } from '../types';
import { Button, Field, Notice, inputClass, Modal } from './ui';

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

  // Fresh form each time it opens, targeting the project currently selected in the navbar
  useEffect(() => {
    if (!isOpen) return;
    setProjectId(defaultProjectId || projects[0]?.projectId || 1);
    setTitle('');
    setScopeInputs(['src/']);
    setError(null);
  }, [isOpen]);

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
    <Modal
      title="New task"
      description="A task locks its scope while someone works on it, so nobody else can change those paths."
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-task-form" disabled={loading}>
            {loading ? 'Creating…' : 'Create task'}
          </Button>
        </>
      }
    >
      {error && <Notice>{error}</Notice>}
      <form id="create-task-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Project" htmlFor="task-project">
          <select id="task-project" value={projectId} onChange={(e) => setProjectId(Number(e.target.value))} className={inputClass}>
            {projects.map((p) => (
              <option key={p.projectId} value={p.projectId}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Title" htmlFor="task-title">
          <input
            id="task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Refresh expired login tokens"
            className={inputClass}
            autoFocus
          />
        </Field>

        <Field label="Scope" hint="Folders or files this task may change. A folder covers everything inside it.">
          <div className="space-y-2">
            {scopeInputs.map((val, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  aria-label={`Scope path ${idx + 1}`}
                  value={val}
                  onChange={(e) => handleScopeChange(idx, e.target.value)}
                  placeholder="src/auth/"
                  className={`${inputClass} font-mono text-[12px]`}
                />
                {scopeInputs.length > 1 && (
                  <Button size="sm" variant="quiet" type="button" onClick={() => handleRemoveScope(idx)}>
                    Remove
                  </Button>
                )}
              </div>
            ))}
            <Button size="sm" variant="quiet" type="button" className="text-blue-300 hover:text-blue-200" onClick={handleAddScope}>
              Add another path
            </Button>
          </div>
        </Field>
      </form>
    </Modal>
  );
};
