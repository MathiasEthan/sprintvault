import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';
import { Project } from '../models/Project';
import { GitService } from '../services/GitService';
import { ScrumFileService } from '../services/ScrumFileService';
import { db } from '../db/database';
import { UserRole } from '../types';
import { requireId, optionalIdList, ValidationError } from '../validation';
import { sendError } from './errors';

const router = Router();

// Configure multer for zip uploads
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (req, file, cb) => cb(null, `upload-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`),
  }),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

function developerIds(): number[] {
  const devs = db.prepare('SELECT user_id FROM users WHERE role = ?').all(UserRole.DEVELOPER) as unknown as { user_id: number }[];
  return devs.map((d) => d.user_id);
}

/**
 * Loads the project from :id and checks the requester may view it (developers: members only).
 */
function loadViewableProject(req: AuthenticatedRequest): Project {
  const projectId = requireId(req.params.id, 'Project id');
  const project = Project.findById(projectId);
  if (!project) throw new Error('Project not found');
  WorkflowService.assertCanView(project, req.user!.userId);
  return project;
}

/**
 * Extracts a zip into destDir, rejecting entries that would escape it (zip-slip).
 */
function extractZip(zipPath: string, destDir: string): void {
  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    throw new ValidationError('Uploaded file is not a valid zip archive');
  }
  const root = path.resolve(destDir);
  for (const entry of zip.getEntries()) {
    const target = path.resolve(root, entry.entryName);
    if (target !== root && !target.startsWith(root + path.sep)) {
      throw new ValidationError(`Zip entry '${entry.entryName}' points outside the project directory`);
    }
  }
  zip.extractAllTo(root, true);
}

/**
 * Directories that may be linked with import-local. IMPORT_ROOTS (path-delimiter separated) restricts
 * imports to those trees; system directories and the SprintVault installation are always refused.
 */
function assertImportAllowed(dir: string): void {
  const norm = (p: string) => path.resolve(p).toLowerCase();
  const target = norm(dir);
  const within = (child: string, parent: string) => child === parent || child.startsWith(parent.endsWith(path.sep) ? parent : parent + path.sep);

  if (target === norm(path.parse(target).root)) {
    throw new ValidationError('Cannot import a filesystem root');
  }
  const forbidden = [
    process.env.SystemRoot,
    process.env.ProgramFiles,
    process.env['ProgramFiles(x86)'],
    '/bin', '/etc', '/usr', '/var', '/System',
  ].filter(Boolean).map((p) => norm(p!));
  if (forbidden.some((f) => within(target, f))) {
    throw new ValidationError('Cannot import a system directory');
  }
  const appDir = norm(path.resolve(__dirname, '../../..'));
  if (within(target, appDir) || within(appDir, target)) {
    throw new ValidationError('Cannot import the SprintVault installation directory');
  }
  if (within(target, norm(GitService.getReposBaseDir()))) {
    throw new ValidationError('Cannot import a repository SprintVault already manages');
  }
  const roots = (process.env.IMPORT_ROOTS || '').split(path.delimiter).filter(Boolean).map(norm);
  if (roots.length && !roots.some((r) => within(target, r))) {
    throw new ValidationError(`Imports are restricted to: ${process.env.IMPORT_ROOTS}`);
  }
  const alreadyLinked = db.prepare('SELECT project_id FROM projects WHERE lower(repo_url) = lower(?)').get(`file://${path.resolve(dir)}`) as
    | { project_id: number }
    | undefined;
  if (alreadyLinked) {
    throw new ValidationError(`Directory is already linked as project #${alreadyLinked.project_id}`);
  }
}

/**
 * GET /api/projects - List projects (developers: only projects they are a member of)
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const isManager = req.user!.role === UserRole.MANAGER;
  const projects = Project.findAll().filter((p) => isManager || p.isMember(req.user!.userId));
  const enhanced = projects.map((p) => {
    const tasks = p.getTasks();
    return {
      ...p,
      members: p.getMembers(),
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((t) => t.status === 'COMPLETED').length,
      repoPath: GitService.getProjectRepoPath(p.projectId),
    };
  });
  return res.json({ projects: enhanced });
});

/**
 * GET /api/projects/:id - Project details
 */
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    const memberUsers = db.prepare(`
      SELECT u.user_id, u.name, u.email, u.role
      FROM project_members pm
      JOIN users u ON pm.user_id = u.user_id
      WHERE pm.project_id = ?
    `).all(project.projectId);

    return res.json({
      project,
      members: memberUsers,
      tasks: project.getTasks(),
      repoPath: GitService.getProjectRepoPath(project.projectId),
      gitMetadata: WorkflowService.getProjectGitMetadata(project.projectId),
    });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/projects - Create project (Manager only)
 */
