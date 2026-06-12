import type { Task } from "@/types";

export type RepeatRule = "none" | "daily" | "weekly" | "monthly" | "yearly";

export const VALID_REPEAT_RULES: RepeatRule[] = ["none", "daily", "weekly", "monthly", "yearly"];

/** Check if a task has an active repeat rule */
export function isRepeatingTask(task: Task): boolean {
  return !!task.repeatRule && task.repeatRule !== "none" && (task.repeatInterval ?? 0) > 0;
}

/**
 * Calculate the next repeat date for a task.
 * Returns null if the task cannot generate a next occurrence.
 */
export function getNextRepeatDate(task: Task): string | null {
  if (!isRepeatingTask(task)) return null;

  const baseDateStr = task.dueAt ? task.dueAt.split("T")[0] : task.dueDate;
  if (!baseDateStr) return null;

  const interval = task.repeatInterval ?? 1;
  const parts = baseDateStr.split("-").map(Number);
  const base = new Date(parts[0], parts[1] - 1, parts[2]);

  let next: Date;

  switch (task.repeatRule) {
    case "daily":
      next = new Date(base);
      next.setDate(next.getDate() + interval);
      break;
    case "weekly":
      next = new Date(base);
      next.setDate(next.getDate() + 7 * interval);
      break;
    case "monthly":
      next = new Date(base);
      next.setMonth(next.getMonth() + interval);
      // Handle month-end overflow: e.g. Jan 31 + 1 month -> Feb 28
      if (next.getDate() !== base.getDate()) {
        next.setDate(0); // last day of previous month
      }
      break;
    case "yearly":
      next = new Date(base);
      next.setFullYear(next.getFullYear() + interval);
      // Handle Feb 29 -> Feb 28 in non-leap year
      if (next.getDate() !== base.getDate()) {
        next.setDate(0);
      }
      break;
    default:
      return null;
  }

  // Check repeatEndDate
  if (task.repeatEndDate) {
    const endParts = task.repeatEndDate.split("-").map(Number);
    const endDate = new Date(endParts[0], endParts[1] - 1, endParts[2]);
    if (next > endDate) return null;
  }

  const yyyy = next.getFullYear();
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Build the patch for creating the next repeated task from a completed task.
 * Returns null if no next occurrence should be generated.
 */
export function buildNextRepeatedTaskPatch(task: Task): Partial<Task> | null {
  const nextDate = getNextRepeatDate(task);
  if (!nextDate) return null;

  const patch: Partial<Task> = {
    title: task.title,
    priority: task.priority,
    isCompleted: 0,
    status: "todo" as const,
    projectId: task.projectId ?? null,
    parentId: task.parentId ?? null,
    repeatRule: task.repeatRule,
    repeatInterval: task.repeatInterval,
    repeatEndDate: task.repeatEndDate ?? null,
    repeatGroupId: task.repeatGroupId ?? task.id,
    repeatGeneratedFromId: task.id,
  };

  if (task.dueAt) {
    const timePart = task.dueAt.split("T")[1] || "00:00:00";
    patch.dueAt = `${nextDate}T${timePart}`;
    patch.dueDate = nextDate;
  } else {
    patch.dueDate = nextDate;
  }

  return patch;
}
