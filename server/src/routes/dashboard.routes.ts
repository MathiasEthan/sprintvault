import { Router, Response } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import { WorkflowService } from '../services/WorkflowService';

const router = Router();

/**
 * GET /api/dashboard - Role-aware dashboard
 */
router.get('/', authenticate, (req: AuthenticatedRequest, res: Response) => {
  try {
    const dashboardData = WorkflowService.getDashboard(req.user!.userId);
    return res.json(dashboardData);
  } catch (err: any) {
    if (err.message === 'access denied') {
      return res.status(403).json({ error: 'access denied' });
    }
    return res.status(500).json({ error: err.message });
  }
});

export default router;
