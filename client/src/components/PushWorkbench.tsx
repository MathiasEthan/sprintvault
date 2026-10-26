import React, { useState, useEffect } from 'react';
import { Task, TaskStatus, GitFileItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { api } from '../api';
import { Button, Code, displayScope, Field, Notice, inputClass } from './ui';

interface PushWorkbenchProps {
  tasks: Task[];
  selectedTask?: Task | null;
  onPushComplete: () => void;
  onOpenCommitDetails: (sha: string) => void;
}

export const PushWorkbench: React.FC<PushWorkbenchProps> = ({
  tasks,
  selectedTask,
  onPushComplete,
  onOpenCommitDetails,
}) => {
  const { currentUser } = useAuth();

  // Find active IN_PROGRESS tasks for this user
  const userInProgressTasks = tasks.filter(
    (t) => t.status === TaskStatus.IN_PROGRESS && t.assignee_id === currentUser?.userId
  );

  const [activeTaskId, setActiveTaskId] = useState<number | null>(
    selectedTask?.task_id || (userInProgressTasks[0]?.task_id ?? null)
  );

  const currentTask = tasks.find((t) => t.task_id === activeTaskId);

  // Staged files to push
  const [stagedFiles, setStagedFiles] = useState<Array<{ path: string; content: string }>>([]);
  const [filePath, setFilePath] = useState<string>('');
  const [fileContent, setFileContent] = useState<string>('');
  const [commitMessage, setCommitMessage] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pushReceipt, setPushReceipt] = useState<{ sha: string; status: TaskStatus } | null>(null);
  // Current repository files inside the task scope, so edits start from the real content
  const [repoFiles, setRepoFiles] = useState<GitFileItem[]>([]);

  useEffect(() => {
    if (selectedTask) {
      setActiveTaskId(selectedTask.task_id);
    } else if (userInProgressTasks.length > 0 && !activeTaskId) {
      setActiveTaskId(userInProgressTasks[0].task_id);
    }
  }, [selectedTask, userInProgressTasks]);

  useEffect(() => {
    if (!currentTask) return;
    api.browseFiles(currentTask.project_id, undefined, currentTask.scope_paths)
      .then((res) => setRepoFiles(res.files))
      .catch(() => setRepoFiles([]));
  }, [currentTask?.task_id]);

  // Load the content of the chosen file: staged version first, otherwise the repository version
  const existingFile = repoFiles.find((f) => f.path === filePath.trim());
  const stagedFile = stagedFiles.find((f) => f.path === filePath.trim());
  useEffect(() => {
    if (stagedFile) setFileContent(stagedFile.content);
    else if (existingFile) setFileContent(existingFile.content);
  }, [filePath, repoFiles]);

  // When task changes, preload first scope path as suggested file path
  useEffect(() => {
    if (currentTask && currentTask.scope_paths && currentTask.scope_paths.length > 0) {
      const prefix = currentTask.scope_paths[0];
      const suggested = prefix.endsWith('/') ? `${prefix}index.ts` : prefix;
      setFilePath(suggested);
      setCommitMessage(`feat(${prefix.replace(/\/$/, '')}): update implementation`);
    }
  }, [currentTask?.task_id]);

  const handleAddOrUpdateFile = () => {
    if (!filePath.trim()) return;
    const trimmedPath = filePath.trim();

    setStagedFiles((prev) => {
      const filtered = prev.filter((f) => f.path !== trimmedPath);
      return [...filtered, { path: trimmedPath, content: fileContent }];
    });
  };

  const handleRemoveStaged = (pathToRemove: string) => {
    setStagedFiles((prev) => prev.filter((f) => f.path !== pathToRemove));
  };

  const handlePush = async () => {
    if (!currentTask) return;
    setErrorMsg(null);

    // Make sure we have at least one file staged
    let filesToPush = [...stagedFiles];
    if (filesToPush.length === 0 && filePath.trim()) {
      filesToPush = [{ path: filePath.trim(), content: fileContent }];
    }

    if (filesToPush.length === 0) {
      setErrorMsg('Please stage at least one file before pushing.');
      return;
    }

    if (!commitMessage.trim()) {
      setErrorMsg('Commit message cannot be empty.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.pushWork(currentTask.task_id, filesToPush, commitMessage.trim());
      setPushReceipt({ sha: res.sha, status: res.status });
      setStagedFiles([]);
      onPushComplete();
    } catch (err: any) {
      setErrorMsg(err.message || 'Push failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentTask || currentTask.status !== TaskStatus.IN_PROGRESS) {
    return <p className="text-sm text-slate-400">Start one of your assigned tasks on the board to edit its files here.</p>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-sm text-slate-400">
          Editing <span className="text-slate-100">#{currentTask.task_id} {currentTask.title}</span>. You hold the lock on{' '}
          {currentTask.scope_paths.map((p, i) => (
            <React.Fragment key={p}>
              {i > 0 && ', '}
              <Code>{displayScope(p)}</Code>
            </React.Fragment>
          ))}
          .
        </p>
        {userInProgressTasks.length > 1 && (
          <select
            aria-label="Task to edit"
            value={activeTaskId || ''}
            onChange={(e) => {
              setActiveTaskId(Number(e.target.value));
              setPushReceipt(null);
            }}
            className={`${inputClass} w-auto`}
          >
            {userInProgressTasks.map((t) => (
              <option key={t.task_id} value={t.task_id}>
                #{t.task_id} {t.title}
              </option>
            ))}
          </select>
        )}
      </div>

      {errorMsg && <Notice>{errorMsg}</Notice>}

      <div className="grid gap-5 md:grid-cols-[1fr_220px]">
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <Field
              label="File"
              htmlFor="wb-path"
              hint={
                filePath.trim()
                  ? stagedFile
                    ? 'Showing your staged version.'
                    : existingFile
                    ? 'Existing file, loaded from the repository.'
                    : 'New file.'
                  : undefined
              }
            >
              <input
                id="wb-path"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
                list="workbench-scope-files"
                className={`${inputClass} font-mono text-[12px]`}
              />
            </Field>
            <datalist id="workbench-scope-files">
              {repoFiles.map((f) => (
                <option key={f.path} value={f.path} />
              ))}
            </datalist>
          </div>
          <textarea
            aria-label="File content"
            rows={16}
            value={fileContent}
            onChange={(e) => setFileContent(e.target.value)}
            spellCheck={false}
            className="w-full resize-y rounded border border-slate-700 bg-slate-950 p-3 font-mono text-[12px] leading-relaxed text-slate-100 focus:border-blue-500 focus:outline-none"
          />
          <Button size="sm" onClick={handleAddOrUpdateFile}>
            Stage this file
          </Button>
        </div>

        <div>
          <h3 className="text-xs font-medium text-slate-300">Staged ({stagedFiles.length})</h3>
          {stagedFiles.length === 0 ? (
            <p className="mt-1 text-xs text-slate-500">Nothing staged. The open file is committed if you push without staging.</p>
          ) : (
            <ul className="mt-1.5 space-y-1">
              {stagedFiles.map((sf) => (
                <li key={sf.path} className="flex items-baseline justify-between gap-2">
                  <button onClick={() => setFilePath(sf.path)} className="truncate text-left">
                    <Code>{sf.path}</Code>
                  </button>
                  <Button size="sm" variant="quiet" className="text-xs" onClick={() => handleRemoveStaged(sf.path)}>
                    Unstage
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 border-t border-slate-800 pt-4 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Field label="Commit message" htmlFor="wb-msg">
            <input id="wb-msg" value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <Button variant="primary" disabled={submitting} onClick={handlePush}>
          {submitting ? 'Committing…' : 'Commit and finish task'}
        </Button>
      </div>
    </div>
  );
};
