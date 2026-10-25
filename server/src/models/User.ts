import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../db/database';
import { UserRole, UserRow } from '../types';

export const JWT_SECRET = process.env.JWT_SECRET || 'sprintvault-super-secret-key-1234';

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
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
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
    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
    if (!row) return null;

    const matches = bcrypt.compareSync(password, row.password_hash);
    if (!matches) return null;

    const user = User.fromRow(row);
    const token = jwt.sign(
      { userId: user.userId, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    return { user, token };
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
