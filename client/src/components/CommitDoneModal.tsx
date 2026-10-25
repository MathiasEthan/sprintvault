import React, { useState, useEffect } from 'react';
import { Task, GitCommit } from '../types';
import { api } from '../api';
import { useAuth } from '../context/AuthContext';
import { Button, Code, displayScope, Field, Notice, Segmented, inputClass, Modal } from './ui';

interface CommitDoneModalProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  projectId: number;
  onSuccess: (sha: string) => void;
}

export const CommitDoneModal: React.FC<CommitDoneModalProps> = ({
  isOpen,
  onClose,
  task,
  projectId,
  onSuccess,
}) => {
  const { currentUser } = useAuth();
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedSha, setSelectedSha] = useState<string>('');
  const [customSha, setCustomSha] = useState<string>('');
  const [pendingMessage, setPendingMessage] = useState<string>('');
  const [commitMode, setCommitMode] = useState<'existing' | 'pending'>('existing');
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !task) return;
    setLoading(true);
    setError(null);
    api.getCommits(projectId)
      .then((res) => {
        // .scrum.json bookkeeping commits by the service account are never a developer's work
        // Your own commits first
        const devCommits = res.commits
          .filter((c) => c.authorEmail !== 'service@sprintvault.local')
          .sort((a, b) => Number(b.authorEmail === currentUser?.email) - Number(a.authorEmail === currentUser?.email));
        setCommits(devCommits);
        setSelectedSha(devCommits[0]?.sha ?? '');
      })
      .catch((err) => {
        console.error('Failed to load commits:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, task?.task_id, projectId]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    let shaToLink: string | undefined = undefined;

    if (commitMode === 'existing') {
      shaToLink = customSha.trim() || selectedSha;
      if (!shaToLink) {
        setError('Please select or specify a commit SHA from your repository.');
        return;
      }
    } else {
      if (!pendingMessage.trim()) {
        setError('Please enter a commit message for your pending changes.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await api.commitDone(
        task.task_id,
        commitMode === 'existing' ? shaToLink : undefined,
        commitMode === 'pending' ? pendingMessage.trim() : undefined
      );
      onSuccess(res.sha);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to complete task');
    } finally {
      setSubmitting(false);
    }
  };

  const latestCommit = commits[0] || null;


  return (
    <Modal
      title={`Finish #${task.task_id}`}
      description={task.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="quiet" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="commit-done-form" disabled={submitting}>
            {submitting ? 'Finishing…' : commitMode === 'existing' ? 'Link commit and finish' : 'Commit and finish'}
          </Button>
        </>
      }
    >
      <p className="text-sm text-slate-400">
        Finishing links a commit to this task, marks it done and releases your lock on{' '}
        {task.scope_paths.map((p, i) => (
          <React.Fragment key={p}>
            {i > 0 && ', '}
            <Code>{displayScope(p)}</Code>
          </React.Fragment>
        ))}
        .
      </p>

      {error && <Notice>{error}</Notice>}

      <form id="commit-done-form" onSubmit={handleSubmit} className="space-y-4">
        <Segmented
          label="How to finish"
          value={commitMode}
          onChange={setCommitMode}
          options={[
            { value: 'existing', label: 'I already committed' },
            { value: 'pending', label: 'Commit my changes' },
          ]}
        />

        {commitMode === 'existing' ? (
          <>
            <Field label="Your commit" hint="Push it to the project remote first if the project has one.">
              {loading ? (
                <p className="text-sm text-slate-500">Reading commits…</p>
              ) : commits.length === 0 ? (
                <p className="text-sm text-slate-500">No commits of yours yet. Commit your work, then come back.</p>
              ) : (
                <select
                  aria-label="Commit to link"
                  value={customSha ? '' : selectedSha}
                  onChange={(e) => {
                    setSelectedSha(e.target.value);
                    setCustomSha('');
                  }}
                  className={inputClass}
                >
                  {commits.map((c) => (
                    <option key={c.sha} value={c.sha}>
                      {c.sha.substring(0, 7)}  {c.message}  ({c.authorName})
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="Or paste a commit SHA" htmlFor="custom-sha">
              <input
                id="custom-sha"
                value={customSha}
                onChange={(e) => setCustomSha(e.target.value)}
                placeholder="e.g. 4f3a2b1"
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
          </>
        ) : (
          <Field
            label="Commit message"
            htmlFor="pending-msg"
            hint={<>Commits your uncommitted changes inside this task's scope, with you as the author.</>}
          >
            <input
              id="pending-msg"
              value={pendingMessage}
              onChange={(e) => setPendingMessage(e.target.value)}
              placeholder="feat(auth): refresh expired tokens"
              className={inputClass}
            />
          </Field>
        )}
      </form>
    </Modal>
  );
};
