import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
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
import { Task, Project, TaskStatus, GitMetadata, GitFileItem } from './types';
import { Button, Code, Modal, PageHeader } from './components/ui';

const POLL_INTERVAL_MS = 4000;

/**
 * Pull = download (LOGIC §4.2): package the snapshot as a .zip and hand it to the browser.
 */
async function downloadSnapshot(projectName: string, snapshot: GitFileItem[], scope: string[]) {
  const zip = new JSZip();
  for (const file of snapshot) {
    zip.file(file.path, file.content);
  }
  const blob = await zip.generateAsync({ type: 'blob' });
  const scopeLabel = scope.length ? scope.join('_').replace(/[^a-zA-Z0-9_-]+/g, '-') : 'all';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName.replace(/[^a-zA-Z0-9_-]+/g, '-')}-${scopeLabel}.zip`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

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
  const [activeDiff, setActiveDiff] = useState<{ sha: string; projectId: number | null } | null>(null);
  const openCommitDetails = (sha: string, projectId?: number | null) =>
    setActiveDiff({ sha, projectId: projectId ?? selectedProjectId });

  // Live sync: poll the server's change marker and refresh views when anyone changes the Scrum
  const [connected, setConnected] = useState<boolean>(true);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const lastVersion = useRef<number | null>(null);
  const [projectMeta, setProjectMeta] = useState<GitMetadata | null>(null);

  // Commit Done modal state
  const [commitDoneTask, setCommitDoneTask] = useState<Task | null>(null);
  const [workbenchTask, setWorkbenchTask] = useState<Task | null>(null);

  // Global notification banner
  const [banner, setBanner] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const bannerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showBanner = (type: 'success' | 'error' | 'info', message: string) => {
    setBanner({ type, message });
    if (bannerTimer.current) clearTimeout(bannerTimer.current);
    bannerTimer.current = setTimeout(() => setBanner(null), 6000);
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
  const loadTasks = async (background = false) => {
    if (!background) setLoadingTasks(true);
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

  // Real .git / .scrum.json status for the selected project
  useEffect(() => {
    if (!currentUser || !selectedProjectId) return;
    api.getGitMetadata(selectedProjectId)
      .then((res) => setProjectMeta(res.metadata))
      .catch(() => setProjectMeta(null));
  }, [currentUser?.userId, selectedProjectId, refreshKey]);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        const { version } = await api.getChanges();
        if (cancelled) return;
        setConnected(true);
        if (lastVersion.current !== null && version !== lastVersion.current) {
          loadProjects();
          if (selectedProjectId) loadTasks(true);
          setRefreshKey((k) => k + 1);
        }
        lastVersion.current = version;
      } catch {
        if (!cancelled) setConnected(false);
      }
    };
    poll();
    const timer = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [currentUser?.userId, selectedProjectId]);

  if (authLoading) {
    return (
      <p className="px-6 py-16 text-sm text-slate-500">Loading…</p>
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
      showBanner('success', `Started #${taskId}. Its scope is locked to you.`);
      await loadTasks();
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const handleOpenCommitDone = (task: Task) => {
    setCommitDoneTask(task);
  };

  const handleCommitDoneSuccess = async (sha: string) => {
    showBanner('success', `Linked ${sha.substring(0, 7)}. The task is done and its lock is released.`);
    await loadTasks();
    await loadProjects();
  };

  const handleAssignTask = async (taskId: number, devId: number) => {
    try {
      await api.assignTask(taskId, devId);
      showBanner('success', `Assigned #${taskId}.`);
      await loadTasks();
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const handleForceRelease = async (taskId: number) => {
    try {
      await api.forceRelease(taskId);
      showBanner('info', `Released the lock on #${taskId}. It is back in Assigned.`);
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
    showBanner('success', `Created ${name}.`);
    await loadProjects();
    setSelectedProjectId(res.project.projectId);
    setCurrentTab('board');
  };

  const handlePullScope = async (scope: string[]) => {
    if (!selectedProjectId) return;
    try {
      const res = await api.pullCode(selectedProjectId, scope);
      await downloadSnapshot(selectedProject?.name || 'project', res.snapshot, scope);
      showBanner('success', `Downloaded ${res.snapshot.length} ${res.snapshot.length === 1 ? 'file' : 'files'}.`);
    } catch (err: any) {
      showBanner('error', err.message);
    }
  };

  const projectHeader = selectedProject && (currentTab === 'board' || currentTab === 'graph' || currentTab === 'inspector') && (
    <PageHeader
      title={selectedProject.name}
      meta={
        <>
          <span>
            Branch <Code className="text-slate-300">{selectedProject.defaultBranch}</Code>
          </span>
          {projectMeta && <span className="tabular">{projectMeta.totalCommits} commits</span>}
          {projectMeta && !projectMeta.gitDirExists && <span className="text-rose-300">Repository folder missing</span>}
          {projectMeta?.hasUncommittedChanges && <span className="text-amber-300">Uncommitted changes on the server</span>}
        </>
      }
      actions={
        currentTab === 'board' &&
        currentUser.role === 'MANAGER' && (
          <Button variant="primary" onClick={() => setCreateTaskOpen(true)}>
            New task
          </Button>
        )
      }
    />
  );

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:z-50 focus:bg-slate-900 focus:px-3 focus:py-2">
        Skip to content
      </a>
      <Navbar
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        projects={projects}
        selectedProjectId={selectedProjectId}
        onSelectProject={(id) => setSelectedProjectId(id)}
        onOpenUploadModal={() => setUploadProjectOpen(true)}
        connected={connected}
      />

      <main id="main" className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
        {currentTab !== 'projects' && currentTab !== 'dashboard' && !selectedProject && (
          <p className="text-sm text-slate-400">
            No project selected.{' '}
            <button className="text-blue-300 underline underline-offset-2" onClick={() => setCurrentTab('projects')}>
              Open the project list
            </button>
          </p>
        )}

        {projectHeader}

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

        {currentTab === 'board' && selectedProject && (
          <ScrumBoard
            tasks={tasks}
            users={allUsers}
            onStartWork={handleStartWork}
            onOpenCommitDone={handleOpenCommitDone}
            onOpenPushModal={(task) => setWorkbenchTask(task)}
            onAssignTask={handleAssignTask}
            onForceRelease={handleForceRelease}
            onOpenCommitDetails={(sha) => openCommitDetails(sha)}
            onCreateTaskClick={() => setCreateTaskOpen(true)}
            onPullCodeClick={handlePullScope}
            onViewCommitGraphClick={() => setCurrentTab('graph')}
          />
        )}

        {currentTab === 'graph' && selectedProjectId && (
          <GitCommitGraph projectId={selectedProjectId} onOpenCommitDetails={(sha) => openCommitDetails(sha)} refreshKey={refreshKey} />
        )}

        {currentTab === 'inspector' && selectedProject && (
          <GitInspector project={selectedProject} onPullScope={handlePullScope} refreshKey={refreshKey} />
        )}

        {currentTab === 'dashboard' && <DashboardView onOpenCommitDetails={openCommitDetails} refreshKey={refreshKey} />}
      </main>

      {/* Toast: answers the user's last action */}
      {banner && (
        <div
          role={banner.type === 'error' ? 'alert' : 'status'}
          className={`fixed bottom-5 left-1/2 z-50 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 items-start gap-4 rounded-md border border-slate-800 border-l-[3px] bg-slate-900 px-4 py-3 text-sm text-slate-100 ${
            banner.type === 'error' ? 'border-l-rose-500' : banner.type === 'success' ? 'border-l-blue-500' : 'border-l-slate-500'
          }`}
        >
          <span className="flex-1">{banner.message}</span>
          <button onClick={() => setBanner(null)} className="text-slate-500 hover:text-slate-100" aria-label="Dismiss">
            Dismiss
          </button>
        </div>
      )}

      <CommitDoneModal
        isOpen={!!commitDoneTask}
        onClose={() => setCommitDoneTask(null)}
        task={commitDoneTask}
        projectId={commitDoneTask?.project_id ?? selectedProjectId ?? 0}
        onSuccess={handleCommitDoneSuccess}
      />

      <UploadProjectModal
        isOpen={uploadProjectOpen}
        onClose={() => setUploadProjectOpen(false)}
        users={allUsers}
        onSuccess={async (projectId) => {
          showBanner('success', 'Project imported.');
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

      <CreateProjectModal isOpen={createProjectOpen} onClose={() => setCreateProjectOpen(false)} users={allUsers} onSubmit={handleCreateProject} />

      <CommitDiffModal projectId={activeDiff?.projectId ?? null} sha={activeDiff?.sha ?? null} onClose={() => setActiveDiff(null)} />

      {workbenchTask && (
        <Modal title="Edit in browser" description="For quick changes. For real work, commit from your editor and use Commit done." onClose={() => setWorkbenchTask(null)} wide>
          <PushWorkbench
            tasks={tasks}
            selectedTask={workbenchTask}
            onPushComplete={async () => {
              showBanner('success', `Committed. Task #${workbenchTask.task_id} is done and its lock is released.`);
              await loadTasks();
              setWorkbenchTask(null);
            }}
            onOpenCommitDetails={(sha) => openCommitDetails(sha, workbenchTask.project_id)}
          />
        </Modal>
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
