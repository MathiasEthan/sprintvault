import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db, DB_PATH } from '../db/database';
import { UserRole, UserRow } from '../types';

/**
 * JWT secret: JWT_SECRET env var, otherwise a random per-install secret persisted next to the database.
 */
function resolveJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(path.dirname(DB_PATH), '.sprintvault-jwt-secret');
  if (fs.existsSync(secretFile)) return fs.readFileSync(secretFile, 'utf8').trim();
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(secretFile, secret, { encoding: 'utf8', mode: 0o600 });
  return secret;
}

export const JWT_SECRET = resolveJwtSecret();

// Revoked token ids (jti) -> expiry (epoch seconds). Entries are dropped once the token would have expired anyway.
const revokedTokens = new Map<string, number>();

export abstract class User {
  public userId: number;
  public name: string;
  public email: string;
  public role: UserRole;

  constructor(userId: number, name: string, email: string, role: UserRole) {
    this.userId = userId;
    this.name = name;
    this.email = email;
    this.role = role;
  }

  static findById(userId: number): User | null {
    const row = db.prepare('SELECT * FROM users WHERE user_id = ?').get(userId) as UserRow | undefined;
    if (!row) return null;
    return User.fromRow(row);
  }

  static findByEmail(email: string): User | null {
    const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email) as UserRow | undefined;
    if (!row) return null;
    return User.fromRow(row);
  }

  static fromRow(row: UserRow): User {
    if (row.role === UserRole.MANAGER) {
      return new Manager(row.user_id, row.name, row.email);
    } else {
      return new Developer(row.user_id, row.name, row.email);
    }
  }

  static login(email: string, password: string): { user: User; token: string } | null {
    const row = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email.trim()) as UserRow | undefined;
    if (!row) return null;

    const matches = bcrypt.compareSync(password, row.password_hash);
    if (!matches) return null;

    const user = User.fromRow(row);
    const token = jwt.sign(
      { userId: user.userId, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '12h', jwtid: crypto.randomUUID() }
    );
    return { user, token };
  }

  static revokeToken(jti: string, expiresAt: number): void {
    const now = Math.floor(Date.now() / 1000);
    for (const [id, exp] of revokedTokens) {
      if (exp < now) revokedTokens.delete(id);
    }
    revokedTokens.set(jti, expiresAt);
  }

  static isTokenRevoked(jti: string | undefined): boolean {
    return !!jti && revokedTokens.has(jti);
  }

  logout(): boolean {
    // Stateless token / session logout acknowledgement
    return true;
  }
}

export class Manager extends User {
  constructor(userId: number, name: string, email: string) {
    super(userId, name, email, UserRole.MANAGER);
  }
}

export class Developer extends User {
  constructor(userId: number, name: string, email: string) {
    super(userId, name, email, UserRole.DEVELOPER);
  }
}
