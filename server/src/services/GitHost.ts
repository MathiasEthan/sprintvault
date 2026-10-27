import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GitFileItem, GitGraphNode, GitMetadata } from '../types';

// Field / record separators for machine-readable git output (never appear in commit text)
const FS = '\x1f';
const RS = '\x1e';

export class GitHost {
  public static serviceUser = {
    name: 'SprintVault Service',
    email: 'service@sprintvault.local',
  };

  /**
   * Runs git without a shell (arguments are never interpreted by cmd.exe / sh).
   */
  static run(cwd: string, args: string[], input?: string): string {
    try {
      return execFileSync('git', args, {
        cwd,
        input,
        encoding: 'utf8',
        maxBuffer: 64 * 1024 * 1024,
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0',
          GIT_COMMITTER_NAME: this.serviceUser.name,
          GIT_COMMITTER_EMAIL: this.serviceUser.email,
        },
      });
    } catch (err: any) {
      const stderr = err.stderr ? String(err.stderr).trim() : '';
      throw new Error(stderr || err.message);
    }
  }

  /** Runs git and reports only success/failure (for --quiet / --is-ancestor style checks). */
  static check(cwd: string, args: string[]): boolean {
    try {
      this.run(cwd, args);
      return true;
    } catch {
      return false;
    }
  }

  static isRepo(repoPath: string): boolean {
    return fs.existsSync(path.join(repoPath, '.git'));
  }

  static isBareRepo(repoPath: string): boolean {
    return (
      fs.existsSync(path.join(repoPath, 'HEAD')) &&
      fs.existsSync(path.join(repoPath, 'objects')) &&
      !fs.existsSync(path.join(repoPath, '.git'))
    );
  }

  static isValidBranchName(name: string): boolean {
    if (!name || name.startsWith('-')) return false;
    return this.check(process.cwd(), ['check-ref-format', '--branch', name]);
  }

  static hasCommits(repoPath: string): boolean {
    return this.isRepo(repoPath) && this.check(repoPath, ['rev-parse', '--verify', '--quiet', 'HEAD']);
  }

  /**
   * Initializes a repository at repoPath and makes the first commit from whatever is in the directory
   * (plus optional starter files). Existing files are never overwritten.
   */
  static initRepo(repoPath: string, defaultBranch: string, initialFiles: { path: string; content: string }[] = []): void {
    fs.mkdirSync(repoPath, { recursive: true });
    this.run(repoPath, ['init', '-b', defaultBranch]);
    this.run(repoPath, ['config', 'user.name', this.serviceUser.name]);
    this.run(repoPath, ['config', 'user.email', this.serviceUser.email]);
    this.run(repoPath, ['config', 'core.autocrlf', 'false']);

    for (const item of initialFiles) {
      const fullPath = path.join(repoPath, item.path);
      if (fs.existsSync(fullPath)) continue;
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, item.content, 'utf8');
    }

    this.run(repoPath, ['add', '-A']);
    this.run(repoPath, ['commit', '--allow-empty', '-m', 'chore: initial repository structure']);
  }

  /**
   * Initializes a repository only if none exists yet.
   */
  static ensureRepo(
    repoPath: string,
    defaultBranch: string = 'main',
    initialFiles?: { path: string; content: string }[]
  ): void {
    if (!this.isRepo(repoPath)) {
      this.initRepo(repoPath, defaultBranch, initialFiles);
    }
  }

  static clone(remoteUrl: string, repoPath: string, branch: string): void {
    fs.mkdirSync(path.dirname(repoPath), { recursive: true });
    this.run(path.dirname(repoPath), ['clone', '--branch', branch, '--', remoteUrl, repoPath]);
    this.run(repoPath, ['config', 'user.name', this.serviceUser.name]);
    this.run(repoPath, ['config', 'user.email', this.serviceUser.email]);
    this.run(repoPath, ['config', 'core.autocrlf', 'false']);
  }

  static remoteHasBranch(remoteUrl: string, branch: string): boolean {
    try {
      return this.run(process.cwd(), ['ls-remote', '--heads', '--', remoteUrl, branch]).trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * readTree(branch): reads every file of the branch tree with one batched cat-file call.
   */
  static readTree(branch: string, repoPath: string): GitFileItem[] {
    if (!this.hasCommits(repoPath)) {
      return [];
    }
    if (!this.isValidBranchName(branch) || !this.check(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`])) {
      throw new Error(`Branch '${branch}' not found`);
    }

    const listing = this.run(repoPath, ['ls-tree', '-r', '-z', `refs/heads/${branch}`]);
    const entries = listing
      .split('\0')
      .filter(Boolean)
      .map((line) => {
        const tab = line.indexOf('\t');
        const [, type, sha] = line.slice(0, tab).split(' ');
        return { type, sha, path: line.slice(tab + 1) };
      })
      .filter((e) => e.type === 'blob');

    if (entries.length === 0) return [];

    const raw = execFileSync('git', ['cat-file', '--batch'], {
      cwd: repoPath,
      input: entries.map((e) => e.sha).join('\n') + '\n',
      maxBuffer: 256 * 1024 * 1024,
    });

    const items: GitFileItem[] = [];
    let offset = 0;
    for (const entry of entries) {
      const headerEnd = raw.indexOf(0x0a, offset);
      const header = raw.subarray(offset, headerEnd).toString('utf8');
      const size = parseInt(header.split(' ')[2], 10);
      const content = raw.subarray(headerEnd + 1, headerEnd + 1 + size).toString('utf8');
      offset = headerEnd + 1 + size + 1;
      items.push({ path: entry.path, content, size });
    }
    return items;
  }

  /**
   * push(commit): writes the given files, stages only those files, commits as the developer
   * (committer = service account) and returns the commit SHA. Throws if nothing changed.
   */
  static push(commitData: {
    repoPath: string;
    branch: string;
    files: { path: string; content: string }[];
    msg: string;
    author: { name: string; email: string };
  }): string {
    const { repoPath, branch, files, msg, author } = commitData;
    this.checkoutBranch(repoPath, branch);
    this.assertExactCase(repoPath, files.map((f) => f.path));

    // Remember what was on disk so a failed push leaves the working tree exactly as it was
    const originals = files.map((item) => {
      const fullPath = path.join(repoPath, item.path);
      return { path: item.path, fullPath, content: fs.existsSync(fullPath) ? fs.readFileSync(fullPath) : null };
    });

    const paths = files.map((f) => f.path);
    try {
      for (const item of files) {
        const fullPath = path.join(repoPath, item.path);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, item.content, 'utf8');
      }
      this.run(repoPath, ['add', '--', ...paths]);
      if (this.check(repoPath, ['diff', '--cached', '--quiet', '--', ...paths])) {
        throw new Error('No changes to commit: pushed files are identical to the repository');
      }
      return this.commit(repoPath, msg, author, paths);
    } catch (err) {
      this.check(repoPath, ['reset', '-q', '--', ...paths]);
      for (const o of originals) {
        if (o.content === null) fs.rmSync(o.fullPath, { force: true });
        else fs.writeFileSync(o.fullPath, o.content);
      }
      throw err;
    }
  }

  /**
   * Refuses paths that name a tracked file or folder with different letter case ('SRC/Auth/x.ts' vs 'src/auth/x.ts'):
   * on a case-insensitive filesystem they would silently overwrite the tracked file.
   */
  static assertExactCase(repoPath: string, paths: string[]): void {
    if (!this.hasCommits(repoPath)) return;
    const known = new Map<string, string>();
    for (const file of this.run(repoPath, ['ls-files', '-z']).split('\0').filter(Boolean)) {
      const segments = file.split('/');
      for (let i = 1; i <= segments.length; i++) {
        const prefix = segments.slice(0, i).join('/');
        known.set(prefix.toLowerCase(), prefix);
      }
    }
    for (const p of paths) {
      const segments = p.split('/');
      for (let i = 1; i <= segments.length; i++) {
        const prefix = segments.slice(0, i).join('/');
        const existing = known.get(prefix.toLowerCase());
        if (existing !== undefined && existing !== prefix) {
          throw new Error(`'${p}' differs only in letter case from '${existing}' in the repository; use the exact name`);
        }
      }
    }
  }

  /**
   * Commits pending working-tree changes limited to the given pathspecs (never .scrum.json).
   */
  static commitPaths(
    repoPath: string,
    pathspecs: string[],
    author: { name: string; email: string },
    msg: string
  ): string {
    // Skip scope paths that neither exist on disk nor are tracked (git rejects unmatched pathspecs)
    const present = pathspecs.filter(
      (p) => p === '.' || fs.existsSync(path.join(repoPath, p)) || this.run(repoPath, ['ls-files', '--', p]).trim() !== ''
    );
    if (present.length === 0) {
      throw new Error('No pending changes inside the task scope');
    }
    const specs = [...present, ':(exclude).scrum.json'];
    this.run(repoPath, ['add', '-A', '--', ...specs]);
    if (this.check(repoPath, ['diff', '--cached', '--quiet', '--', ...specs])) {
      throw new Error('No pending changes inside the task scope');
    }
    return this.commit(repoPath, msg, author, specs);
  }

  /**
   * Commits .scrum.json (and nothing else) as the service account. Returns null when unchanged.
   */
  static commitScrumFile(repoPath: string, msg: string): string | null {
    if (!this.hasCommits(repoPath)) return null;
    this.run(repoPath, ['add', '--', '.scrum.json']);
    if (this.check(repoPath, ['diff', '--cached', '--quiet', '--', '.scrum.json'])) {
      return null;
    }
    return this.commit(repoPath, msg, this.serviceUser, ['.scrum.json']);
  }

  private static commit(repoPath: string, msg: string, author: { name: string; email: string }, pathspecs: string[]): string {
    // -F - reads the message from stdin: multi-line safe, never touches a shell
    this.run(repoPath, ['commit', '-F', '-', `--author=${author.name} <${author.email}>`, '--', ...pathspecs], msg);
    return this.run(repoPath, ['rev-parse', 'HEAD']).trim();
  }

  /**
   * Undoes the last commit (used when publishing a push fails) and restores the given files.
   */
  static rollbackLastCommit(repoPath: string, paths: string[]): void {
    this.run(repoPath, ['reset', '--soft', 'HEAD~1']);
    for (const p of paths) {
      if (this.check(repoPath, ['cat-file', '-e', `HEAD:${p}`])) {
        this.run(repoPath, ['restore', '--staged', '--worktree', '--source=HEAD', '--', p]);
      } else {
        this.run(repoPath, ['rm', '--cached', '--quiet', '--', p]);
        fs.rmSync(path.join(repoPath, p), { force: true });
      }
    }
  }

  private static checkoutBranch(repoPath: string, branch: string): void {
    const current = this.run(repoPath, ['symbolic-ref', '--short', 'HEAD']).trim();
    if (current !== branch) {
      this.run(repoPath, ['checkout', branch]);
    }
  }

  // ---------- Remote (origin) ----------

  static getRemoteUrl(repoPath: string): string | null {
    if (!this.isRepo(repoPath)) return null;
    try {
      return this.run(repoPath, ['config', '--get', 'remote.origin.url']).trim() || null;
    } catch {
      return null;
    }
  }

  static setRemote(repoPath: string, url: string): void {
    if (this.getRemoteUrl(repoPath)) {
      this.run(repoPath, ['remote', 'set-url', 'origin', url]);
    } else {
      this.run(repoPath, ['remote', 'add', 'origin', url]);
    }
  }

  /**
   * Brings commits pushed by developers from their own machines into the service repository.
   */
  static syncFromRemote(repoPath: string, branch: string): boolean {
    if (!this.getRemoteUrl(repoPath)) return false;
    this.run(repoPath, ['fetch', '--quiet', 'origin']);
    if (!this.check(repoPath, ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`])) {
      return true;
    }
    this.checkoutBranch(repoPath, branch);
    if (!this.check(repoPath, ['merge', '--ff-only', '--quiet', `origin/${branch}`])) {
      // Local has unpublished service commits (.scrum.json) and remote moved on: replay ours on top
      try {
        this.run(repoPath, ['rebase', '--autostash', `origin/${branch}`]);
      } catch (err) {
        this.check(repoPath, ['rebase', '--abort']);
        throw err;
      }
    }
    return true;
  }

  /**
   * Publishes the branch to origin. Returns false when the project has no remote.
   */
  static publish(repoPath: string, branch: string): boolean {
    if (!this.getRemoteUrl(repoPath)) return false;
    try {
      this.run(repoPath, ['push', '--quiet', '-u', 'origin', branch]);
    } catch {
      this.syncFromRemote(repoPath, branch);
      this.run(repoPath, ['push', '--quiet', '-u', 'origin', branch]);
    }
    return true;
  }

  // ---------- Commit inspection ----------

  static resolveCommit(repoPath: string, ref: string): string | null {
    if (!this.hasCommits(repoPath) || !/^[0-9a-fA-F]{4,40}$/.test(ref)) return null;
    try {
      return this.run(repoPath, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]).trim();
    } catch {
      return null;
    }
  }

  static isAncestor(repoPath: string, sha: string, ref: string): boolean {
    return this.check(repoPath, ['merge-base', '--is-ancestor', sha, ref]);
  }

  static getCommitAuthorEmail(repoPath: string, sha: string): string {
    return this.run(repoPath, ['show', '-s', '--format=%ae', sha]).trim();
  }

  /**
   * Paths a commit adds, changes or deletes (the root commit is compared with the empty tree).
   * For a merge (-c) only paths that match none of its parents: what the merge itself introduced.
   * Changes merged in from another branch belong to that branch's commits.
   */
  static getCommitFiles(repoPath: string, sha: string): string[] {
    return this.run(repoPath, ['diff-tree', '--no-commit-id', '--name-only', '-r', '--root', '-c', sha])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  /** Commits reachable from sha but not from base (newest first), or just sha when there is no base. */
  static getCommitsSince(repoPath: string, base: string | null, sha: string, limit: number = 500): string[] {
    if (!base || !this.resolveCommit(repoPath, base)) return [sha];
    return this.run(repoPath, ['rev-list', `--max-count=${limit}`, `${base}..${sha}`])
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  }

  static getBranchHead(repoPath: string, branch: string): string | null {
    try {
      return this.run(repoPath, ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`]).trim() || null;
    } catch {
      return null;
    }
  }

  static getCommitTime(repoPath: string, sha: string): number {
    return parseInt(this.run(repoPath, ['show', '-s', '--format=%ct', sha]).trim(), 10);
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
    if (!this.hasCommits(repoPath)) return [];
    const output = this.run(repoPath, ['log', '-n', String(limit), `--format=%H${FS}%s${FS}%an${FS}%ae${FS}%ad${RS}`, '--date=iso']);
    return output
      .split(RS)
      .map((r) => r.trim())
      .filter(Boolean)
      .map((record) => {
        const [sha, message, authorName, authorEmail, date] = record.split(FS);
        return { sha, message, authorName, authorEmail, date };
      });
  }

  /**
   * Returns latest commit (HEAD) in the repository.
   */
  static getLatestCommit(repoPath: string): { sha: string; message: string; author: string; date: string } | null {
    const [latest] = this.getLog(repoPath, 1);
    if (!latest) return null;
    return { sha: latest.sha, message: latest.message, author: latest.authorName, date: latest.date };
  }

  /**
   * Returns complete Git commit graph (DAG with parents, refs, branches, and raw graph text).
   */
  static getCommitGraph(repoPath: string, limit: number = 50): {
    nodes: GitGraphNode[];
    rawGraphText: string;
  } {
    if (!this.hasCommits(repoPath)) {
      return { nodes: [], rawGraphText: '' };
    }

    const rawGraphText = this.run(repoPath, [
      'log', '-n', String(limit), '--graph', '--all', '--date=format:%Y-%m-%d %H:%M', '--pretty=format:%h %d %s (%an, %cd)',
    ]).trim();

    const output = this.run(repoPath, [
      'log', '-n', String(limit), '--all', `--format=%H${FS}%P${FS}%an${FS}%ae${FS}%ad${FS}%s${FS}%D${RS}`, '--date=iso',
    ]);

    const nodes: GitGraphNode[] = [];
    for (const record of output.split(RS).map((r) => r.trim()).filter(Boolean)) {
      const [sha = '', rawParents = '', authorName = '', authorEmail = '', date = '', message = '', refStr = ''] = record.split(FS);

      const branches: string[] = [];
      const tags: string[] = [];
      let isHead = false;

      if (refStr) {
        for (const item of refStr.split(',').map((r) => r.trim())) {
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
        parents: rawParents.split(' ').filter(Boolean),
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
  }

  /**
   * Reads .git directory metadata directly from the filesystem (read-only: never creates a repo).
   */
  static getGitMetadata(repoPath: string): GitMetadata {
    const gitDir = path.join(repoPath, '.git');
    const gitDirExists = fs.existsSync(gitDir);

    let headRef = '';
    let currentBranch = 'main';
    let branches: string[] = [];
    const tags: string[] = [];
    let config = '';
    let hasUncommittedChanges = false;
    let uncommittedFiles: string[] = [];
    let totalCommits = 0;

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

      try {
        branches = this.run(repoPath, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']).split('\n').filter(Boolean);
      } catch {
        branches = [currentBranch];
      }

      try {
        uncommittedFiles = this.run(repoPath, ['status', '--porcelain']).split('\n').filter(Boolean);
        hasUncommittedChanges = uncommittedFiles.length > 0;
      } catch {
        // Ignored
      }

      if (this.hasCommits(repoPath)) {
        totalCommits = parseInt(this.run(repoPath, ['rev-list', '--count', '--all']).trim(), 10) || 0;
      }
    }

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
      scrumFileExists: fs.existsSync(path.join(repoPath, '.scrum.json')),
    };
  }

  /**
   * Returns commit details and diff.
   */
  static getCommitDetails(repoPath: string, sha: string): { sha: string; diff: string; message: string } | null {
    const resolved = this.resolveCommit(repoPath, sha);
    if (!resolved) return null;
    const message = this.run(repoPath, ['log', '-1', '--format=%B', resolved]).trim();
    const diff = this.run(repoPath, ['show', '--stat', '--patch', resolved]);
    return { sha: resolved, message, diff };
  }
}
