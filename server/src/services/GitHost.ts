import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GitFileItem, GitGraphNode, GitMetadata } from '../types';

export class GitHost {
  private static defaultServiceUser = {
    name: 'SprintVault Service',
    email: 'service@sprintvault.local',
  };

  /**
   * Initializes or verifies a Git repository at repoPath.
   */
  static ensureRepo(
    repoPath: string,
    defaultBranch: string = 'main',
    initialFiles?: { path: string; content: string }[]
  ): void {
    if (!fs.existsSync(repoPath)) {
      fs.mkdirSync(repoPath, { recursive: true });
    }

    const gitDir = path.join(repoPath, '.git');
    if (!fs.existsSync(gitDir)) {
      execSync(`git init -b "${defaultBranch}"`, { cwd: repoPath });
      execSync(`git config user.name "${this.defaultServiceUser.name}"`, { cwd: repoPath });
      execSync(`git config user.email "${this.defaultServiceUser.email}"`, { cwd: repoPath });

      // Add starter files if provided
      const filesToCreate = initialFiles && initialFiles.length > 0 ? initialFiles : [
        { path: 'README.md', content: `# Project Repository\n\nManaged by SprintVault.\n` }
      ];

      for (const item of filesToCreate) {
        const fullPath = path.join(repoPath, item.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, item.content, 'utf8');
      }

      execSync('git add -A', { cwd: repoPath });
      execSync('git commit -m "chore: initial repository structure"', { cwd: repoPath });
    }
  }

