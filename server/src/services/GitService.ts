import path from 'path';
import { GitFileItem } from '../types';
import { GitHost } from './GitHost';
import { prefixOverlaps } from '../models/FileLock';

export class GitService {
  public repoPath: string;
  public defaultBranch: string;

  constructor(repoPath: string, defaultBranch: string = 'main') {
    this.repoPath = repoPath;
    this.defaultBranch = defaultBranch;
  }

  static getProjectRepoPath(projectId: number): string {
    const baseDir = process.env.REPOS_PATH || path.resolve(process.cwd(), 'repos');
    return path.join(baseDir, `project-${projectId}`);
  }

  /**
   * fetch(scope): Calls GitHost.readTree(branch) and filters by scope paths if provided.
   */
  fetch(scope: string[] = []): GitFileItem[] {
    const allFiles = GitHost.readTree(this.defaultBranch, this.repoPath);

    if (!scope || scope.length === 0 || (scope.length === 1 && (scope[0] === '' || scope[0] === '*'))) {
      return allFiles;
    }

    // Filter files matching any prefix in scope
    return allFiles.filter((item) => {
      return scope.some((prefix) => prefixOverlaps(prefix, item.path));
    });
  }

  /**
   * commitAndPush(files, msg): Calls GitHost.push(commit) and returns commit SHA.
   */
  commitAndPush(
    files: { path: string; content: string }[],
    msg: string,
    author: { name: string; email: string }
  ): string {
    return GitHost.push({
      repoPath: this.repoPath,
      branch: this.defaultBranch,
      files,
      msg,
      author,
    });
  }
}
