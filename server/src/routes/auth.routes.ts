import { Router, Request, Response } from 'express';
import { User } from '../models/User';
import { db } from '../db/database';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/**
 * POST /api/auth/login
 */
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
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
  return res.json({ user: req.user });
});

/**
 * GET /api/auth/users - Returns the 5 configured system users
 */
router.get('/users', (req: Request, res: Response) => {
  const users = db.prepare(`
    SELECT user_id, name, email, role
    FROM users
    ORDER BY user_id ASC
  `).all();
  return res.json({ users });
});

/**
 * POST /api/auth/logout
 */
router.post('/logout', authenticate, (req: AuthenticatedRequest, res: Response) => {
  const user = User.findById(req.user!.userId);
  if (user) {
    user.logout();
  }
  return res.json({ success: true });
});

export default router;
