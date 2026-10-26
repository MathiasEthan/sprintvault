import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { db } from '../db/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 */
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return res.status(401).json({ error: 'access denied' });
  }

  const result = User.login(email, password);
  if (!result) {
    return res.status(401).json({ error: 'access denied' });
  }

  return res.json({
    token: result.token,
    user: {
      userId: result.user.userId,
      name: result.user.name,
      email: result.user.email,
      role: result.user.role,
    },
  });
});

/**
 * GET /api/auth/me
 */
router.get('/me', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const { userId, name, email, role } = req.user!;
  return res.json({ user: { userId, name, email, role } });
});

function listUsers() {
  return db.prepare(`
    SELECT user_id, name, email, role
    FROM users
    ORDER BY user_id ASC
  `).all();
}

/**
 * GET /api/auth/users - Returns the configured system users (authenticated)
 */
router.get('/users', authenticate, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ users: listUsers() });
});

/**
 * GET /api/auth/demo-users - Public 1-click login list, only when DEMO_MODE=true
 */
router.get('/demo-users', (req: Request, res: Response) => {
  if (process.env.DEMO_MODE !== 'true') {
    return res.json({ enabled: false, users: [] });
  }
  return res.json({ enabled: true, users: listUsers(), demoPassword: 'password123' });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = User.findById(req.user!.userId);
  if (user) {
    user.logout();
  }
  if (req.user!.jti && req.user!.exp) {
    User.revokeToken(req.user!.jti, req.user!.exp);
  }
  return res.json({ success: true });
});

export default router;
