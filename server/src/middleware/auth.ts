import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, User } from '../models/User';
import { UserRole } from '../types';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: number;
    name: string;
    email: string;
    role: UserRole;
    jti?: string;
    exp?: number;
  };
}

export function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'access denied' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET) as any;
    if (User.isTokenRevoked(payload.jti)) {
      return res.status(401).json({ error: 'access denied' });
    }
    // Identity and role always come from the database, never from token claims alone
    const user = User.findById(payload.userId);
    if (!user) {
      return res.status(401).json({ error: 'access denied' });
    }
    req.user = {
      userId: user.userId,
      name: user.name,
      email: user.email,
      role: user.role,
      jti: payload.jti,
      exp: payload.exp,
    };
    next();
  } catch {
    return res.status(401).json({ error: 'access denied' });
  }
}

export function requireManager(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.MANAGER) {
    return res.status(403).json({ error: 'access denied' });
  }
  next();
}

export function requireDeveloper(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== UserRole.DEVELOPER) {
    return res.status(403).json({ error: 'access denied' });
  }
  next();
}
