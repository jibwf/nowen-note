import type { Task } from "../../types";

export function getTaskStartDate(task: Task): string | null {
  return task.startDate || task.dueDate || null;
}

export function getTaskEndDate(task: Task): string | null {
  return task.dueDate || task.startDate || null;
}

export function getTaskDurationDays(task: Task): number {
  const start = getTaskStartDate(task);
  const end = getTaskEndDate(task);
  if (!start || !end) return 1;
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function moveTaskDateRange(task: Task, targetStartDate: string): { startDate: string; dueDate: string | null } | null {
  const currentStart = getTaskStartDate(task);
  const currentEnd = getTaskEndDate(task);
  if (!currentStart || !currentEnd) return null;
  if (currentStart === targetStartDate) return null;
  const startMs = new Date(currentStart + 'T00:00:00').getTime();
  const endMs = new Date(currentEnd + 'T00:00:00').getTime();
  const duration = endMs - startMs;
  const newStartMs = new Date(targetStartDate + 'T00:00:00').getTime();
  const newEndDate = new Date(newStartMs + duration);
  const ny = newEndDate.getFullYear();
  const nm = String(newEndDate.getMonth() + 1).padStart(2, '0');
  const nd = String(newEndDate.getDate()).padStart(2, '0');
  const newEnd = ny + '-' + nm + '-' + nd;
  return { startDate: targetStartDate, dueDate: newEnd };
}

export function isTaskScheduled(task: Task): boolean {
  return !!(task.startDate || task.dueDate);
}

export function buildTimelineDays(startDate: Date, count: number): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    days.push(d);
  }
  return days;
}
