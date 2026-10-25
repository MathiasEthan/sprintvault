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

export interface UserRow {
  user_id: number;
  name: string;
  email: string;
  password_hash: string;
  role: UserRole;
}

export interface ProjectRow {
  project_id: number;
  name: string;
  repo_url: string;
  default_branch: string;
  created_by: number;
}

export interface TaskRow {
  task_id: number;
  project_id: number;
  title: string;
  scope_paths: string; // JSON string array
  status: TaskStatus;
  assignee_id: number | null;
  commit_sha: string | null;
  completed_at: string | null;
}

export interface FileLockRow {
  lock_id: number;
  task_id: number;
  owner_id: number;
  scope_paths: string; // JSON string array
  acquired_at: string;
  released_at: string | null;
  status: LockStatus;
}

export interface ActivityLogRow {
  log_id: number;
  user_id: number;
  action: ActionType;
  ref: string;
  created_at: string;
}

export interface DeveloperStatsRow {
  user_id: number;
  push_count: number;
  pull_count: number;
  tasks_completed: number;
  last_activity_at: string | null;
}

export interface GitFileItem {
  path: string;
  content: string;
  size?: number;
}

export interface CommitInfo {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
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
