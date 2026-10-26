import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import { UserRole } from '../types';

export const DB_PATH = process.env.DB_PATH || path.resolve(process.cwd(), 'sprintvault.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for better concurrency and foreign keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      user_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('MANAGER', 'DEVELOPER'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      project_id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      repo_url TEXT NOT NULL,
      default_branch TEXT NOT NULL DEFAULT 'main',
      created_by INTEGER NOT NULL,
      FOREIGN KEY (created_by) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS project_members (
      project_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      PRIMARY KEY (project_id, user_id),
      FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tasks (
      task_id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      scope_paths TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED' CHECK(status IN ('CREATED', 'ASSIGNED', 'IN_PROGRESS', 'COMPLETED')),
      assignee_id INTEGER NULL,
      commit_sha TEXT NULL,
      completed_at TEXT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
      FOREIGN KEY (assignee_id) REFERENCES users(user_id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS file_locks (
      lock_id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL,
      scope_paths TEXT NOT NULL,
      acquired_at TEXT NOT NULL,
      released_at TEXT NULL,
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'RELEASED', 'REVOKED')),
      base_sha TEXT NULL,
      FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE,
      FOREIGN KEY (owner_id) REFERENCES users(user_id)
    );

    CREATE TABLE IF NOT EXISTS activity_log (
      log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('LOCK', 'PULL', 'PUSH', 'FORCE_UNLOCK')),
      ref TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id)
    );

    -- Actions the governance rules stopped (or overrode): the evidence behind the dashboard metrics
    CREATE TABLE IF NOT EXISTS governance_events (
      event_id INTEGER PRIMARY KEY AUTOINCREMENT,
      kind TEXT NOT NULL CHECK(kind IN ('LOCK_CONFLICT', 'SCOPE_VIOLATION', 'FORCE_RELEASE', 'STALE_RELEASE')),
      user_id INTEGER NOT NULL,
      project_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      detail TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id),
      FOREIGN KEY (project_id) REFERENCES projects(project_id) ON DELETE CASCADE,
      FOREIGN KEY (task_id) REFERENCES tasks(task_id) ON DELETE CASCADE
    );

    -- Logged-out login tokens (jti), kept until they would have expired anyway
    CREATE TABLE IF NOT EXISTS revoked_tokens (
      jti TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS developer_stats (
      user_id INTEGER PRIMARY KEY,
      push_count INTEGER NOT NULL DEFAULT 0,
      pull_count INTEGER NOT NULL DEFAULT 0,
      tasks_completed INTEGER NOT NULL DEFAULT 0,
      last_activity_at TEXT NULL,
      FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
    );
  `);

  // Databases created before base_sha existed: add the column (older locks keep NULL)
  const lockColumns = db.prepare('PRAGMA table_info(file_locks)').all() as unknown as Array<{ name: string }>;
  if (!lockColumns.some((c) => c.name === 'base_sha')) {
    db.exec('ALTER TABLE file_locks ADD COLUMN base_sha TEXT NULL');
  }

  seedUsers();
}

export function seedUsers() {
  const count = (db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number }).count;
  if (count > 0) {
    return;
  }

  console.log('Seeding initial 5 users (1 Team Lead Manager, 4 Developers)...');
  const passwordHash = bcrypt.hashSync('password123', 10);

  const insertUser = db.prepare(`
    INSERT INTO users (name, email, password_hash, role)
    VALUES (?, ?, ?, ?)
  `);

  // 1 Team Lead (MANAGER)
  insertUser.run('Sarah Connor (Team Lead)', 'lead@sprintvault.com', passwordHash, UserRole.MANAGER);

  // 4 Developers (DEVELOPER)
  const developers = [
    { name: 'Alex Rivera', email: 'alex@sprintvault.com' },
    { name: 'Priya Patel', email: 'priya@sprintvault.com' },
    { name: 'Marcus Chen', email: 'marcus@sprintvault.com' },
    { name: 'Elena Rostova', email: 'elena@sprintvault.com' },
  ];

  const insertStats = db.prepare(`
    INSERT INTO developer_stats (user_id, push_count, pull_count, tasks_completed, last_activity_at)
    VALUES (?, 0, 0, 0, NULL)
  `);

  for (const dev of developers) {
    const res = insertUser.run(dev.name, dev.email, passwordHash, UserRole.DEVELOPER);
    const userId = Number(res.lastInsertRowid);
    insertStats.run(userId);
  }

  console.log('Seeding complete. 5 users registered.');
}
