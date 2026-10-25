import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import authRoutes from './routes/auth.routes';
import projectsRoutes from './routes/projects.routes';
import tasksRoutes from './routes/tasks.routes';
import gitRoutes from './routes/git.routes';
import dashboardRoutes from './routes/dashboard.routes';
import { initDatabase } from './db/database';
import { seedInitialProject } from './db/seed';
import { authenticate } from './middleware/auth';
import { ChangeFeed } from './services/ChangeFeed';

// Initialize DB schema and seed 5 users + initial project
initDatabase();
seedInitialProject();

export const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectsRoutes);
app.use('/api/tasks', tasksRoutes);
app.use('/api/git', gitRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Change marker: clients poll this and refresh their views when it moves
app.get('/api/changes', authenticate, (req: Request, res: Response) => {
  res.json({ version: ChangeFeed.current() });
});

// System health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', name: 'SprintVault API', timestamp: new Date().toISOString() });
});

// Serve frontend in production or if built
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(clientDist, 'index.html'));
    }
    next();
  });
}

// Global error handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Upload exceeds the 100MB limit' });
  }
  console.error('Unhandled server error:', err);
  if (err.message === 'access denied') {
    return res.status(403).json({ error: 'access denied' });
  }
  res.status(500).json({ error: 'Internal server error' });
});
