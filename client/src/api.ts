import {
  Task,
  Project,
  User,
  DeveloperStats,
  FileLock,
  ActivityLogItem,
  GitFileItem,
  GitCommit,
  TaskStatus,
  GitGraphNode,
  GitMetadata,
  ScrumFileData,
} from './types';

const API_BASE = '/api';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('sprintvault_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...options.headers,
  };

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    if (data.error === 'rejectStart') {
      throw new Error(`Start rejected: ${data.reason}`);
    }
    if (data.error === 'rejectPush') {
      throw new Error(`Push rejected: ${data.reason}`);
    }
    if (data.error === 'access denied') {
      throw new Error('Access denied: Unauthorized role or unauthenticated');
    }
    throw new Error(data.error || data.reason || `HTTP error ${res.status}`);
  }

  return data as T;
}

export const api = {
  // Auth
  login: async (email: string, password: string = 'password123') => {
    return request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },
  getMe: async () => {
    return request<{ user: User }>('/auth/me');
  },
  getUsers: async () => {
    return request<{ users: Array<{ user_id: number; name: string; email: string; role: string }> }>('/auth/users');
  },
  logout: async () => {
    return request<{ success: boolean }>('/auth/logout', { method: 'POST' });
  },

  // Projects
  getProjects: async () => {
    return request<{ projects: Project[] }>('/projects');
  },
  getProject: async (projectId: number) => {
    return request<{ project: Project; members: User[]; tasks: Task[]; repoPath: string; gitMetadata: GitMetadata }>(`/projects/${projectId}`);
  },
  createProject: async (name: string, repoUrl: string, defaultBranch: string = 'main', memberIds: number[] = [], customPath?: string) => {
    return request<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify({ name, repoUrl, defaultBranch, memberIds, customPath }),
    });
  },
  uploadProjectZip: async (formData: FormData) => {
    const token = localStorage.getItem('sprintvault_token');
    const res = await fetch(`${API_BASE}/projects/upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    return data as { project: Project; message: string };
  },
  importLocalProject: async (dirPath: string, name?: string, defaultBranch: string = 'main', memberIds: number[] = []) => {
    return request<{ project: Project; message: string }>('/projects/import-local', {
      method: 'POST',
      body: JSON.stringify({ dirPath, name, defaultBranch, memberIds }),
    });
  },
  addProjectMember: async (projectId: number, devId: number) => {
    return request<{ success: boolean; members: number[] }>(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ devId }),
    });
  },
  getCommitGraph: async (projectId: number) => {
    return request<{ nodes: GitGraphNode[]; rawGraphText: string }>(`/projects/${projectId}/graph`);
  },
  getGitMetadata: async (projectId: number) => {
    return request<{ metadata: GitMetadata }>(`/projects/${projectId}/metadata`);
  },
  getScrumFile: async (projectId: number) => {
    return request<{ scrumFile: ScrumFileData }>(`/projects/${projectId}/scrum-file`);
  },
  getCommits: async (projectId: number) => {
    return request<{ commits: GitCommit[] }>(`/projects/${projectId}/commits`);
  },
  getCommitDetails: async (projectId: number, sha: string) => {
    return request<{ details: { sha: string; message: string; diff: string } }>(`/projects/${projectId}/commits/${sha}`);
  },

  // Tasks
  getTasks: async (projectId?: number) => {
    const q = projectId ? `?projectId=${projectId}` : '';
    return request<{ tasks: Task[] }>(`/tasks${q}`);
  },
  createTask: async (projectId: number, title: string, scopePaths: string[]) => {
    return request<{ task: Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify({ projectId, title, scopePaths }),
    });
  },
  assignTask: async (taskId: number, devId: number) => {
    return request<{ task: Task }>(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ devId }),
    });
  },
  startWork: async (taskId: number) => {
    return request<{ message: string; lock: FileLock }>(`/tasks/${taskId}/start`, {
      method: 'POST',
    });
  },
  commitDone: async (taskId: number, commitSha?: string, pendingMessage?: string) => {
    return request<{ message: string; sha: string; status: TaskStatus; detail: string }>(`/tasks/${taskId}/commit-done`, {
      method: 'POST',
      body: JSON.stringify({ commitSha, pendingMessage }),
    });
  },
  pushWork: async (taskId: number, files: { path: string; content: string }[], msg: string) => {
    return request<{ message: string; sha: string; status: TaskStatus }>(`/tasks/${taskId}/push`, {
      method: 'POST',
      body: JSON.stringify({ files, msg }),
    });
  },
  forceRelease: async (taskId: number) => {
    return request<{ success: boolean; message: string }>(`/tasks/${taskId}/force-release`, {
      method: 'POST',
    });
  },

  // Git
  browseFiles: async (projectId: number, branch?: string, scope?: string[]) => {
    let q = '';
    const params = new URLSearchParams();
    if (branch) params.append('branch', branch);
    if (scope && scope.length > 0) {
      scope.forEach((s) => params.append('scope', s));
    }
    const queryString = params.toString();
    if (queryString) q = `?${queryString}`;
    return request<{ files: GitFileItem[] }>(`/git/browse/${projectId}${q}`);
  },
  pullCode: async (projectId: number, scope: string[]) => {
    return request<{ message: string; snapshot: GitFileItem[] }>('/git/pull', {
      method: 'POST',
      body: JSON.stringify({ projectId, scope }),
    });
  },

  // Dashboard
  getDashboard: async () => {
    return request<{
      role: string;
      user: User;
      tasks: Task[];
      developerStats: DeveloperStats[];
      activeLocks: any[];
      recentActivity: ActivityLogItem[];
    }>('/dashboard');
  },
};
