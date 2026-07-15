import { Globe2 } from "lucide-react";

/**
 * 登录工作台中的公共空间入口。
 *
 * 公共知识站使用独立的无登录路由，不能塞进 workspaceId 状态机；这个轻量入口
 * 明确区分“个人 / 团队工作区”和“公开浏览空间”，同时避免污染现有工作区缓存。
 */
export default function PublicSpaceLauncher() {
  return (
    <button
      type="button"
      onClick={() => window.location.assign("/public")}
      className="fixed bottom-[calc(var(--safe-area-bottom,0px)+16px)] right-4 z-30 inline-flex h-10 items-center gap-2 rounded-full border border-app-border bg-app-elevated/95 px-3.5 text-xs font-medium text-tx-secondary shadow-lg backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-accent-primary/40 hover:text-accent-primary hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary/50 md:right-6"
      aria-label="打开公共空间"
      title="浏览公开发布的知识库"
    >
      <Globe2 size={15} />
      <span>公共空间</span>
    </button>
  );
}