router.post('/', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { name, repoUrl, defaultBranch, memberIds } = req.body ?? {};
  try {
    const project = WorkflowService.createProject(
      name,
      repoUrl,
      defaultBranch || 'main',
      req.user!.userId,
      optionalIdList(memberIds, 'memberIds')
    );
    return res.status(201).json({ project });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/projects/:id/members - Add a developer to a project (Manager only)
 */
router.post('/:id/members', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  try {
    const members = WorkflowService.addMember(
      requireId(req.params.id, 'Project id'),
      requireId(req.body?.devId, 'devId'),
      req.user!.userId
    );
    return res.json({ success: true, members });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/projects/upload - Upload a project ZIP archive (Manager only)
 * Extracts project, detects/initializes .git, and tracks .scrum.json in the project root.
 */
router.post('/upload', authenticate, requireManager, upload.single('projectZip'), (req: AuthenticatedRequest, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No zip file uploaded' });
  }
  const zipPath = req.file.path;

  try {
    const { name, defaultBranch, memberIds } = req.body;
    const projectName = typeof name === 'string' && name.trim() ? name.trim() : path.parse(req.file.originalname).name;
    const branch = typeof defaultBranch === 'string' && defaultBranch.trim() ? defaultBranch.trim() : 'main';
    let parsedMemberIds: number[];
    try {
      parsedMemberIds = memberIds ? optionalIdList(typeof memberIds === 'string' ? JSON.parse(memberIds) : memberIds, 'memberIds') : developerIds();
    } catch (err: any) {
      throw new ValidationError(err instanceof ValidationError ? err.message : 'memberIds must be a JSON array');
    }

    const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const project = WorkflowService.createProject(
      projectName,
      `git://local/${slug}.git`,
      branch,
      req.user!.userId,
      parsedMemberIds,
      undefined,
      (repoPath) => extractZip(zipPath, repoPath)
    );

    return res.status(201).json({
      project,
      message: `Project '${project.name}' successfully extracted and initialized with Git and .scrum.json tracking!`,
    });
  } catch (err) {
    return sendError(res, err);
  } finally {
    fs.rmSync(zipPath, { force: true });
  }
});

/**
 * POST /api/projects/import-local - Link an existing local directory (Manager only)
 * The directory's files are never overwritten; a repository is created only if none exists.
 */
router.post('/import-local', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { dirPath, name, defaultBranch, memberIds } = req.body ?? {};
  try {
    if (typeof dirPath !== 'string' || !dirPath.trim()) {
      throw new ValidationError('Directory path is required');
    }
    const resolvedPath = path.resolve(dirPath.trim());
    if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isDirectory()) {
      throw new ValidationError(`Directory does not exist: ${resolvedPath}`);
    }
    assertImportAllowed(resolvedPath);

    const projectName = typeof name === 'string' && name.trim() ? name.trim() : path.basename(resolvedPath);
    const branch = typeof defaultBranch === 'string' && defaultBranch.trim() ? defaultBranch.trim() : 'main';
    const parsedMemberIds = memberIds ? optionalIdList(memberIds, 'memberIds') : developerIds();

    const project = WorkflowService.createProject(
      projectName,
      `file://${resolvedPath}`,
      branch,
      req.user!.userId,
      parsedMemberIds,
      resolvedPath
    );

    return res.status(201).json({
      project,
      message: `Local directory '${resolvedPath}' successfully linked as project '${projectName}'!`,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/projects/:id/graph - Read .git commit DAG graph
 */
router.get('/:id/graph', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    return res.json(WorkflowService.getProjectCommitGraph(project.projectId));
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/projects/:id/metadata - Read .git directory metadata
 */
router.get('/:id/metadata', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    return res.json({ metadata: WorkflowService.getProjectGitMetadata(project.projectId) });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/projects/:id/scrum-file - View raw .scrum.json tracking file
 */
router.get('/:id/scrum-file', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    const scrumData = ScrumFileService.readProjectScrumFile(GitService.getProjectRepoPath(project.projectId));
    if (!scrumData) {
      return res.status(404).json({ error: '.scrum.json not found in project directory' });
    }
    return res.json({ scrumFile: scrumData });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/projects/:id/commits - Commit history
 */
router.get('/:id/commits', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    return res.json({ commits: GitService.forProject(project).log(50) });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * GET /api/projects/:id/commits/:sha - Commit details & diff
 */
router.get('/:id/commits/:sha', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const project = loadViewableProject(req);
    const details = GitService.forProject(project).commitDetails(String(req.params.sha));
    if (!details) {
      return res.status(404).json({ error: 'Commit not found' });
    }
    return res.json({ details });
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
