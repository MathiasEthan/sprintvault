import React from 'react';
import { Project, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { Button, Code, PageHeader } from './ui';

interface ProjectHubProps {
  projects: Project[];
  onSelectProject: (projectId: number) => void;
  onOpenUploadModal: () => void;
  onOpenCreateModal: () => void;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({ projects, onSelectProject, onOpenUploadModal, onOpenCreateModal }) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === UserRole.MANAGER;

  return (
    <div>
      <PageHeader
        title="Projects"
        meta={<span>{isManager ? 'Every repository SprintVault manages.' : 'Projects you are a member of.'}</span>}
        actions={
          isManager && (
            <>
              <Button onClick={onOpenUploadModal}>Import project</Button>
              <Button variant="primary" onClick={onOpenCreateModal}>
                New project
              </Button>
            </>
          )
        }
      />

      {projects.length === 0 ? (
        <p className="text-sm text-slate-400">
          {isManager ? 'Create a project or import an existing repository to start planning.' : 'You have not been added to a project yet. Ask your team lead.'}
        </p>
      ) : (
        <ul className="divide-y divide-slate-800 border-y border-slate-800">
          {projects.map((p) => {
            const total = p.taskCount || 0;
            const done = p.completedTaskCount || 0;
            return (
              <li key={p.projectId}>
                <button
                  onClick={() => onSelectProject(p.projectId)}
                  className="grid w-full grid-cols-1 gap-2 py-4 text-left transition-colors hover:bg-slate-900/60 sm:grid-cols-[1fr_auto] sm:items-center sm:px-2"
                >
                  <div className="min-w-0">
                    <p className="font-display text-base text-slate-50">{p.name}</p>
                    <p className="mt-1 flex min-w-0 flex-wrap items-center gap-x-4 text-sm text-slate-500">
                      <Code className="text-slate-400">{p.defaultBranch}</Code>
                      <span className="truncate">{p.repoPath || p.repoUrl}</span>
                    </p>
                  </div>
                  <div className="w-full sm:w-48">
                    <p className="tabular text-right text-sm text-slate-300">
                      {total === 0 ? 'No tasks yet' : `${done} of ${total} done`}
                    </p>
                    <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-slate-800">
                      <div className="h-full bg-blue-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
