import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { Button, Field, Notice, inputClass, Modal } from './ui';

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

  // Fresh form each time it opens; all developers preselected (users load after login)
  useEffect(() => {
    if (!isOpen) return;
    setName('');
    setRepoUrl('git://local/');
    setDefaultBranch('main');
    setSelectedMembers(developers.map((d) => d.user_id));
    setError(null);
  }, [isOpen, users.length]);

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
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="create-project-form" disabled={loading}>
            {loading ? 'Creating…' : 'Create project'}
          </Button>
        </>
      }
    >
      {error && <Notice>{error}</Notice>}
      <form id="create-project-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Name" htmlFor="project-name">
          <input
            id="project-name"
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              const slug = e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
              if (repoUrl.startsWith('git://local/')) setRepoUrl(`git://local/${slug || 'project'}.git`);
            }}
            placeholder="Payments service"
            className={inputClass}
          />
        </Field>

        <Field
          label="Repository"
          htmlFor="project-repo"
          hint={
            <>
              Leave as <code className="font-mono">git://local/…</code> to keep the repository on this server. Use a GitHub, GitLab
              or shared repository URL and every board change is pushed there, so the team gets it with git pull.
            </>
          }
        >
          <input id="project-repo" value={repoUrl} onChange={(e) => setRepoUrl(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
        </Field>

        <Field label="Default branch" htmlFor="project-branch">
          <input id="project-branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
        </Field>

        <fieldset>
          <legend className="mb-1.5 text-xs font-medium text-slate-300">Developers</legend>
          <div className="grid grid-cols-2 gap-1.5">
            {developers.map((dev) => (
              <label key={dev.user_id} className="flex cursor-pointer items-center gap-2 text-sm text-slate-300">
                <input type="checkbox" checked={selectedMembers.includes(dev.user_id)} onChange={() => handleMemberToggle(dev.user_id)} />
                {dev.name}
              </label>
            ))}
          </div>
        </fieldset>
      </form>
    </Modal>
  );
};
