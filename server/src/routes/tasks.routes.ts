import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireManager, requireDeveloper } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';
import { LockManager } from '../services/LockManager';
import { Task } from '../models/Task';
import { FileLock } from '../models/FileLock';
import { Project } from '../models/Project';
import { db } from '../db/database';
import { UserRole } from '../types';
import { requireId, validatePushFiles, requireText, ValidationError } from '../validation';
import { sendError } from './errors';

const router = Router();

/**
 * GET /api/tasks - List tasks (developers only see projects they are a member of)
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.query;
  const isManager = req.user!.role === UserRole.MANAGER;

  let query = `
    SELECT t.*, p.name as project_name, u.name as assignee_name, u.email as assignee_email,
           fl.lock_id, fl.owner_id as lock_owner_id, lu.name as lock_owner_name, fl.acquired_at as lock_acquired_at,
           CASE WHEN fl.lock_id IS NULL THEN NULL ELSE ${LockManager.lastActivitySql('fl', 't')} END as lock_last_activity_at
    FROM tasks t
    JOIN projects p ON t.project_id = p.project_id
    LEFT JOIN users u ON t.assignee_id = u.user_id
    LEFT JOIN file_locks fl ON t.task_id = fl.task_id AND fl.status = 'ACTIVE'
    LEFT JOIN users lu ON fl.owner_id = lu.user_id
    WHERE 1 = 1
  `;

  const params: any[] = [];
  if (projectId !== undefined) {
    let id: number;
    try {
      id = requireId(projectId, 'projectId');
    } catch (err) {
      return sendError(res, err);
    }
    const project = Project.findById(id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    if (!isManager && !project.isMember(req.user!.userId)) {
      return res.status(403).json({ error: 'access denied' });
    }
    query += ' AND t.project_id = ?';
    params.push(id);
  }
  if (!isManager) {
    query += ' AND t.project_id IN (SELECT project_id FROM project_members WHERE user_id = ?)';
    params.push(req.user!.userId);
  }

  query += ' ORDER BY t.task_id DESC';

  const tasks = db.prepare(query).all(...params) as any[];

  const mapped = tasks.map((t) => {
    let scopePaths: string[] = [];
    try {
      scopePaths = JSON.parse(t.scope_paths);
    } catch {
      scopePaths = [];
    }
    return {
      ...t,
      scope_paths: scopePaths,
      has_active_lock: !!t.lock_id,
      lock_is_stale: !!t.lock_id && LockManager.isStale(t.lock_last_activity_at),
    };
  });

  return res.json({ tasks: mapped, staleAfterHours: LockManager.staleAfterHours() });
});

/**
 * GET /api/tasks/:id - Single task
 */
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const taskId = requireId(req.params.id, 'Task id');
    const task = Task.findById(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    WorkflowService.assertCanView(Project.findById(task.projectId)!, req.user!.userId);

    const activeLock = FileLock.findActiveByTaskId(taskId);
    return res.json({ task, activeLock });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks - Create task (Manager only)
 */
router.post('/', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { projectId, title, scopePaths } = req.body ?? {};
  try {
    const task = WorkflowService.createTask(requireId(projectId, 'projectId'), title, scopePaths, req.user!.userId);
    return res.status(201).json({ task });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks/:id/assign - Assign task (Manager only)
 */
router.post('/:id/assign', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  try {
    const taskId = requireId(req.params.id, 'Task id');
    const devId = requireId(req.body?.devId, 'devId');
    const task = WorkflowService.assignTask(taskId, devId, req.user!.userId);
    return res.json({ task });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks/:id/start - Start work (Developer only)
 */
router.post('/:id/start', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  try {
    const taskId = requireId(req.params.id, 'Task id');
    const result = WorkflowService.startWork(taskId, req.user!.userId);
    return res.json({
      message: 'lockGranted',
      lock: result.lock,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks/:id/commit-done - Developer committed (and pushed) from their own machine.
 * Syncs from origin, verifies the commit, links SHA to task, releases lock, completes task.
 */
router.post('/:id/commit-done', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const { commitSha, pendingMessage } = req.body ?? {};

  try {
    const taskId = requireId(req.params.id, 'Task id');
    if (commitSha !== undefined && commitSha !== null && typeof commitSha !== 'string') {
      throw new ValidationError('commitSha must be a string');
    }
    if (pendingMessage !== undefined && pendingMessage !== null && typeof pendingMessage !== 'string') {
      throw new ValidationError('pendingMessage must be a string');
    }
    const result = WorkflowService.commitDone(taskId, req.user!.userId, commitSha ?? undefined, pendingMessage ?? undefined);
    return res.json({
      message: 'commitDoneReceipt',
      sha: result.sha,
      status: result.status,
      detail: result.message,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks/:id/push - Push work (Developer only)
 */
router.post('/:id/push', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const { files, msg } = req.body ?? {};

  let cleanFiles: { path: string; content: string }[];
  let cleanMsg: string;
  let taskId: number;
  try {
    taskId = requireId(req.params.id, 'Task id');
    cleanFiles = validatePushFiles(files);
    cleanMsg = requireText(msg, 'Commit message', 5000);
  } catch (err: any) {
    return res.status(400).json({ error: 'rejectPush', reason: err.message });
  }

  try {
    const result = WorkflowService.pushWork(taskId, req.user!.userId, cleanFiles, cleanMsg);
    return res.json({
      message: 'pushReceipt',
      sha: result.sha,
      status: result.status,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/tasks/:id/force-release - Force release lock (Manager only)
 */
router.post('/:id/force-release', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  try {
    const reason = req.body?.reason;
    if (reason !== undefined && reason !== null && typeof reason !== 'string') {
      throw new ValidationError('reason must be a string');
    }
    const { stale } = WorkflowService.forceRelease(requireId(req.params.id, 'Task id'), req.user!.userId, reason ?? undefined);
    return res.json({
      success: true,
      stale,
      message: stale ? 'Stale lock released and task reset to ASSIGNED' : 'Lock force-released and task reset to ASSIGNED',
    });
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
