import { db } from './database';
import { WorkflowService } from '../services/WorkflowService';
import { Project } from '../models/Project';
import { UserRole } from '../types';

export function seedInitialProject() {
  const projectsCount = (db.prepare('SELECT COUNT(*) as count FROM projects').get() as { count: number }).count;
  if (projectsCount > 0) {
    return;
  }

  console.log('Seeding initial project and tasks for Scrum demo...');
  const lead = db.prepare('SELECT user_id FROM users WHERE role = ? LIMIT 1').get(UserRole.MANAGER) as { user_id: number } | undefined;
  if (!lead) return;

  const devs = db.prepare('SELECT user_id FROM users WHERE role = ?').all(UserRole.DEVELOPER) as unknown as { user_id: number }[];
  const devIds = devs.map(d => d.user_id);

  try {
    // 1. Create initial Scrum project
    const project = WorkflowService.createProject(
      'SprintVault Core Engine',
      'git://local/sprintvault-core.git',
      'main',
      lead.user_id,
      devIds
    );


    // 3. Create initial tasks across states
    // Task 1: Assigned to Dev 1 (Alex Rivera)
    const task1 = WorkflowService.createTask(
      project.projectId,
      'Implement JWT token refresh mechanism',
      ['src/auth/'],
      lead.user_id
    );
    if (devIds[0]) {
      WorkflowService.assignTask(task1.taskId, devIds[0], lead.user_id);
    }

    // Task 2: Assigned to Dev 2 (Priya Patel)
    const task2 = WorkflowService.createTask(
      project.projectId,
      'Build REST endpoints for Scrum metrics',
      ['src/api/'],
      lead.user_id
    );
    if (devIds[1]) {
      WorkflowService.assignTask(task2.taskId, devIds[1], lead.user_id);
    }

    // Task 3: Unassigned (Backlog / CREATED)
    WorkflowService.createTask(
      project.projectId,
      'Add calculation utility for team velocity tracking',
      ['src/utils/'],
      lead.user_id
    );

    // Task 4: Unassigned (Backlog / CREATED)
    WorkflowService.createTask(
      project.projectId,
      'Update architecture overview documentation',
      ['docs/'],
      lead.user_id
    );

    console.log('Initial Scrum project and sample tasks seeded successfully.');
  } catch (err) {
    console.error('Failed to seed initial project:', err);
  }
}
