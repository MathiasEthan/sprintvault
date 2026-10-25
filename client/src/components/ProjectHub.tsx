import React from 'react';
import { Project, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  FolderGit2,
  FolderArchive,
  Plus,
  GitBranch,
  CheckCircle2,
  Lock,
  Clock,
  ArrowRight,
  HardDrive,
  Users,
} from 'lucide-react';

interface ProjectHubProps {
  projects: Project[];
  onSelectProject: (projectId: number) => void;
  onOpenUploadModal: () => void;
  onOpenCreateModal: () => void;
}

export const ProjectHub: React.FC<ProjectHubProps> = ({
  projects,
  onSelectProject,
  onOpenUploadModal,
  onOpenCreateModal,
}) => {
  const { currentUser } = useAuth();
  const isManager = currentUser?.role === UserRole.MANAGER;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900/80 p-5 rounded-xl border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <FolderGit2 className="w-6 h-6 text-blue-400" />
            <span>Projects Hub</span>
            <span className="text-xs bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700">
              {projects.length} {projects.length === 1 ? 'project' : 'projects'}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Manage multiple Scrum projects. Each project tracks its tasks locally in a single <code className="text-blue-300">.scrum.json</code> file alongside its <code className="text-blue-300">.git</code> folder.
          </p>
        </div>

        {isManager && (
          <div className="flex items-center space-x-2.5">
            <button
              onClick={onOpenUploadModal}
              className="flex items-center space-x-1.5 bg-blue-600 hover:bg-blue-500 text-white px-3.5 py-2 rounded-lg text-xs font-semibold transition shadow-md shadow-blue-900/30"
            >
              <FolderArchive className="w-4 h-4" />
              <span>Upload / Import Project</span>
            </button>
            <button
              onClick={onOpenCreateModal}
              className="flex items-center space-x-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-700 transition"
            >
              <Plus className="w-4 h-4" />
              <span>New Project</span>
            </button>
          </div>
        )}
      </div>

      {/* Projects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {projects.map((p) => {
          const totalTasks = p.taskCount || 0;
          const completed = p.completedTaskCount || 0;
          const percent = totalTasks > 0 ? Math.round((completed / totalTasks) * 100) : 0;

          return (
            <div
              key={p.projectId}
              className="bg-slate-900/70 rounded-xl border border-slate-800 hover:border-blue-500/50 p-5 flex flex-col justify-between transition shadow-sm group space-y-4"
            >
              {/* Card top */}
              <div className="space-y-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-600/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                      <FolderGit2 className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white group-hover:text-blue-300 transition">
                        {p.name}
                      </h3>
                      <span className="text-[10px] text-slate-400 font-mono">
                        ID #{p.projectId}
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] bg-slate-800 text-slate-300 font-mono px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                    <GitBranch className="w-3 h-3 text-blue-400" />
                    <span>{p.defaultBranch}</span>
                  </span>
                </div>

                {/* Local repo path */}
                <div className="text-[11px] font-mono text-slate-400 bg-slate-950/80 px-2.5 py-1.5 rounded border border-slate-800/80 truncate">
                  <span className="text-slate-500 mr-1.5">path:</span>
                  <span className="text-slate-300">{p.repoPath || p.repoUrl}</span>
                </div>

                {/* Badges: .git active & .scrum.json tracked */}
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>.git active</span>
                  </span>
                  <span className="text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <HardDrive className="w-3 h-3 text-blue-400" />
                    <span>.scrum.json tracked</span>
                  </span>
                </div>
              </div>

              {/* Progress & Task Counts */}
              <div className="space-y-2 pt-2 border-t border-slate-800">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Sprint Progress:</span>
                  <span className="text-white font-semibold">
                    {completed} / {totalTasks} tasks ({percent}%)
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                  <div
                    className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>

              {/* Card Footer / Action */}
              <button
                onClick={() => onSelectProject(p.projectId)}
                className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-blue-600 text-slate-200 hover:text-white py-2 rounded-lg text-xs font-semibold transition group-hover:bg-blue-600 group-hover:text-white"
              >
                <span>Open Project Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
