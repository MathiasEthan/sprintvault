import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest, requireDeveloper } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';

const router = Router();

/**
 * GET /api/git/browse/:projectId - Browse repository files (Read-only, no stats change)
 */
router.get('/browse/:projectId', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const projectId = parseInt(req.params.projectId, 10);
  const { branch, scope } = req.query;

  try {
    let scopeList: string[] = [];
    if (typeof scope === 'string') {
      scopeList = [scope];
    } else if (Array.isArray(scope)) {
      scopeList = scope as string[];
    }

    const files = WorkflowService.browseFiles(projectId, branch as string, scopeList);
    return res.json({ files });
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

/**
 * POST /api/git/pull - Pull Code / download snapshot (Increments pullCount in DeveloperStats)
 * Messages 8-12 in LOGIC.md
 */
router.post('/pull', authenticate, requireDeveloper, (req: AuthenticatedRequest, res: Response) => {
  const { projectId, scope } = req.body;
  if (!projectId) {
    return res.status(400).json({ error: 'projectId is required' });
  }

  try {
    let scopeList: string[] = [];
    if (Array.isArray(scope)) {
      scopeList = scope;
    } else if (typeof scope === 'string' && scope.trim()) {
      scopeList = [scope.trim()];
    }

    const result = WorkflowService.pullCode(projectId, scopeList, req.user!.userId);
    return res.json({
      message: 'sendSnapshot',
      snapshot: result.snapshot,
    });
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(400).json({ error: err.message });
  }
});

export default router;
