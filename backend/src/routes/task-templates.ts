import { Hono } from 'hono';
import { getDb } from '../db/schema';
import crypto from 'crypto';
import { getUserWorkspaceRole, canManageResource } from '../middleware/acl';

const taskTemplates = new Hono();

function normalizeTemplateItems(items: any[]): any[] {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 50).map((item, i) => ({
    title: typeof item.title === 'string' ? item.title.trim().slice(0, 200) : '',
    priority: [1, 2, 3].includes(item.priority) ? item.priority : 2,
    relativeDueDays: typeof item.relativeDueDays === 'number' ? item.relativeDueDays : null,
    parentIndex: typeof item.parentIndex === 'number' && item.parentIndex >= 0 ? item.parentIndex : null,
    sortOrder: typeof item.sortOrder === 'number' ? item.sortOrder : i,
  })).filter(item => item.title.length > 0);
}

function resolveScope(c: any, userId: string) {
  const raw = c.req.query('workspaceId');
  if (!raw || raw === 'personal') return { workspaceId: null };
  const role = getUserWorkspaceRole(raw, userId);
  if (!role) return { workspaceId: raw, error: 'No access to workspace' };
  return { workspaceId: raw };
}

taskTemplates.get('/', (c) => {
  const db = getDb();
  const userId = c.req.header('X-User-Id')!;
  const scope = resolveScope(c, userId);
  if (scope.error) return c.json({ error: scope.error }, 403);

  const rows = scope.workspaceId
    ? db.prepare(
        'SELECT * FROM task_templates WHERE workspaceId = ? ORDER BY createdAt DESC'
      ).all(scope.workspaceId)
    : db.prepare(
        'SELECT * FROM task_templates WHERE userId = ? AND workspaceId IS NULL ORDER BY createdAt DESC'
      ).all(userId);

  return c.json(rows.map((r: any) => ({ ...r, items: JSON.parse(r.items || '[]') })));
});

taskTemplates.post('/', async (c) => {
  const db = getDb();
  const userId = c.req.header('X-User-Id')!;
  const scope = resolveScope(c, userId);
  if (scope.error) return c.json({ error: scope.error }, 403);

  const body = await c.req.json();
  if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
    return c.json({ error: 'Name is required', code: 'INVALID_NAME' }, 400);
  }
  const items = normalizeTemplateItems(body.items);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO task_templates (id, userId, workspaceId, name, description, icon, color, items, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, userId, scope.workspaceId, body.name.trim(), body.description || null, body.icon || null, body.color || null, JSON.stringify(items), now, now);

  const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as any;
  return c.json({ ...row, items: JSON.parse(row.items || '[]') }, 201);
});

taskTemplates.put('/:id', async (c) => {
  const db = getDb();
  const userId = c.req.header('X-User-Id')!;
  const id = c.req.param('id');
  const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (row.workspaceId) {
    const role = getUserWorkspaceRole(row.workspaceId, userId);
    if (!role) return c.json({ error: 'No access' }, 403);
    if (row.userId !== userId && role !== 'admin' && role !== 'owner') {
      return c.json({ error: 'Not allowed' }, 403);
    }
  } else if (row.userId !== userId) {
    return c.json({ error: 'Not allowed' }, 403);
  }

  const body = await c.req.json();
  const updates: string[] = [];
  const params: any[] = [];

  if (body.name !== undefined) {
    if (!body.name || typeof body.name !== 'string' || !body.name.trim()) {
      return c.json({ error: 'Name is required', code: 'INVALID_NAME' }, 400);
    }
    updates.push('name = ?');
    params.push(body.name.trim());
  }
  if (body.description !== undefined) { updates.push('description = ?'); params.push(body.description || null); }
  if (body.icon !== undefined) { updates.push('icon = ?'); params.push(body.icon || null); }
  if (body.color !== undefined) { updates.push('color = ?'); params.push(body.color || null); }
  if (body.items !== undefined) {
    updates.push('items = ?');
    params.push(JSON.stringify(normalizeTemplateItems(body.items)));
  }

  if (updates.length === 0) return c.json({ ...row, items: JSON.parse(row.items || '[]') });

  updates.push('updatedAt = ?');
  params.push(new Date().toISOString());
  params.push(id);

  db.prepare('UPDATE task_templates SET ' + updates.join(', ') + ' WHERE id = ?').run(...params);
  const updated = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as any;
  return c.json({ ...updated, items: JSON.parse(updated.items || '[]') });
});

