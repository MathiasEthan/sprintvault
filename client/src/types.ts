export enum TaskStatus {
  CREATED = 'CREATED',
  ASSIGNED = 'ASSIGNED',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum LockStatus {
  ACTIVE = 'ACTIVE',
  RELEASED = 'RELEASED',
  REVOKED = 'REVOKED',
}

export enum ActionType {
  LOCK = 'LOCK',
  PULL = 'PULL',
  PUSH = 'PUSH',
  FORCE_UNLOCK = 'FORCE_UNLOCK',
}

export enum UserRole {
  MANAGER = 'MANAGER',
  DEVELOPER = 'DEVELOPER',
}

export interface User {
  userId: number;
  name: string;
  email: string;
  role: UserRole;
}

export interface Project {
  projectId: number;
  name: string;
  repoUrl: string;
  defaultBranch: string;
  createdBy: number;
  members?: number[];
  taskCount?: number;
  completedTaskCount?: number;
  repoPath?: string;
  gitMetadata?: GitMetadata;
}

export interface Task {
  task_id: number;
  project_id: number;
  project_name?: string;
  title: string;
  scope_paths: string[];
  status: TaskStatus;
  assignee_id: number | null;
  assignee_name?: string;
  assignee_email?: string;
  commit_sha: string | null;
  completed_at: string | null;
  has_active_lock?: boolean;
  lock_id?: number;
  lock_owner_id?: number;
  lock_owner_name?: string;
  lock_acquired_at?: string;
}

export interface DeveloperStats {
  user_id: number;
  name?: string;
  email?: string;
  push_count: number;
  pull_count: number;
  tasks_completed: number;
  last_activity_at: string | null;
}

export interface FileLock {
  lock_id: number;
  task_id: number;
  task_title?: string;
  owner_id: number;
  owner_name?: string;
  scope_paths: string[];
  acquired_at: string;
  released_at: string | null;
  status: LockStatus;
}

export interface ActivityLogItem {
  log_id: number;
  user_id: number;
  user_name: string;
  user_role: string;
  action: ActionType;
  ref: string;
  created_at: string;
}

export interface GitFileItem {
  path: string;
  content: string;
  size?: number;
}

export interface GitCommit {
  sha: string;
  message: string;
  authorName: string;
  authorEmail: string;
  date: string;
}

export interface GitGraphNode {
  sha: string;
  shortSha: string;
  parents: string[];
  authorName: string;
  authorEmail: string;
  date: string;
  message: string;
  branches: string[];
  tags: string[];
  isHead: boolean;
  linkedTask?: {
    taskId: number;
    title: string;
    assigneeName?: string;
  };
}

export interface GitMetadata {
  gitDirExists: boolean;
  headRef: string;
  currentBranch: string;
  branches: string[];
  tags: string[];
  totalCommits: number;
  config: string;
  hasUncommittedChanges: boolean;
  uncommittedFiles: string[];
  scrumFileExists: boolean;
}

export interface ScrumFileData {
  schemaVersion: string;
  projectId: number;
  projectName: string;
  repoUrl: string;
  defaultBranch: string;
  lastSyncedAt: string;
  members: Array<{ userId: number; name: string; email: string; role: string }>;
  tasks: Array<{
    taskId: number;
    title: string;
    scopePaths: string[];
    status: string;
    assigneeId: number | null;
    assigneeName?: string;
    commitSha: string | null;
    completedAt: string | null;
  }>;
  activeLocks: Array<{
    lockId: number;
    taskId: number;
    ownerId: number;
    ownerName?: string;
    scopePaths: string[];
    acquiredAt: string;
  }>;
  recentActivity: Array<{
    logId: number;
    userName: string;
    action: string;
    ref: string;
    createdAt: string;
  }>;
}
