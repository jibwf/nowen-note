import { describe, it, expect } from "vitest";
import { isRepeatingTask, getNextRepeatDate, buildNextRepeatedTaskPatch } from "../taskRepeatUtils";
import type { Task } from "@/types";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: overrides.id || crypto.randomUUID(),
    userId: "user1",
    workspaceId: null,
    title: overrides.title || "Test task",
    isCompleted: overrides.isCompleted ?? 0,
    priority: overrides.priority ?? 2,
    dueDate: overrides.dueDate ?? null,
    dueAt: overrides.dueAt ?? null,
    noteId: null,
    parentId: null,
    sortOrder: 0,
    projectId: null,
    status: "todo",
    createdAt: "2026-01-01T00:00:00",
    updatedAt: "2026-01-01T00:00:00",
    repeatRule: overrides.repeatRule ?? "none",
    repeatInterval: overrides.repeatInterval ?? 1,
    repeatEndDate: overrides.repeatEndDate ?? null,
    repeatGroupId: overrides.repeatGroupId ?? null,
    repeatGeneratedFromId: overrides.repeatGeneratedFromId ?? null,
    repeatNextGeneratedId: overrides.repeatNextGeneratedId ?? null,
    ...overrides,
  } as Task;
}

describe("isRepeatingTask", () => {
  it("returns false for none", () => {
    expect(isRepeatingTask(makeTask())).toBe(false);
  });
  it("returns true for daily", () => {
    expect(isRepeatingTask(makeTask({ repeatRule: "daily", dueDate: "2026-06-10" }))).toBe(true);
  });
  it("returns false when interval is 0", () => {
    expect(isRepeatingTask(makeTask({ repeatRule: "daily", repeatInterval: 0, dueDate: "2026-06-10" }))).toBe(false);
  });
});

describe("getNextRepeatDate", () => {
  it("daily: adds interval days", () => {
    const t = makeTask({ repeatRule: "daily", dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2026-06-11");
  });
  it("daily interval=3", () => {
    const t = makeTask({ repeatRule: "daily", repeatInterval: 3, dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2026-06-13");
  });
  it("weekly: adds 7 days", () => {
    const t = makeTask({ repeatRule: "weekly", dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2026-06-17");
  });
  it("monthly: adds 1 month", () => {
    const t = makeTask({ repeatRule: "monthly", dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2026-07-10");
  });
  it("monthly: handles month-end overflow (Jan 31 -> Feb 28)", () => {
    const t = makeTask({ repeatRule: "monthly", dueDate: "2026-01-31" });
    expect(getNextRepeatDate(t)).toBe("2026-02-28");
  });
  it("yearly: adds 1 year", () => {
    const t = makeTask({ repeatRule: "yearly", dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2027-06-10");
  });
  it("yearly: handles Feb 29 -> Feb 28", () => {
    const t = makeTask({ repeatRule: "yearly", dueDate: "2024-02-29" });
    expect(getNextRepeatDate(t)).toBe("2025-02-28");
  });
  it("returns null when past repeatEndDate", () => {
    const t = makeTask({ repeatRule: "daily", dueDate: "2026-06-10", repeatEndDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBeNull();
  });
  it("returns null for no dueDate/dueAt", () => {
    const t = makeTask({ repeatRule: "daily" });
    expect(getNextRepeatDate(t)).toBeNull();
  });
  it("preserves time from dueAt", () => {
    const t = makeTask({ repeatRule: "daily", dueAt: "2026-06-10T15:30:00", dueDate: "2026-06-10" });
    expect(getNextRepeatDate(t)).toBe("2026-06-11");
  });
});

describe("buildNextRepeatedTaskPatch", () => {
  it("builds correct patch for daily task", () => {
    const t = makeTask({ repeatRule: "daily", dueDate: "2026-06-10", title: "Daily task", priority: 1, projectId: "p1" });
    const patch = buildNextRepeatedTaskPatch(t);
    expect(patch).not.toBeNull();
    expect(patch!.dueDate).toBe("2026-06-11");
    expect(patch!.title).toBe("Daily task");
    expect(patch!.priority).toBe(1);
    expect(patch!.projectId).toBe("p1");
    expect(patch!.isCompleted).toBe(0);
    expect(patch!.status).toBe("todo");
    expect(patch!.repeatRule).toBe("daily");
    expect(patch!.repeatGeneratedFromId).toBe(t.id);
  });
  it("preserves dueAt time part", () => {
    const t = makeTask({ repeatRule: "weekly", dueAt: "2026-06-10T14:00:00", dueDate: "2026-06-10" });
    const patch = buildNextRepeatedTaskPatch(t);
    expect(patch!.dueAt).toBe("2026-06-17T14:00:00");
    expect(patch!.dueDate).toBe("2026-06-17");
  });
  it("returns null when no next date", () => {
    const t = makeTask({ repeatRule: "daily", dueDate: "2026-06-10", repeatEndDate: "2026-06-10" });
    expect(buildNextRepeatedTaskPatch(t)).toBeNull();
  });
});