taskTemplates.delete('/:id', (c) => {
  const db = getDb();
  const userId = c.req.header('X-User-Id')!;
  const id = c.req.param('id');
  const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (row.workspaceId) {
    const role = getUserWorkspaceRole(row.workspaceId, userId);
    if (!role) return c.json({ error: 'No access' }, 403);
    if (row.userId !== userId && role !== 'admin' && role !== 'owner') {
      return c.json({ error: 'Not allowed' }, 403);
    }
  } else if (row.userId !== userId) {
    return c.json({ error: 'Not allowed' }, 403);
  }

  db.prepare('DELETE FROM task_templates WHERE id = ?').run(id);
  return c.json({ success: true });
});

taskTemplates.post('/:id/apply', async (c) => {
  const db = getDb();
  const userId = c.req.header('X-User-Id')!;
  const id = c.req.param('id');
  const row = db.prepare('SELECT * FROM task_templates WHERE id = ?').get(id) as any;
  if (!row) return c.json({ error: 'Not found' }, 404);

  if (row.workspaceId) {
    const role = getUserWorkspaceRole(row.workspaceId, userId);
    if (!role) return c.json({ error: 'No access' }, 403);
  } else if (row.userId !== userId) {
    return c.json({ error: 'Not allowed' }, 403);
  }

  const body = await c.req.json();
  const projectId = body.projectId || null;
  const parentId = body.parentId || null;
  const baseDateStr = body.baseDate || null;

  if (projectId) {
    const proj = db.prepare('SELECT * FROM task_projects WHERE id = ?').get(projectId) as any;
    if (!proj) return c.json({ error: 'Project not found' }, 404);
    if (row.workspaceId) {
      if (proj.workspaceId !== row.workspaceId) return c.json({ error: 'Project belongs to different scope' }, 403);
    } else {
      if (proj.userId !== userId || proj.workspaceId) return c.json({ error: 'Project belongs to different scope' }, 403);
    }
  }

  if (parentId) {
    const parentTask = db.prepare('SELECT * FROM tasks WHERE id = ?').get(parentId) as any;
    if (!parentTask) return c.json({ error: 'Parent task not found' }, 404);
    if (row.workspaceId) {
      if (parentTask.workspaceId !== row.workspaceId) return c.json({ error: 'Parent task belongs to different scope' }, 403);
    } else {
      if (parentTask.userId !== userId || parentTask.workspaceId) return c.json({ error: 'Parent task belongs to different scope' }, 403);
    }
  }

  const items = JSON.parse(row.items || '[]') as Array<{
    title: string; priority: number; relativeDueDays: number; parentIndex: number | null; sortOrder: number;
  }>;

  if (items.length === 0) return c.json({ createdTasks: [] });

  const baseDate = baseDateStr ? new Date(baseDateStr + 'T00:00:00') : null;
  const createdIds: string[] = [];
  const createdTasks: any[] = [];

  const insertStmt = db.prepare(
    'INSERT INTO tasks (id, userId, workspaceId, title, priority, isCompleted, status, sortOrder, projectId, parentId, dueDate, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, \'todo\', ?, ?, ?, ?, datetime(\'now\'), datetime(\'now\'))'
  );

  const createAll = db.transaction(() => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.title || typeof item.title !== 'string') continue;

      const taskId = crypto.randomUUID();
      let dueDate: string | null = null;
      if (baseDate && typeof item.relativeDueDays === 'number') {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + item.relativeDueDays);
        dueDate = d.toISOString().split('T')[0];
      }

      const resolvedParentId =
        item.parentIndex !== null && item.parentIndex >= 0 && item.parentIndex < createdIds.length
          ? createdIds[item.parentIndex]
          : parentId;

      insertStmt.run(taskId, userId, row.workspaceId || null, item.title.trim(), item.priority || 2, item.sortOrder || i, projectId, resolvedParentId, dueDate);

      createdIds.push(taskId);
      createdTasks.push({ id: taskId, title: item.title.trim(), priority: item.priority || 2, dueDate, projectId, parentId: resolvedParentId, status: 'todo', isCompleted: 0 });
    }
  });

  createAll();

  return c.json({ createdTasks, count: createdTasks.length });
});

export default taskTemplates;