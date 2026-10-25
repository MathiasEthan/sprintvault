import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Navbar } from './components/Navbar';
import { ScrumBoard } from './components/ScrumBoard';
import { GitCommitGraph } from './components/GitCommitGraph';
import { GitInspector } from './components/GitInspector';
import { ProjectHub } from './components/ProjectHub';
import { DashboardView } from './components/DashboardView';
import { LoginView } from './components/LoginView';
import { CreateTaskModal } from './components/CreateTaskModal';
import { CreateProjectModal } from './components/CreateProjectModal';
import { CommitDoneModal } from './components/CommitDoneModal';
import { UploadProjectModal } from './components/UploadProjectModal';
import { CommitDiffModal } from './components/CommitDiffModal';
import { PushWorkbench } from './components/PushWorkbench';
import { api } from './api';
import { Task, Project, TaskStatus } from './types';
import { AlertCircle, CheckCircle2, Info, FolderGit2, HardDrive, GitBranch } from 'lucide-react';

function AppContent() {
  const { currentUser, allUsers, loading: authLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<'projects' | 'board' | 'graph' | 'inspector' | 'dashboard'>('board');

  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loadingTasks, setLoadingTasks] = useState<boolean>(false);

  // Modals state
  const [createTaskOpen, setCreateTaskOpen] = useState<boolean>(false);
  const [createProjectOpen, setCreateProjectOpen] = useState<boolean>(false);
  const [uploadProjectOpen, setUploadProjectOpen] = useState<boolean>(false);
  const [activeDiffSha, setActiveDiffSha] = useState<string | null>(null);

  // Commit Done modal state
  const [commitDoneTask, setCommitDoneTask] = useState<Task | null>(null);
  const [workbenchTask, setWorkbenchTask] = useState<Task | null>(null);

  // Global notification banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
    setBanner({ type, message });
    setTimeout(() => setBanner(null), 6000);
  };

  // Load projects
  const loadProjects = async () => {
    try {
      const res = await api.getProjects();
      setProjects(res.projects);
      if (res.projects.length > 0 && !selectedProjectId) {
        setSelectedProjectId(res.projects[0].projectId);
      }
    } catch (err: any) {
      console.error('Failed to load projects:', err);
    }
  };

  // Load tasks for active project
  const loadTasks = async () => {
    setLoadingTasks(true);
    try {
      const res = await api.getTasks(selectedProjectId || undefined);
      setTasks(res.tasks);
    } catch (err: any) {
      console.error('Failed to load tasks:', err);
    } finally {
      setLoadingTasks(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadProjects();
    }
  }, [currentUser?.userId]);

  useEffect(() => {
    if (currentUser && selectedProjectId) {
      loadTasks();
    }
  }, [currentUser?.userId, selectedProjectId]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <div className="text-sm">Initializing SprintVault...</div>
      </div>
    );
  }

  if (!currentUser) {
    return <LoginView />;
  }

  const selectedProject = projects.find((p) => p.projectId === selectedProjectId) || projects[0] || null;

  // Handlers
  const handleStartWork = async (taskId: number) => {
    try {
      await api.startWork(taskId);
      showBanner('success', `Lock acquired on Task #${taskId}! Task is now IN_PROGRESS.`);
      await loadTasks();
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const handleOpenCommitDone = (task: Task) => {
    setCommitDoneTask(task);
  };

  const handleCommitDoneSuccess = async (sha: string) => {
    showBanner('success', `Commit linked (${sha.substring(0, 7)})! Task completed & file lock released.`);
    await loadTasks();
    await loadProjects();
  };

  const handleAssignTask = async (taskId: number, devId: number) => {
    try {
      await api.assignTask(taskId, devId);
      showBanner('success', `Task #${taskId} assigned.`);
      await loadTasks();
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const handleForceRelease = async (taskId: number) => {
    try {
      await api.forceRelease(taskId);
      showBanner('info', `Lock revoked on Task #${taskId}. Reset to ASSIGNED.`);
      await loadTasks();
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const handleCreateTask = async (projectId: number, title: string, scopePaths: string[]) => {
    await api.createTask(projectId, title, scopePaths);
    showBanner('success', 'Task created in Backlog.');
    await loadTasks();
    await loadProjects();
  };

  const handleCreateProject = async (name: string, repoUrl: string, defaultBranch: string, memberIds: number[]) => {
    const res = await api.createProject(name, repoUrl, defaultBranch, memberIds);
    showBanner('success', `Project '${name}' created!`);
    await loadProjects();
    setSelectedProjectId(res.project.projectId);
    setCurrentTab('board');
  };

  const handlePullScope = async (scope: string[]) => {
    if (!selectedProjectId) return;
    try {
      const res = await api.pullCode(selectedProjectId, scope);
      showBanner('success', `Snapshot of ${res.snapshot.length} files pulled. Developer pull counter +1.`);
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => setSelectedProjectId(id)}
        onOpenUploadModal={() => setUploadProjectOpen(true)}
      />

      {/* Global alert banner */}
      {banner && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full mt-4">
          <div
            className={`p-3 rounded-lg border text-xs flex items-center justify-between shadow-lg ${
              banner.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-700 text-emerald-200'
                : banner.type === 'error'
                ? 'bg-rose-950/80 border-rose-700 text-rose-200'
                : 'bg-blue-950/80 border-blue-700 text-blue-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {banner.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
              {banner.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />}
              {banner.type === 'info' && <Info className="w-4 h-4 text-blue-400 flex-shrink-0" />}
              <span>{banner.message}</span>
            </div>
            <button onClick={() => setBanner(null)} className="text-slate-400 hover:text-white text-xs ml-4">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Per-Project Active Banner (when inside a project view) */}
      {selectedProject && currentTab !== 'projects' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 w-full pt-4">
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center space-x-3">
              <span className="font-bold text-white flex items-center gap-1.5">
                <FolderGit2 className="w-4 h-4 text-blue-400" />
                <span>{selectedProject.name}</span>
              </span>

              <span className="text-[11px] font-mono bg-slate-800 text-slate-300 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1">
                <GitBranch className="w-3 h-3 text-blue-400" />
                <span>{selectedProject.defaultBranch}</span>
              </span>

              <span className="text-[11px] text-slate-400 font-mono hidden md:inline truncate max-w-sm">
                {selectedProject.repoPath || selectedProject.repoUrl}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[10px] bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                <span>.git folder</span>
              </span>
              <span className="text-[10px] bg-blue-950/60 text-blue-300 border border-blue-800/60 px-2 py-0.5 rounded-full flex items-center gap-1">
                <HardDrive className="w-3 h-3 text-blue-400" />
                <span>.scrum.json</span>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 w-full">
        {currentTab === 'projects' && (
          <ProjectHub
            projects={projects}
            onSelectProject={(id) => {
              setSelectedProjectId(id);
              setCurrentTab('board');
            }}
            onOpenUploadModal={() => setUploadProjectOpen(true)}
            onOpenCreateModal={() => setCreateProjectOpen(true)}
          />
        )}

        {currentTab === 'board' && (
          <ScrumBoard
            tasks={tasks}
            users={allUsers}
            onStartWork={handleStartWork}
            onOpenCommitDone={handleOpenCommitDone}
            onOpenPushModal={(task) => {
              setWorkbenchTask(task);
            }}
            onAssignTask={handleAssignTask}
            onForceRelease={handleForceRelease}
            onOpenCommitDetails={(sha) => setActiveDiffSha(sha)}
            onCreateTaskClick={() => setCreateTaskOpen(true)}
            onPullCodeClick={handlePullScope}
            onViewCommitGraphClick={() => setCurrentTab('graph')}
          />
        )}

        {currentTab === 'graph' && selectedProjectId && (
          <GitCommitGraph
            projectId={selectedProjectId}
            onOpenCommitDetails={(sha) => setActiveDiffSha(sha)}
          />
        )}

        {currentTab === 'inspector' && selectedProject && (
          <GitInspector
            project={selectedProject}
            onPullScope={handlePullScope}
          />
        )}

        {currentTab === 'dashboard' && (
          <DashboardView onOpenCommitDetails={(sha) => setActiveDiffSha(sha)} />
        )}
      </main>

      {/* Modals */}
      <CommitDoneModal
        isOpen={!!commitDoneTask}
        onClose={() => setCommitDoneTask(null)}
        task={commitDoneTask}
        projectId={selectedProjectId || 1}
        onSuccess={handleCommitDoneSuccess}
      />

      <UploadProjectModal
        isOpen={uploadProjectOpen}
        onClose={() => setUploadProjectOpen(false)}
        users={allUsers}
        onSuccess={async (projectId) => {
          showBanner('success', 'Project added successfully!');
          await loadProjects();
          setSelectedProjectId(projectId);
          setCurrentTab('board');
        }}
      />

      <CreateTaskModal
        isOpen={createTaskOpen}
        onClose={() => setCreateTaskOpen(false)}
        projects={projects}
        defaultProjectId={selectedProjectId}
        onSubmit={handleCreateTask}
      />

      <CreateProjectModal
        isOpen={createProjectOpen}
        onClose={() => setCreateProjectOpen(false)}
        users={allUsers}
        onSubmit={handleCreateProject}
      />

      <CommitDiffModal
        projectId={selectedProjectId}
        sha={activeDiffSha}
        onClose={() => setActiveDiffSha(null)}
      />

      {workbenchTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6 shadow-2xl space-y-4">
            <div className="flex justify-between items-center border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">Browser Push Workbench (Alternative to Local Git)</h3>
              <button onClick={() => setWorkbenchTask(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <PushWorkbench
              tasks={tasks}
              selectedTask={workbenchTask}
              onPushComplete={async () => {
                showBanner('success', 'Pushed & task completed!');
                await loadTasks();
                setWorkbenchTask(null);
              }}
              onOpenCommitDetails={(sha) => setActiveDiffSha(sha)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