  /**
   * readTree(branch): reads files from the Git repository tree.
   */
  static readTree(branch: string, repoPath: string): GitFileItem[] {
    this.ensureRepo(repoPath, branch);

    try {
      const output = execSync(`git ls-tree -r --name-only "${branch}"`, {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();

      if (!output) {
        return [];
      }

      const filePaths = output.split('\n').filter(Boolean);
      const items: GitFileItem[] = [];

      for (const relPath of filePaths) {
        try {
          const content = execSync(`git show "${branch}:${relPath}"`, {
            cwd: repoPath,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024,
          });
          items.push({
            path: relPath,
            content,
            size: Buffer.byteLength(content, 'utf8'),
          });
        } catch {
          const fullPath = path.join(repoPath, relPath);
          if (fs.existsSync(fullPath)) {
            const content = fs.readFileSync(fullPath, 'utf8');
            items.push({
              path: relPath,
              content,
              size: Buffer.byteLength(content, 'utf8'),
            });
          }
        }
      }

      return items;
    } catch (err) {
      console.error('GitHost.readTree error:', err);
      return [];
    }
  }

  /**
   * push(commit): Commits changes using the service account and returns the commit SHA.
   */
  static push(commitData: {
    repoPath: string;
    branch: string;
    files: { path: string; content: string }[];
    msg: string;
    author: { name: string; email: string };
  }): string {
    const { repoPath, branch, files, msg, author } = commitData;
    this.ensureRepo(repoPath, branch);

    try {
      execSync(`git checkout "${branch}"`, { cwd: repoPath, stdio: 'ignore' });
    } catch {
      execSync(`git checkout -B "${branch}"`, { cwd: repoPath, stdio: 'ignore' });
    }

    for (const item of files) {
      const fullPath = path.join(repoPath, item.path);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, item.content, 'utf8');
    }

    execSync('git add -A', { cwd: repoPath });

    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf8' }).trim();
    if (!status) {
      const headSha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
      return headSha;
    }

    const authorArg = `--author="${author.name.replace(/"/g, '\\"')} <${author.email.replace(/"/g, '\\')}>"`;
    const escapedMsg = msg.replace(/"/g, '\\"');

    execSync(`git commit -m "${escapedMsg}" ${authorArg}`, {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: this.defaultServiceUser.name,
        GIT_COMMITTER_EMAIL: this.defaultServiceUser.email,
      },
    });

    const sha = execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
    return sha;
  }

  /**
   * Returns recent commit history.
   */
  static getLog(repoPath: string, limit: number = 20): Array<{
    sha: string;
    message: string;
    authorName: string;
    authorEmail: string;
    date: string;
  }> {
    this.ensureRepo(repoPath);
    try {
      const format = '%H|%s|%an|%ae|%ad';
      const output = execSync(`git log -n ${limit} --format="${format}" --date=iso`, {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();

      if (!output) return [];

      return output.split('\n').filter(Boolean).map((line) => {
        const [sha, message, authorName, authorEmail, date] = line.split('|');
        return { sha, message, authorName, authorEmail, date };
      });
    } catch {
      return [];
    }
  }

  /**
   * Returns latest commit (HEAD) in the repository.
   */
  static getLatestCommit(repoPath: string): { sha: string; message: string; author: string; date: string } | null {
    this.ensureRepo(repoPath);
    try {
      const output = execSync('git log -1 --format="%H|%s|%an|%ad" --date=iso', {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();
      if (!output) return null;
      const [sha, message, author, date] = output.split('|');
      return { sha, message, author, date };
    } catch {
      return null;
    }
  }

  /**
   * Commits pending local changes made by developer on disk.
   */
  static commitPendingChanges(
    repoPath: string,
    author: { name: string; email: string },
    msg: string
  ): string {
    this.ensureRepo(repoPath);
    execSync('git add -A', { cwd: repoPath });
    const status = execSync('git status --porcelain', { cwd: repoPath, encoding: 'utf8' }).trim();
    if (!status) {
      return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
    }

    const authorArg = `--author="${author.name.replace(/"/g, '\\"')} <${author.email.replace(/"/g, '\\')}>"`;
    const escapedMsg = msg.replace(/"/g, '\\"');

    execSync(`git commit -m "${escapedMsg}" ${authorArg}`, {
      cwd: repoPath,
      env: {
        ...process.env,
        GIT_COMMITTER_NAME: this.defaultServiceUser.name,
        GIT_COMMITTER_EMAIL: this.defaultServiceUser.email,
      },
    });

    return execSync('git rev-parse HEAD', { cwd: repoPath, encoding: 'utf8' }).trim();
  }

  /**
   * Returns complete Git commit graph (DAG with parents, refs, branches, and raw graph text).
   */
  static getCommitGraph(repoPath: string, limit: number = 50): {
    nodes: GitGraphNode[];
    rawGraphText: string;
  } {
    this.ensureRepo(repoPath);

    try {
      const rawGraphText = execSync(
        `git log -n ${limit} --graph --all --date=format:"%Y-%m-%d %H:%M" --pretty=format:"%h %d %s (%an, %cd)"`,
        { cwd: repoPath, encoding: 'utf8' }
      ).trim();

      const format = '%H|%P|%an|%ae|%ad|%s|%D';
      const output = execSync(`git log -n ${limit} --all --format="${format}" --date=iso`, {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();

      if (!output) {
        return { nodes: [], rawGraphText: '' };
      }

      const lines = output.split('\n').filter(Boolean);
      const nodes: GitGraphNode[] = [];

      for (const line of lines) {
        const parts = line.split('|');
        const sha = parts[0] || '';
        const rawParents = parts[1] || '';
        const authorName = parts[2] || '';
        const authorEmail = parts[3] || '';
        const date = parts[4] || '';
        const message = parts[5] || '';
        const refStr = parts[6] || '';

        const parents = rawParents.split(' ').filter(Boolean);

        const branches: string[] = [];
        const tags: string[] = [];
        let isHead = false;

        if (refStr) {
          const refItems = refStr.split(',').map((r) => r.trim());
          for (const item of refItems) {
            if (item.includes('HEAD')) {
              isHead = true;
              const match = item.match(/HEAD\s*->\s*([^\s,]+)/);
              if (match) branches.push(match[1]);
            } else if (item.startsWith('tag: ')) {
              tags.push(item.replace('tag: ', ''));
            } else if (!item.includes('/')) {
              branches.push(item);
            }
          }
        }

        nodes.push({
          sha,
          shortSha: sha.substring(0, 7),
          parents,
          authorName,
          authorEmail,
          date,
          message,
          branches,
          tags,
          isHead,
        });
      }

      return { nodes, rawGraphText };
    } catch (err) {
      console.error('GitHost.getCommitGraph error:', err);
      return { nodes: [], rawGraphText: '' };
    }
  }

  /**
   * Reads .git directory metadata directly from the filesystem.
   */
  static getGitMetadata(repoPath: string): GitMetadata {
    this.ensureRepo(repoPath);
    const gitDir = path.join(repoPath, '.git');
    const gitDirExists = fs.existsSync(gitDir);

    let headRef = '';
    let currentBranch = 'main';
    let branches: string[] = [];
    const tags: string[] = [];
    let config = '';
    let hasUncommittedChanges = false;
    let uncommittedFiles: string[] = [];

    if (gitDirExists) {
      const headFile = path.join(gitDir, 'HEAD');
      if (fs.existsSync(headFile)) {
        headRef = fs.readFileSync(headFile, 'utf8').trim();
        if (headRef.startsWith('ref: refs/heads/')) {
          currentBranch = headRef.replace('ref: refs/heads/', '');
        }
      }

      const configFile = path.join(gitDir, 'config');
      if (fs.existsSync(configFile)) {
        config = fs.readFileSync(configFile, 'utf8');
      }

      const headsDir = path.join(gitDir, 'refs', 'heads');
      if (fs.existsSync(headsDir)) {
        try {
          branches = fs.readdirSync(headsDir);
        } catch {
          branches = [currentBranch];
        }
      }

      try {
        const statusOutput = execSync('git status --porcelain', {
          cwd: repoPath,
          encoding: 'utf8',
        }).trim();

        if (statusOutput) {
          hasUncommittedChanges = true;
          uncommittedFiles = statusOutput.split('\n').filter(Boolean);
        }
      } catch {
        // Ignored
      }
    }

    let totalCommits = 0;
    try {
      const countStr = execSync('git rev-list --count --all', {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();
      totalCommits = parseInt(countStr, 10) || 0;
    } catch {
      totalCommits = 0;
    }

    const scrumFileExists = fs.existsSync(path.join(repoPath, '.scrum.json'));

    return {
      gitDirExists,
      headRef,
      currentBranch,
      branches,
      tags,
      totalCommits,
      config,
      hasUncommittedChanges,
      uncommittedFiles,
      scrumFileExists,
    };
  }

  /**
   * Returns commit details and diff.
   */
  static getCommitDetails(repoPath: string, sha: string): { sha: string; diff: string; message: string } | null {
    try {
      const message = execSync(`git log -1 --format="%B" "${sha}"`, {
        cwd: repoPath,
        encoding: 'utf8',
      }).trim();
      const diff = execSync(`git show "${sha}" --stat --patch`, {
        cwd: repoPath,
        encoding: 'utf8',
      });
      return { sha, message, diff };
    } catch {
      return null;
    }
  }
}
