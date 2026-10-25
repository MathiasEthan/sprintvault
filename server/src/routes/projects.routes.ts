import { Router, Response, Request } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { authenticate, AuthenticatedRequest, requireManager } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';
import { Project } from '../models/Project';
import { GitHost } from '../services/GitHost';
import { GitService } from '../services/GitService';
import { ScrumFileService } from '../services/ScrumFileService';
import { db } from '../db/database';
import { UserRole } from '../types';

const router = Router();

// Configure multer for zip uploads
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, `upload-${Date.now()}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

/**
 * GET /api/projects - List all projects
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projects = Project.findAll();
  const enhanced = projects.map((p) => {
    const memberIds = p.getMembers();
    const tasks = p.getTasks();
    const repoPath = GitService.getProjectRepoPath(p.projectId);
    const gitMeta = GitHost.getGitMetadata(repoPath);

    return {
      ...p,
      members: memberIds,
      taskCount: tasks.length,
      completedTaskCount: tasks.filter((t) => t.status === 'COMPLETED').length,
      repoPath,
      gitMetadata: gitMeta,
    };
  });
  return res.json({ projects: enhanced });
});

/**
 * GET /api/projects/:id - Project details
 */
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  const project = Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const memberUsers = db.prepare(`
    SELECT u.user_id, u.name, u.email, u.role
    FROM project_members pm
    JOIN users u ON pm.user_id = u.user_id
    WHERE pm.project_id = ?
  `).all(projectId);

  const tasks = project.getTasks();
  const repoPath = GitService.getProjectRepoPath(projectId);
  const gitMeta = GitHost.getGitMetadata(repoPath);

  return res.json({
    project,
    members: memberUsers,
    tasks,
    repoPath,
    gitMetadata: gitMeta,
  });
});

/**
 * POST /api/projects - Create project (Manager only)
 */
router.post('/', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { name, repoUrl, defaultBranch, memberIds, customPath } = req.body;
  if (!name || !repoUrl) {
    return res.status(400).json({ error: 'Name and repoUrl are required' });
  }

  try {
    const project = WorkflowService.createProject(
      name,
      repoUrl,
      defaultBranch || 'main',
      req.user!.userId,
      memberIds || [],
      customPath
    );
    return res.status(201).json({ project });
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(400).json({ error: err.message });
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

  const { name, defaultBranch, memberIds } = req.body;
  const projectName = name ? name.trim() : path.parse(req.file.originalname).name;
  const branch = defaultBranch ? defaultBranch.trim() : 'main';

  try {
    // Generate new project in DB
    const devs = db.prepare('SELECT user_id FROM users WHERE role = ?').all(UserRole.DEVELOPER) as unknown as { user_id: number }[];
    const parsedMemberIds = memberIds
      ? (typeof memberIds === 'string' ? JSON.parse(memberIds) : memberIds)
      : devs.map((d) => d.user_id);

    const slug = projectName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const repoUrl = `git://local/${slug}.git`;

    const project = WorkflowService.createProject(
      projectName,
      repoUrl,
      branch,
      req.user!.userId,
      parsedMemberIds
    );

    const projectRepoPath = GitService.getProjectRepoPath(project.projectId);

    // Extract uploaded zip into projectRepoPath
    const zipPath = req.file.path;
    execSync(`unzip -o -q "${zipPath}" -d "${projectRepoPath}"`, { stdio: 'ignore' });

    // Clean up temp zip
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
    }

    // Ensure .git repository exists
    GitHost.ensureRepo(projectRepoPath, branch);

    // If an existing .scrum.json was in the zip, sync with DB, otherwise create it
    ScrumFileService.syncProjectScrumFile(project.projectId, projectRepoPath);

    return res.status(201).json({
      project,
      message: `Project '${projectName}' successfully extracted and initialized with Git and .scrum.json tracking!`,
    });
  } catch (err: any) {
    console.error('Project upload failed:', err);
    return res.status(500).json({ error: err.message || 'Failed to extract and initialize project' });
  }
});

/**
 * POST /api/projects/import-local - Import an existing local directory (Manager only)
 */
router.post('/import-local', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { dirPath, name, defaultBranch, memberIds } = req.body;
  if (!dirPath || !dirPath.trim()) {
    return res.status(400).json({ error: 'Directory path is required' });
  }

  const resolvedPath = path.resolve(dirPath.trim());
  if (!fs.existsSync(resolvedPath)) {
    return res.status(400).json({ error: `Directory does not exist: ${resolvedPath}` });
  }

  const projectName = name ? name.trim() : path.basename(resolvedPath);
  const branch = defaultBranch ? defaultBranch.trim() : 'main';

  try {
    const devs = db.prepare('SELECT user_id FROM users WHERE role = ?').all(UserRole.DEVELOPER) as unknown as { user_id: number }[];
    const parsedMemberIds = memberIds || devs.map((d) => d.user_id);

    const project = WorkflowService.createProject(
      projectName,
      `file://${resolvedPath}`,
      branch,
      req.user!.userId,
      parsedMemberIds,
      resolvedPath
    );

    GitHost.ensureRepo(resolvedPath, branch);
    ScrumFileService.syncProjectScrumFile(project.projectId, resolvedPath);

    return res.status(201).json({
      project,
      message: `Local directory '${resolvedPath}' successfully linked as project '${projectName}'!`,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to import local project' });
  }
});

/**
 * GET /api/projects/:id/graph - Read .git commit DAG graph
 */
router.get('/:id/graph', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    const graphData = WorkflowService.getProjectCommitGraph(projectId);
    return res.json(graphData);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/projects/:id/metadata - Read .git directory metadata
 */
router.get('/:id/metadata', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  try {
    const metadata = WorkflowService.getProjectGitMetadata(projectId);
    return res.json({ metadata });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * GET /api/projects/:id/scrum-file - View raw .scrum.json tracking file
 */
router.get('/:id/scrum-file', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  const repoPath = GitService.getProjectRepoPath(projectId);
  const scrumData = ScrumFileService.readProjectScrumFile(repoPath);
  if (!scrumData) {
    return res.status(404).json({ error: '.scrum.json not found in project directory' });
  }
  return res.json({ scrumFile: scrumData });
});

/**
 * GET /api/projects/:id/commits - Commit history
 */
router.get('/:id/commits', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  const project = Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const repoPath = GitService.getProjectRepoPath(projectId);
  const commits = GitHost.getLog(repoPath, 50);
  return res.json({ commits });
});

/**
 * GET /api/projects/:id/commits/:sha - Commit details & diff
 */
router.get('/:id/commits/:sha', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.id, 10);
  const { sha } = req.params;
  const project = Project.findById(projectId);
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }

  const repoPath = GitService.getProjectRepoPath(projectId);
  const details = GitHost.getCommitDetails(repoPath, sha);
  if (!details) {
    return res.status(404).json({ error: 'Commit not found' });
  }

  return res.json({ details });
});

export default router;
