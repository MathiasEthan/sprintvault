import React, { useState, useEffect } from 'react';
import { UserRole } from '../types';
import { api } from '../api';
import { Button, Field, Notice, Segmented, inputClass, Modal } from './ui';

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

  // Fresh form each time it opens; all developers preselected (users load after login)
  useEffect(() => {
    if (!isOpen) return;
    setFile(null);
    setProjectName('');
    setDefaultBranch('main');
    setDirPath('');
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
    <Modal
      title="Import project"
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="import-project-form" disabled={loading}>
            {loading ? 'Importing…' : 'Import project'}
          </Button>
        </>
      }
    >
      <Segmented
        label="Import from"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'upload', label: 'Zip file' },
          { value: 'local', label: 'Folder on this server' },
        ]}
      />

      {error && <Notice>{error}</Notice>}

      <form id="import-project-form" onSubmit={handleSubmit} className="space-y-4">
        {tab === 'upload' ? (
          <Field label="Zip file" htmlFor="zip-upload-input" hint="Include the .git folder to keep the project's history.">
            <input
              id="zip-upload-input"
              type="file"
              accept=".zip"
              onChange={handleFileChange}
              className="block w-full text-sm text-slate-300 file:mr-3 file:h-8 file:cursor-pointer file:rounded file:border file:border-slate-700 file:bg-transparent file:px-3 file:text-sm file:text-slate-100 hover:file:border-slate-500"
            />
          </Field>
        ) : (
          <Field
            label="Folder path"
            htmlFor="dir-path"
            hint="The folder keeps its files. If it isn't a git repository yet, SprintVault creates one from what's there."
          >
            <input
              id="dir-path"
              value={dirPath}
              onChange={(e) => setDirPath(e.target.value)}
              placeholder="C:\Work\payments-service"
              className={`${inputClass} font-mono text-[12px]`}
            />
          </Field>
        )}

        <Field label="Name" htmlFor="import-name" hint={tab === 'local' ? 'Leave empty to use the folder name.' : undefined}>
          <input id="import-name" value={projectName} onChange={(e) => setProjectName(e.target.value)} className={inputClass} />
        </Field>

        <Field label="Default branch" htmlFor="import-branch">
          <input id="import-branch" value={defaultBranch} onChange={(e) => setDefaultBranch(e.target.value)} className={`${inputClass} font-mono text-[12px]`} />
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
