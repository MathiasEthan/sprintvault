import path from 'path';
import fs from 'fs';
import { GitFileItem, GitGraphNode, GitMetadata } from '../types';
import { GitHost } from './GitHost';
import { prefixOverlaps } from '../models/FileLock';
import { db } from '../db/database';

/**
 * GitService is the only component that talks to the Git Host (ARCHITECTURE §4).
 */
export class GitService {
  public repoPath: string;
  public defaultBranch: string;

  constructor(repoPath: string, defaultBranch: string = 'main') {
    this.repoPath = repoPath;
    this.defaultBranch = defaultBranch;
  }

  static forProject(project: { projectId: number; defaultBranch: string }): GitService {
    return new GitService(GitService.getProjectRepoPath(project.projectId), project.defaultBranch);
  }

  static getReposBaseDir(): string {
    return process.env.REPOS_PATH || path.resolve(process.cwd(), 'repos');
  }

  /**
   * Imported projects live in their own directory (repo_url = file://<dir>, not a bare repo);
   * every other project lives in <REPOS_PATH>/project-<id>.
   */
  static getProjectRepoPath(projectId: number): string {
    const row = db.prepare('SELECT repo_url FROM projects WHERE project_id = ?').get(projectId) as { repo_url: string } | undefined;
    const localDir = row ? GitService.localWorkingDirFromUrl(row.repo_url) : null;
    return localDir || path.join(GitService.getReposBaseDir(), `project-${projectId}`);
  }

  static localWorkingDirFromUrl(repoUrl: string): string | null {
    if (!repoUrl.startsWith('file://')) return null;
    const dir = repoUrl.slice('file://'.length);
    return GitHost.isBareRepo(dir) ? null : dir;
  }

  /**
   * A project's repoUrl is used as `origin` when it points to a real Git remote.
   * `git://local/...` (the default) means the project is local-only.
   */
  static remoteUrlFor(repoUrl: string): string | null {
    const url = repoUrl.trim();
    if (!url || url.startsWith('git://local/')) return null;
    if (/^(https?:\/\/|ssh:\/\/|git:\/\/|git@[^:]+:)/.test(url)) return url;
    if (url.startsWith('file://')) return GitHost.isBareRepo(url.slice('file://'.length)) ? url : null;
    if (path.isAbsolute(url) && GitHost.isBareRepo(url)) return url;
    return null;
  }

  static isValidBranchName(name: string): boolean {
    return GitHost.isValidBranchName(name);
  }

  static isRepo(dir: string): boolean {
    return GitHost.isRepo(dir);
  }

  /**
   * Creates the project repository: clones the remote if it already has the branch,
   * otherwise initializes a repo from the directory contents (+ starter files) and links origin.
   */
  initialize(remoteUrl: string | null, starterFiles: { path: string; content: string }[] = []): void {
    if (GitHost.isRepo(this.repoPath)) {
      if (remoteUrl) GitHost.setRemote(this.repoPath, remoteUrl);
      return;
    }
    const dirIsEmpty = !fs.existsSync(this.repoPath) || fs.readdirSync(this.repoPath).length === 0;
    if (remoteUrl && dirIsEmpty && GitHost.remoteHasBranch(remoteUrl, this.defaultBranch)) {
      GitHost.clone(remoteUrl, this.repoPath, this.defaultBranch);
      return;
    }
    GitHost.initRepo(this.repoPath, this.defaultBranch, starterFiles);
    if (remoteUrl) GitHost.setRemote(this.repoPath, remoteUrl);
  }

  /**
   * fetch(scope): Calls GitHost.readTree(branch) and filters by scope paths if provided.
   */
  fetch(scope: string[] = []): GitFileItem[] {
    const allFiles = GitHost.readTree(this.defaultBranch, this.repoPath).filter((f) => f.path !== '.scrum.json');

    if (!scope || scope.length === 0 || (scope.length === 1 && (scope[0] === '' || scope[0] === '*'))) {
      return allFiles;
    }

    // Filter files matching any prefix in scope
    return allFiles.filter((item) => {
      return scope.some((prefix) => prefixOverlaps(prefix, item.path));
    });
  }

  /**
   * commitAndPush(files, msg): Calls GitHost.push(commit), publishes to origin and returns the SHA.
   * If publishing fails the local commit is rolled back so the repository is unchanged.
   */
  commitAndPush(
    files: { path: string; content: string }[],
    msg: string,
    author: { name: string; email: string }
  ): string {
    this.sync();
    const sha = GitHost.push({
      repoPath: this.repoPath,
      branch: this.defaultBranch,
      files,
      msg,
      author,
    });
    try {
      GitHost.publish(this.repoPath, this.defaultBranch);
    } catch (err: any) {
      GitHost.rollbackLastCommit(this.repoPath, files.map((f) => f.path));
      throw new Error(`Push to remote failed: ${err.message}`);
    }
    return sha;
  }

  /**
   * Commits a developer's pending working-tree changes, limited to the task scope.
   */
  commitScopeChanges(scope: string[], author: { name: string; email: string }, msg: string): string {
    const pathspecs = scope.map((s) => s.replace(/^\/+|\/+$/g, '') || '.');
    const sha = GitHost.commitPaths(this.repoPath, pathspecs, author, msg);
    this.publishQuietly();
    return sha;
  }

  /**
   * Commits .scrum.json for a Scrum change and publishes it so every clone receives it.
   * Failures are logged, never fatal: the Scrum change itself already happened in the DB.
   */
  recordScrumChange(message: string): string | null {
    try {
      const sha = GitHost.commitScrumFile(this.repoPath, message);
      this.publishQuietly();
      return sha;
    } catch (err: any) {
      console.error(`Scrum commit failed in ${this.repoPath}:`, err.message);
      return null;
    }
  }

  /**
   * Pulls commits developers pushed from their own machines (no-op for local-only projects).
   */
  sync(): void {
    GitHost.syncFromRemote(this.repoPath, this.defaultBranch);
  }

  hasRemote(): boolean {
    return !!GitHost.getRemoteUrl(this.repoPath);
  }

  private publishQuietly(): void {
    try {
      GitHost.publish(this.repoPath, this.defaultBranch);
    } catch (err: any) {
      console.error(`Publishing ${this.repoPath} to origin failed (will retry on next change):`, err.message);
    }
  }

  // ---------- Read-only inspection ----------

  resolveCommit(ref: string): string | null {
    return GitHost.resolveCommit(this.repoPath, ref);
  }

  isOnDefaultBranch(sha: string): boolean {
    return GitHost.isAncestor(this.repoPath, sha, `refs/heads/${this.defaultBranch}`);
  }

  isServiceCommit(sha: string): boolean {
    return GitHost.getCommitAuthorEmail(this.repoPath, sha) === GitHost.serviceUser.email;
  }

  commitTime(sha: string): number {
    return GitHost.getCommitTime(this.repoPath, sha);
  }

  latestCommit() {
    return GitHost.getLatestCommit(this.repoPath);
  }

  log(limit: number) {
    return GitHost.getLog(this.repoPath, limit);
  }

  commitDetails(sha: string) {
    return GitHost.getCommitDetails(this.repoPath, sha);
  }

  commitGraph(limit: number): { nodes: GitGraphNode[]; rawGraphText: string } {
    return GitHost.getCommitGraph(this.repoPath, limit);
  }

  metadata(): GitMetadata {
    return GitHost.getGitMetadata(this.repoPath);
  }
}
