import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subWeeks,
} from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Flame,
  FolderOpen,
  ListChecks,
  RefreshCw,
  SquareCheckBig,
  TrendingUp,
} from "lucide-react";
import type { Habit, HabitCheckinListItem, HabitStats, Task, TaskProject, TaskStats } from "@/types";
import { cn } from "@/lib/utils";

type StatsPrimaryTab = "overview" | "tasks" | "habits";
type TaskStatsTab = "overview" | "details" | "records" | "trends" | "heatmap";
type HabitStatsTab = "overview" | "log" | "week" | "month" | "year";

type Props = {
  tasks: Task[];
  projects: TaskProject[];
  taskStats: TaskStats | null;
  habits: Habit[];
  habitStats: HabitStats | null;
  checkins: HabitCheckinListItem[];
  loading: boolean;
  onRefresh: () => void;
};

type TaskRecord = {
  id: string;
  kind: "created" | "completed";
  at: Date;
  task: Task;
};

function parseDateValue(value?: string | null): Date | null {
  if (!value) return null;
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00` : value.replace(" ", "T");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toDateKey(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function percentage(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function getHeatColor(count: number): string {
  if (count <= 0) return "bg-app-border/60";
  if (count === 1) return "bg-emerald-200 text-emerald-900";
  if (count === 2) return "bg-emerald-300 text-emerald-950";
  if (count === 3) return "bg-emerald-400 text-white";
  return "bg-emerald-600 text-white";
}

function getHabitStatusClass(status?: string | null): string {
  if (status === "success") return "bg-emerald-500/15 text-emerald-700";
  if (status === "partial") return "bg-amber-500/15 text-amber-700";
  if (status === "failure") return "bg-rose-500/15 text-rose-700";
  return "bg-app-hover text-tx-tertiary";
}

function MetricCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-app-border bg-app-surface px-4 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] text-tx-tertiary">{label}</div>
          <div className="mt-1 text-2xl font-semibold text-tx-primary">{value}</div>
          {hint ? <div className="mt-1 text-xs text-tx-tertiary">{hint}</div> : null}
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-primary/10 text-accent-primary">
          {icon}
        </div>
      </div>
    </div>
  );
}

function SectionTabs<T extends string>({
  value,
  items,
  onChange,
}: {
  value: T;
  items: Array<{ value: T; label: string }>;
  onChange: (next: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <button
          key={item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "rounded-full px-3 py-1.5 text-xs transition-colors",
            value === item.value
              ? "bg-accent-primary text-white"
              : "bg-app-hover text-tx-secondary hover:bg-app-active",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-app-border bg-app-surface text-sm text-tx-tertiary">
      {text}
    </div>
  );
}

export function StatsCenter({ tasks, projects, taskStats, habits, habitStats, checkins, loading, onRefresh }: Props) {
  const { t, i18n } = useTranslation();
  const dateLocale = i18n.language === "zh-CN" ? zhCN : enUS;
  const [primaryTab, setPrimaryTab] = useState<StatsPrimaryTab>("overview");
  const [taskTab, setTaskTab] = useState<TaskStatsTab>("overview");
  const [habitTab, setHabitTab] = useState<HabitStatsTab>("overview");

  const today = new Date();

  const taskRecords = useMemo<TaskRecord[]>(() => {
    return tasks
      .flatMap((task) => {
        const records: TaskRecord[] = [];
        const createdAt = parseDateValue(task.createdAt);
        const completedAt = parseDateValue(task.completedAt);
        if (createdAt) records.push({ id: `${task.id}-created`, kind: "created", at: createdAt, task });
        if (completedAt) records.push({ id: `${task.id}-completed`, kind: "completed", at: completedAt, task });
        return records;
      })
      .sort((a, b) => b.at.getTime() - a.at.getTime());
  }, [tasks]);

  const taskOverview = useMemo(() => {
    const overdue = tasks.filter((task) => !task.isCompleted && !!task.dueDate && parseDateValue(task.dueAt || task.dueDate) && parseDateValue(task.dueAt || `${task.dueDate}T23:59:59`)!.getTime() < Date.now()).length;
    const withProject = tasks.filter((task) => !!task.projectId).length;
    const statusCounts = tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.status] = (acc[task.status] || 0) + 1;
      return acc;
    }, {});
    const priorityCounts = tasks.reduce<Record<number, number>>((acc, task) => {
      acc[task.priority] = (acc[task.priority] || 0) + 1;
      return acc;
    }, {});
    return {
      overdue,
      withProject,
      statusCounts,
      priorityCounts,
      completionRate: percentage(taskStats?.completed || 0, taskStats?.total || 0),
    };
  }, [taskStats, tasks]);

  const trendRows = useMemo(() => {
    const weekStarts = Array.from({ length: 12 }, (_, index) => startOfWeek(subWeeks(today, 11 - index), { weekStartsOn: 1 }));
    return weekStarts.map((weekStart) => {
      const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const created = tasks.filter((task) => {
        const at = parseDateValue(task.createdAt);
        return at && at >= weekStart && at <= weekEnd;
      }).length;
      const completed = tasks.filter((task) => {
        const at = parseDateValue(task.completedAt);
        return at && at >= weekStart && at <= weekEnd;
      }).length;
      return {
        key: format(weekStart, "yyyy-MM-dd"),
        label: format(weekStart, "MM/dd", { locale: dateLocale }),
        created,
        completed,
      };
    });
  }, [dateLocale, tasks, today]);

  const yearHeatmap = useMemo(() => {
    const start = startOfWeek(startOfYear(today), { weekStartsOn: 1 });
    const end = endOfWeek(endOfYear(today), { weekStartsOn: 1 });
    const days = eachDayOfInterval({ start, end });
    const byDate = new Map<string, number>();
    tasks.forEach((task) => {
      const completedAt = parseDateValue(task.completedAt);
      if (!completedAt) return;
      const key = toDateKey(completedAt);
      byDate.set(key, (byDate.get(key) || 0) + 1);
    });
    const weeks: Array<Array<{ date: Date; count: number; inYear: boolean }>> = [];
    days.forEach((date, index) => {
      const weekIndex = Math.floor(index / 7);
      if (!weeks[weekIndex]) weeks[weekIndex] = [];
      weeks[weekIndex].push({
        date,
        count: byDate.get(toDateKey(date)) || 0,
        inYear: date.getFullYear() === today.getFullYear(),
      });
    });
    return weeks;
  }, [tasks, today]);

  const activeHabits = useMemo(() => habits.filter((habit) => !habit.archivedAt), [habits]);
  const archivedHabits = useMemo(() => habits.filter((habit) => !!habit.archivedAt), [habits]);

  const habitLogByDay = useMemo(() => {
    const map = new Map<string, HabitCheckinListItem[]>();
    checkins.forEach((checkin) => {
      const current = map.get(checkin.checkinDate) || [];
      current.push(checkin);
      map.set(checkin.checkinDate, current);
    });
    return map;
  }, [checkins]);

  const habitMonthCalendar = useMemo(() => {
    const start = startOfWeek(startOfMonth(today), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(today), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end }).map((date) => {
      const key = toDateKey(date);
      const rows = habitLogByDay.get(key) || [];
      const success = rows.filter((row) => row.status === "success").length;
      const partial = rows.filter((row) => row.status === "partial").length;
      const failure = rows.filter((row) => row.status === "failure").length;
      return { date, rows, success, partial, failure };
    });
  }, [habitLogByDay, today]);

  const habitWeekDates = useMemo(() => {
    const start = startOfWeek(today, { weekStartsOn: 1 });
    return Array.from({ length: 7 }, (_, index) => addDays(start, index));
  }, [today]);

  const habitYearSummary = useMemo(() => {
    const rows = new Map<string, { label: string; total: number; success: number; partial: number; failure: number }>();
    checkins.forEach((checkin) => {
      const date = parseDateValue(checkin.checkinDate);
      if (!date) return;
      const key = format(date, "yyyy-MM");
      const current = rows.get(key) || {
        label: format(date, "MMM", { locale: dateLocale }),
        total: 0,
        success: 0,
        partial: 0,
        failure: 0,
      };
      current.total += 1;
      if (checkin.status === "success") current.success += 1;
      if (checkin.status === "partial") current.partial += 1;
      if (checkin.status === "failure") current.failure += 1;
      rows.set(key, current);
    });
    const months = [] as Array<{ key: string; label: string; total: number; success: number; partial: number; failure: number }>;
    for (let month = 0; month < 12; month += 1) {
      const date = new Date(today.getFullYear(), month, 1);
      const key = format(date, "yyyy-MM");
      const current = rows.get(key) || {
        label: format(date, "MMM", { locale: dateLocale }),
        total: 0,
        success: 0,
        partial: 0,
        failure: 0,
      };
      months.push({ key, ...current });
    }
    return months;
  }, [checkins, dateLocale, today]);

  const topProjectRows = useMemo(() => {
    const projectNameById = new Map(projects.map((project) => [project.id, project.name]));
    const groups = new Map<string, { key: string; label: string; total: number; completed: number }>();
    tasks.forEach((task) => {
      const key = task.projectId || "__none__";
      const label = task.projectId
        ? projectNameById.get(task.projectId) || t("stats.task.projectAssigned", { defaultValue: "已归类项目" })
        : t("tasks.noProject");
      const current = groups.get(key) || { key, label, total: 0, completed: 0 };
      current.total += 1;
      if (task.isCompleted) current.completed += 1;
      groups.set(key, current);
    });
    return [...groups.values()].sort((a, b) => b.total - a.total);
  }, [projects, t, tasks]);

  const recentHabitLogs = checkins.slice(0, 80);
  const recentTaskRecords = taskRecords.slice(0, 80);

  const renderOverview = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<SquareCheckBig size={18} />}
          label={t("stats.overview.totalTasks")}
          value={taskStats?.total ?? tasks.length}
          hint={t("stats.overview.taskCompletion", { percent: taskOverview.completionRate })}
        />
        <MetricCard
          icon={<Clock3 size={18} />}
          label={t("stats.overview.pendingTasks")}
          value={taskStats?.pending ?? tasks.filter((task) => !task.isCompleted).length}
          hint={t("stats.overview.overdueTasks", { count: taskOverview.overdue })}
        />
        <MetricCard
          icon={<ListChecks size={18} />}
          label={t("stats.overview.activeHabits")}
          value={activeHabits.length}
          hint={t("stats.overview.archivedHabits", { count: archivedHabits.length })}
        />
        <MetricCard
          icon={<Flame size={18} />}
          label={t("stats.overview.currentHabitStreak")}
          value={habitStats?.currentStreak ?? 0}
          hint={t("stats.overview.totalCheckins", { count: habitStats?.totalCheckins ?? 0 })}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tx-primary">{t("stats.overview.recentTaskActivity")}</h3>
              <p className="text-xs text-tx-tertiary">{t("stats.overview.recentTaskActivityDesc")}</p>
            </div>
            <Activity size={16} className="text-tx-tertiary" />
          </div>
          <div className="mt-4 space-y-2">
            {recentTaskRecords.slice(0, 6).map((record) => (
              <div key={record.id} className="flex items-center justify-between gap-3 rounded-lg bg-app-bg px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-tx-primary">{record.task.title}</div>
                  <div className="text-xs text-tx-tertiary">
                    {record.kind === "completed" ? t("stats.task.recordCompleted") : t("stats.task.recordCreated")}
                  </div>
                </div>
                <div className="shrink-0 text-xs text-tx-tertiary">
                  {format(record.at, "MM/dd HH:mm", { locale: dateLocale })}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-tx-primary">{t("stats.overview.recentHabitActivity")}</h3>
              <p className="text-xs text-tx-tertiary">{t("stats.overview.recentHabitActivityDesc")}</p>
            </div>
            <CalendarDays size={16} className="text-tx-tertiary" />
          </div>
          <div className="mt-4 space-y-2">
            {recentHabitLogs.slice(0, 6).map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-app-bg px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-tx-primary">{item.habitTitle}</div>
                  <div className="truncate text-xs text-tx-tertiary">{item.note || t("stats.habit.emptyNote")}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={cn("rounded-full px-2 py-0.5 text-[10px]", getHabitStatusClass(item.status))}>
                    {t(`habits.status.${item.status}`)}
                  </div>
                  <div className="mt-1 text-[11px] text-tx-tertiary">{item.checkinDate}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTaskOverview = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<SquareCheckBig size={18} />} label={t("stats.task.total")} value={taskStats?.total ?? tasks.length} hint={t("stats.task.completed", { count: taskStats?.completed ?? 0 })} />
        <MetricCard icon={<TrendingUp size={18} />} label={t("stats.task.completionRate")} value={`${taskOverview.completionRate}%`} hint={t("stats.task.pending", { count: taskStats?.pending ?? 0 })} />
        <MetricCard icon={<Clock3 size={18} />} label={t("stats.task.overdue")} value={taskOverview.overdue} hint={t("stats.task.today", { count: taskStats?.today ?? 0 })} />
        <MetricCard icon={<FolderOpen size={18} />} label={t("stats.task.projectCoverage")} value={`${percentage(taskOverview.withProject, tasks.length)}%`} hint={t("stats.task.projectCoverageHint", { count: taskOverview.withProject })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tx-primary">{t("stats.task.statusBreakdown")}</h3>
          <div className="mt-4 space-y-3">
            {(["todo", "doing", "blocked", "done"] as const).map((status) => {
              const count = taskOverview.statusCounts[status] || 0;
              return (
                <div key={status}>
                  <div className="mb-1 flex items-center justify-between text-xs text-tx-secondary">
                    <span>{t(`tasks.status${status.charAt(0).toUpperCase()}${status.slice(1)}`)}</span>
                    <span>{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-app-bg">
                    <div className="h-full rounded-full bg-accent-primary" style={{ width: `${percentage(count, tasks.length)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tx-primary">{t("stats.task.projectBreakdown")}</h3>
          <div className="mt-4 space-y-3">
            {topProjectRows.slice(0, 6).map((row) => (
              <div key={row.key} className="rounded-lg bg-app-bg px-3 py-2">
                <div className="flex items-center justify-between text-sm text-tx-primary">
                  <span>{row.label}</span>
                  <span>{row.completed}/{row.total}</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-app-border">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage(row.completed, row.total)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  const renderTaskDetails = () => {
    if (!tasks.length) return <EmptyPanel text={t("stats.task.empty")} />;
    return (
      <div className="overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-app-bg text-xs text-tx-tertiary">
              <tr>
                <th className="px-4 py-3">{t("tasks.taskTitle")}</th>
                <th className="px-4 py-3">{t("tasks.status")}</th>
                <th className="px-4 py-3">{t("tasks.priority")}</th>
                <th className="px-4 py-3">{t("tasks.createdAt")}</th>
                <th className="px-4 py-3">{t("tasks.dueDate")}</th>
                <th className="px-4 py-3">{t("stats.task.completedAt")}</th>
              </tr>
            </thead>
            <tbody>
              {[...tasks]
                .sort((a, b) => (parseDateValue(b.completedAt)?.getTime() || parseDateValue(b.createdAt)?.getTime() || 0) - (parseDateValue(a.completedAt)?.getTime() || parseDateValue(a.createdAt)?.getTime() || 0))
                .slice(0, 120)
                .map((task) => (
                  <tr key={task.id} className="border-t border-app-border/70">
                    <td className="px-4 py-3 text-tx-primary">{task.title}</td>
                    <td className="px-4 py-3 text-tx-secondary">{t(`tasks.status${task.status.charAt(0).toUpperCase()}${task.status.slice(1)}`)}</td>
                    <td className="px-4 py-3 text-tx-secondary">{task.priority === 3 ? t("tasks.high") : task.priority === 1 ? t("tasks.low") : t("tasks.medium")}</td>
                    <td className="px-4 py-3 text-tx-secondary">{parseDateValue(task.createdAt) ? format(parseDateValue(task.createdAt)!, "yyyy-MM-dd HH:mm", { locale: dateLocale }) : "-"}</td>
                    <td className="px-4 py-3 text-tx-secondary">{task.dueAt || task.dueDate || "-"}</td>
                    <td className="px-4 py-3 text-tx-secondary">{parseDateValue(task.completedAt) ? format(parseDateValue(task.completedAt)!, "yyyy-MM-dd HH:mm", { locale: dateLocale }) : "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderTaskRecords = () => {
    if (!recentTaskRecords.length) return <EmptyPanel text={t("stats.task.noRecords")} />;
    return (
      <div className="space-y-2">
        {recentTaskRecords.map((record) => (
          <div key={record.id} className="rounded-xl border border-app-border bg-app-surface px-4 py-3 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-tx-primary">{record.task.title}</div>
                <div className="mt-1 text-xs text-tx-tertiary">{record.kind === "completed" ? t("stats.task.recordCompleted") : t("stats.task.recordCreated")}</div>
              </div>
              <div className="shrink-0 text-xs text-tx-tertiary">{format(record.at, "yyyy-MM-dd HH:mm", { locale: dateLocale })}</div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderTaskTrends = () => {
    const maxValue = Math.max(1, ...trendRows.map((row) => Math.max(row.created, row.completed)));
    return (
      <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-tx-primary">{t("stats.task.trendTitle")}</h3>
            <p className="text-xs text-tx-tertiary">{t("stats.task.trendDesc")}</p>
          </div>
        </div>
        <div className="space-y-3">
          {trendRows.map((row) => (
            <div key={row.key}>
              <div className="mb-1 flex items-center justify-between text-xs text-tx-secondary">
                <span>{row.label}</span>
                <span>{t("stats.task.trendLegend", { created: row.created, completed: row.completed })}</span>
              </div>
              <div className="grid grid-cols-[1fr_1fr] gap-2">
                <div className="h-2 rounded-full bg-app-bg">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${(row.created / maxValue) * 100}%` }} />
                </div>
                <div className="h-2 rounded-full bg-app-bg">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(row.completed / maxValue) * 100}%` }} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderTaskHeatmap = () => (
    <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-tx-primary">{t("stats.task.heatmapTitle")}</h3>
          <p className="text-xs text-tx-tertiary">{t("stats.task.heatmapDesc")}</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="flex gap-1 pb-2">
          {yearHeatmap.map((week, index) => (
            <div key={`week-${index}`} className="grid grid-rows-7 gap-1">
              {week.map((cell) => (
                <div
                  key={cell.date.toISOString()}
                  title={`${toDateKey(cell.date)} · ${cell.count}`}
                  className={cn(
                    "h-3 w-3 rounded-[4px]",
                    cell.inYear ? getHeatColor(cell.count) : "bg-transparent",
                  )}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderHabitOverview = () => (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard icon={<ListChecks size={18} />} label={t("stats.habit.habitCount")} value={habits.length} hint={t("stats.habit.activeArchived", { active: activeHabits.length, archived: archivedHabits.length })} />
        <MetricCard icon={<Flame size={18} />} label={t("stats.habit.currentStreak")} value={habitStats?.currentStreak ?? 0} hint={t("stats.habit.checkinDays", { count: habitStats?.checkinDays ?? 0 })} />
        <MetricCard icon={<CheckCircle2 size={18} />} label={t("stats.habit.successRate")} value={`${percentage((habitStats?.successCount ?? 0) + (habitStats?.partialCount ?? 0), habitStats?.totalCheckins ?? 0)}%`} hint={t("stats.habit.totalCheckins", { count: habitStats?.totalCheckins ?? 0 })} />
        <MetricCard icon={<CalendarDays size={18} />} label={t("stats.habit.todayCheckins")} value={habitLogByDay.get(toDateKey(today))?.length ?? 0} hint={t("stats.habit.todayCheckinsHint", { count: activeHabits.filter((habit) => !!habit.todayStatus).length })} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tx-primary">{t("stats.habit.statusBreakdown")}</h3>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-emerald-500/10 px-3 py-3">
              <div className="text-[11px] text-emerald-700">{t("habits.status.success")}</div>
              <div className="mt-1 text-xl font-semibold text-emerald-700">{habitStats?.successCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-amber-500/10 px-3 py-3">
              <div className="text-[11px] text-amber-700">{t("habits.status.partial")}</div>
              <div className="mt-1 text-xl font-semibold text-amber-700">{habitStats?.partialCount ?? 0}</div>
            </div>
            <div className="rounded-lg bg-rose-500/10 px-3 py-3">
              <div className="text-[11px] text-rose-700">{t("habits.status.failure")}</div>
              <div className="mt-1 text-xl font-semibold text-rose-700">{habitStats?.failureCount ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-tx-primary">{t("stats.habit.archivedVisibility")}</h3>
          <div className="mt-4 space-y-3 text-sm text-tx-secondary">
            <div className="rounded-lg bg-app-bg px-3 py-2">{t("stats.habit.archivedHint1")}</div>
            <div className="rounded-lg bg-app-bg px-3 py-2">{t("stats.habit.archivedHint2")}</div>
            <div className="rounded-lg bg-app-bg px-3 py-2">{t("stats.habit.archivedHint3")}</div>
          </div>
        </div>
      </div>
    </div>
  );

  const renderHabitLog = () => {
    if (!recentHabitLogs.length) return <EmptyPanel text={t("stats.habit.noLogs")} />;
    return (
      <div className="space-y-2">
        {recentHabitLogs.map((item) => (
          <div key={item.id} className="rounded-xl border border-app-border bg-app-surface px-4 py-3 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.habitColor || "#10b981" }} />
                  <div className="truncate text-sm font-medium text-tx-primary">{item.habitTitle}</div>
                </div>
                <div className="mt-1 truncate text-xs text-tx-tertiary">{item.note || t("stats.habit.emptyNote")}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className={cn("rounded-full px-2 py-0.5 text-[10px]", getHabitStatusClass(item.status))}>{t(`habits.status.${item.status}`)}</div>
                <div className="mt-1 text-[11px] text-tx-tertiary">{item.checkinDate}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderHabitWeek = () => {
    if (!activeHabits.length) return <EmptyPanel text={t("stats.habit.noActiveHabits")} />;
    return (
      <div className="overflow-hidden rounded-xl border border-app-border bg-app-surface shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-app-bg text-xs text-tx-tertiary">
              <tr>
                <th className="px-4 py-3">{t("habits.title")}</th>
                {habitWeekDates.map((date) => (
                  <th key={date.toISOString()} className="px-3 py-3 text-center">{format(date, "EE dd", { locale: dateLocale })}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {activeHabits.map((habit) => (
                <tr key={habit.id} className="border-t border-app-border/70">
                  <td className="px-4 py-3 text-tx-primary">{habit.title}</td>
                  {habitWeekDates.map((date) => {
                    const item = (habitLogByDay.get(toDateKey(date)) || []).find((row) => row.habitId === habit.id);
                    return (
                      <td key={`${habit.id}-${date.toISOString()}`} className="px-3 py-3 text-center">
                        <span className={cn("inline-flex min-w-14 items-center justify-center rounded-full px-2 py-1 text-[10px]", getHabitStatusClass(item?.status))}>
                          {item ? t(`habits.status.${item.status}`) : t("stats.habit.noCheckin")}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  const renderHabitMonth = () => (
    <div className="rounded-xl border border-app-border bg-app-surface p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-tx-primary">{t("stats.habit.monthTitle")}</h3>
        <p className="text-xs text-tx-tertiary">{format(today, "yyyy MMMM", { locale: dateLocale })}</p>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-xs text-tx-tertiary">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={`weekday-${index}`}>{format(addDays(startOfWeek(today, { weekStartsOn: 1 }), index), "EE", { locale: dateLocale })}</div>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-7 gap-2">
        {habitMonthCalendar.map((cell) => (
          <div
            key={cell.date.toISOString()}
            title={`${toDateKey(cell.date)} · ${cell.rows.length}`}
            className={cn(
              "min-h-24 rounded-xl border px-2 py-2 text-xs",
              isSameMonth(cell.date, today) ? "border-app-border bg-app-bg" : "border-transparent bg-app-hover/40 text-tx-tertiary",
              isToday(cell.date) && "ring-1 ring-accent-primary/50",
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-medium text-tx-primary">{format(cell.date, "d")}</span>
              <span className="text-[10px] text-tx-tertiary">{cell.rows.length}</span>
            </div>
            <div className="mt-2 space-y-1">
              <div className="h-1.5 rounded-full bg-app-border">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${percentage(cell.success, Math.max(cell.rows.length, 1))}%` }} />
              </div>
              <div className="h-1.5 rounded-full bg-app-border">
                <div className="h-full rounded-full bg-amber-500" style={{ width: `${percentage(cell.partial, Math.max(cell.rows.length, 1))}%` }} />
              </div>
              <div className="h-1.5 rounded-full bg-app-border">
                <div className="h-full rounded-full bg-rose-500" style={{ width: `${percentage(cell.failure, Math.max(cell.rows.length, 1))}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  const renderHabitYear = () => (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {habitYearSummary.map((month) => (
        <div key={month.key} className="rounded-xl border border-app-border bg-app-surface px-4 py-3 shadow-sm">
          <div className="text-sm font-semibold text-tx-primary">{month.label}</div>
          <div className="mt-1 text-2xl font-semibold text-tx-primary">{month.total}</div>
          <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
            <div className="rounded-md bg-emerald-500/10 px-2 py-1 text-emerald-700">{month.success}</div>
            <div className="rounded-md bg-amber-500/10 px-2 py-1 text-amber-700">{month.partial}</div>
            <div className="rounded-md bg-rose-500/10 px-2 py-1 text-rose-700">{month.failure}</div>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 md:px-5 py-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-app-border bg-app-surface px-4 py-3 shadow-sm">
        <div>
          <h2 className="text-lg font-bold text-tx-primary">{t("stats.title")}</h2>
          <p className="text-xs text-tx-tertiary">{t("stats.subtitle")}</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-app-border bg-app-bg px-3 py-2 text-sm text-tx-secondary transition-colors hover:bg-app-hover disabled:opacity-60"
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          {t("stats.refresh")}
        </button>
      </div>

      <div className="space-y-4">
        <SectionTabs
          value={primaryTab}
          onChange={setPrimaryTab}
          items={[
            { value: "overview", label: t("stats.tabs.overview") },
            { value: "tasks", label: t("stats.tabs.tasks") },
            { value: "habits", label: t("stats.tabs.habits") },
          ]}
        />

        {loading ? (
          <EmptyPanel text={t("stats.loading")} />
        ) : primaryTab === "overview" ? (
          renderOverview()
        ) : primaryTab === "tasks" ? (
          <div className="space-y-4">
            <SectionTabs
              value={taskTab}
              onChange={setTaskTab}
              items={[
                { value: "overview", label: t("stats.task.tabs.overview") },
                { value: "details", label: t("stats.task.tabs.details") },
                { value: "records", label: t("stats.task.tabs.records") },
                { value: "trends", label: t("stats.task.tabs.trends") },
                { value: "heatmap", label: t("stats.task.tabs.heatmap") },
              ]}
            />
            {taskTab === "overview" && renderTaskOverview()}
            {taskTab === "details" && renderTaskDetails()}
            {taskTab === "records" && renderTaskRecords()}
            {taskTab === "trends" && renderTaskTrends()}
            {taskTab === "heatmap" && renderTaskHeatmap()}
          </div>
        ) : (
          <div className="space-y-4">
            <SectionTabs
              value={habitTab}
              onChange={setHabitTab}
              items={[
                { value: "overview", label: t("stats.habit.tabs.overview") },
                { value: "log", label: t("stats.habit.tabs.log") },
                { value: "week", label: t("stats.habit.tabs.week") },
                { value: "month", label: t("stats.habit.tabs.month") },
                { value: "year", label: t("stats.habit.tabs.year") },
              ]}
            />
            {habitTab === "overview" && renderHabitOverview()}
            {habitTab === "log" && renderHabitLog()}
            {habitTab === "week" && renderHabitWeek()}
            {habitTab === "month" && renderHabitMonth()}
            {habitTab === "year" && renderHabitYear()}
          </div>
        )}
      </div>
    </div>
  );
}