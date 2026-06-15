import type { Task, TaskDependency } from "../../types";

/**
 * Build a map from task id to its row index in the visible task list.
 */
export function buildTaskRowIndex(tasks: Task[]): Map<string, number> {
  const map = new Map<string, number>();
  tasks.forEach((t, i) => map.set(t.id, i));
  return map;
}

/**
 * Compute SVG polyline points for a finish_to_start dependency line.
 * Returns an array of {x, y} points forming an elbow connector,
 * or null if either task is not in the visible rows.
 */
export function getDependencyLinePoints(
  predecessorBar: { left: number; width: number; row: number },
  successorBar: { left: number; width: number; row: number }
): { x: number; y: number }[] {
  // Start: right edge center of predecessor
  const startX = predecessorBar.left + predecessorBar.width;
  const startY = predecessorBar.row * 32 + 16; // 32px row height, center

  // End: left edge center of successor
  const endX = successorBar.left;
  const endY = successorBar.row * 32 + 16;

  const midX = startX + 8;

  // Elbow connector: right, then vertical, then horizontal to target
  if (Math.abs(startY - endY) < 1) {
    // Same row - just horizontal line
    return [
      { x: startX, y: startY },
      { x: endX, y: endY },
    ];
  }

  return [
    { x: startX, y: startY },
    { x: midX, y: startY },
    { x: midX, y: endY },
    { x: endX, y: endY },
  ];
}

/**
 * Check if adding predecessorId -> successorId would create a cycle.
 * Uses BFS from successorId following predecessor edges.
 */
export function wouldCreateCycle(
  dependencies: TaskDependency[],
  predecessorId: string,
  successorId: string
): boolean {
  if (predecessorId === successorId) return true;

  // Build forward adjacency: from each task, what tasks does it lead to (successors)?
  const successorMap = new Map<string, string[]>();
  for (const dep of dependencies) {
    const list = successorMap.get(dep.predecessorTaskId) || [];
    list.push(dep.successorTaskId);
    successorMap.set(dep.predecessorTaskId, list);
  }

  // BFS from successorId following forward edges.
  // If we can reach predecessorId, then adding predecessorId->successorId creates a cycle.
  const visited = new Set<string>();
  const queue = [successorId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current === predecessorId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const nexts = successorMap.get(current) || [];
    for (const n of nexts) {
      if (!visited.has(n)) queue.push(n);
    }
  }
  return false;
}

/**
 * Get all dependencies where the given task is blocked by incomplete predecessors.
 * Returns the list of predecessor tasks that are not yet completed.
 */
export function getBlockingDependencies(
  taskId: string,
  dependencies: TaskDependency[],
  tasks: Task[]
): Task[] {
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const blockers: Task[] = [];
  for (const dep of dependencies) {
    if (dep.successorTaskId !== taskId) continue;
    const pred = taskMap.get(dep.predecessorTaskId);
    if (pred && pred.isCompleted !== 1) {
      blockers.push(pred);
    }
  }
  return blockers;
}

/**
 * Check if a task is blocked by any incomplete dependency.
 */
export function isTaskBlockedByDependency(
  taskId: string,
  dependencies: TaskDependency[],
  tasks: Task[]
): boolean {
  return getBlockingDependencies(taskId, dependencies, tasks).length > 0;
}

