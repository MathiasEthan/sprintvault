import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireDeveloper } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';
import { requireId, ValidationError } from '../validation';
import { sendError } from './errors';

const router = Router();

function parseScope(scope: unknown): string[] {
  if (scope === undefined || scope === null || scope === '') return [];
  const list = Array.isArray(scope) ? scope : [scope];
  if (!list.every((s) => typeof s === 'string')) {
    throw new ValidationError('scope must be a string or list of strings');
  }
  return (list as string[]).map((s) => s.trim()).filter(Boolean);
}

/**
 * GET /api/git/browse/:projectId - Browse repository files (Read-only, no stats change)
 */
router.get('/browse/:projectId', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = requireId(req.params.projectId, 'projectId');
    const branch = typeof req.query.branch === 'string' && req.query.branch ? req.query.branch : undefined;
    const files = WorkflowService.browseFiles(projectId, branch, parseScope(req.query.scope), req.user!.userId);
    return res.json({ files });
  } catch (err) {
    return sendError(res, err);
  }
});

/**
 * POST /api/git/pull - Pull Code / download snapshot (Increments pullCount in DeveloperStats)
 * Messages 8-12 in LOGIC.md
 */
router.post('/pull', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  try {
    const projectId = requireId(req.body?.projectId, 'projectId');
    const result = WorkflowService.pullCode(projectId, parseScope(req.body?.scope), req.user!.userId);
    return res.json({
      message: 'sendSnapshot',
      snapshot: result.snapshot,
    });
  } catch (err) {
    return sendError(res, err);
  }
});

export default router;
