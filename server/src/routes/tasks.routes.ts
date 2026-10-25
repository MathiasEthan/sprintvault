import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireManager, requireDeveloper } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';
import { Task } from '../models/Task';
import { FileLock } from '../models/FileLock';
import { db } from '../db/database';

const router = Router();

/**
 * GET /api/tasks - List tasks
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { projectId } = req.query;

  let query = `
    SELECT t.*, p.name as project_name, u.name as assignee_name, u.email as assignee_email,
           fl.lock_id, fl.owner_id as lock_owner_id, lu.name as lock_owner_name, fl.acquired_at as lock_acquired_at
    FROM tasks t
    JOIN projects p ON t.project_id = p.project_id
    LEFT JOIN users u ON t.assignee_id = u.user_id
    LEFT JOIN file_locks fl ON t.task_id = fl.task_id AND fl.status = 'ACTIVE'
    LEFT JOIN users lu ON fl.owner_id = lu.user_id
  `;

  const params: any[] = [];
  if (projectId) {
    query += ' WHERE t.project_id = ?';
    params.push(projectId);
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
    };
  });

  return res.json({ tasks: mapped });
});

/**
 * GET /api/tasks/:id - Single task
 */
router.get('/:id', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);
  const task = Task.findById(taskId);
  if (!task) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const activeLock = FileLock.findActiveByTaskId(taskId);
  return res.json({ task, activeLock });
});

/**
 * POST /api/tasks - Create task (Manager only)
 */
router.post('/', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const { projectId, title, scopePaths } = req.body;
  if (!projectId || !title) {
    return res.status(400).json({ error: 'projectId and title are required' });
  }

  try {
    const task = WorkflowService.createTask(
      projectId,
      title,
      Array.isArray(scopePaths) ? scopePaths : (scopePaths ? [scopePaths] : ['/']),
      req.user!.userId
    );
    return res.status(201).json({ task });
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/:id/assign - Assign task (Manager only)
 */
router.post('/:id/assign', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);
  const { devId } = req.body;
  if (!devId) {
    return res.status(400).json({ error: 'devId is required' });
  }

  try {
    const task = WorkflowService.assignTask(taskId, devId, req.user!.userId);
    return res.json({ task });
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/tasks/:id/start - Start work (Developer only)
 */
router.post('/:id/start', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    const result = WorkflowService.startWork(taskId, req.user!.userId);
    return res.json({
      message: 'lockGranted',
      lock: result.lock,
    });
  } catch (err: any) {
    if (err.type === 'rejectStart') {
      return res.status(409).json({
        error: 'rejectStart',
        reason: err.reason,
      });
    }
    return res.status(400).json({ error: err.message || 'Failed to start work' });
  }
});

/**
 * POST /api/tasks/:id/commit-done - Developer completed commit in their local IDE / terminal!
 * Inspects Git commit from repo, links SHA to task, releases lock, completes task.
 */
router.post('/:id/commit-done', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);
  const { commitSha, pendingMessage } = req.body;

  try {
    const result = WorkflowService.commitDone(
      taskId,
      req.user!.userId,
      commitSha,
      pendingMessage
    );
    return res.json({
      message: 'commitDoneReceipt',
      sha: result.sha,
      status: result.status,
      detail: result.message,
    });
  } catch (err: any) {
    if (err.type === 'rejectPush') {
      return res.status(403).json({
        error: 'rejectPush',
        reason: err.reason,
      });
    }
    return res.status(400).json({ error: err.message || 'Commit Done failed' });
  }
});

/**
 * POST /api/tasks/:id/push - Push work (Developer only)
 */
router.post('/:id/push', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);
  const { files, msg } = req.body;

  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'rejectPush', reason: 'No files provided for commit' });
  }

  if (!msg || !msg.trim()) {
    return res.status(400).json({ error: 'rejectPush', reason: 'Commit message is required' });
  }

  try {
    const result = WorkflowService.pushWork(taskId, req.user!.userId, files, msg.trim());
    return res.json({
      message: 'pushReceipt',
      sha: result.sha,
      status: result.status,
    });
  } catch (err: any) {
    if (err.type === 'rejectPush') {
      return res.status(403).json({
        error: 'rejectPush',
        reason: err.reason,
      });
    }
    return res.status(400).json({ error: err.message || 'Push failed' });
  }
});

/**
 * POST /api/tasks/:id/force-release - Force release lock (Manager only)
 */
router.post('/:id/force-release', authenticate, requireManager, (req: AuthenticatedRequest, res: Response) => {
  const taskId = parseInt(req.params.id, 10);

  try {
    WorkflowService.forceRelease(taskId, req.user!.userId);
    return res.json({ success: true, message: 'Lock force-released and task reset to ASSIGNED' });
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
