import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { Code, Modal, Notice } from './ui';

interface CommitDiffModalProps {
  projectId: number | null;
  sha: string | null;
  onClose: () => void;
}

export const CommitDiffModal: React.FC<CommitDiffModalProps> = ({ projectId, sha, onClose }) => {
  const [details, setDetails] = useState<{ sha: string; message: string; diff: string } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId || !sha) return;
    setLoading(true);
    setError(null);
    api.getCommitDetails(projectId, sha)
      .then((res) => {
        setDetails(res.details);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load commit diff');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [projectId, sha]);

  if (!sha) return null;


  return (
    <Modal title={details?.message.split('\n')[0] || 'Commit'} description={<Code className="text-slate-400">{sha}</Code>} onClose={onClose} wide>
      {loading ? (
        <p className="py-10 text-sm text-slate-500">Loading the commit…</p>
      ) : error ? (
        <Notice>{error === 'Commit not found' ? 'This commit is not in the selected project.' : error}</Notice>
      ) : details ? (
        <>
          {details.message.includes('\n') && (
            <p className="whitespace-pre-wrap text-sm text-slate-300">{details.message.split('\n').slice(1).join('\n').trim()}</p>
          )}
          <div className="max-h-[60vh] overflow-auto rounded border border-slate-800 bg-slate-950 py-2 font-mono text-[12px] leading-[1.6]">
            {details.diff.split('\n').map((line, idx) => {
              let cls = 'text-slate-400';
              if (line.startsWith('+') && !line.startsWith('+++')) cls = 'bg-blue-950/60 text-blue-200';
              else if (line.startsWith('-') && !line.startsWith('---')) cls = 'bg-rose-950/50 text-rose-200';
              else if (line.startsWith('@@')) cls = 'text-slate-500';
              else if (line.startsWith('diff ')) cls = 'mt-3 text-slate-100 first:mt-0';
              return (
                <div key={idx} className={`whitespace-pre px-3 ${cls}`}>
                  {line || ' '}
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </Modal>
  );
};
