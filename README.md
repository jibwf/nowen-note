# nowen-note

> 自托管的私有知识库，对标群晖 Note Station。
>
> A self-hosted private knowledge base. [English README](./README.en.md) · [作者感言](./AUTHOR_STORY.md) · [在线体验](http://note.nowen.cn/)

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](./LICENSE)
[![Node](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED.svg?logo=docker&logoColor=white)](./Dockerfile)

## 功能概览

- **富文本 + Markdown 双引擎**：Tiptap 3 + CodeMirror 6，共享 AI、版本历史、评论等上层能力；支持表格（单元格水平/垂直居中）、图片、附件
- **AI 助手**：支持通义千问 / OpenAI / Gemini / DeepSeek / 豆包 / Ollama，覆盖写作辅助、生成标题、推荐标签、RAG 知识问答；AI 思考过程自动过滤，仅展示最终回答
- **知识管理**：无限层级笔记本、彩色标签、收藏、回收站（笔记锁定，禁止编辑/收藏/锁定操作）、FTS5 全文搜索
- **待办事项**：任务中心支持树形任务、看板视图、日历视图、甘特图 / 时间轴、任务依赖、重复任务、AI 拆任务、提醒系统、任务模板
- **思维导图**：节点拖拽 / 多选 / 复制粘贴、文件夹管理、导图模板、全屏编辑、滚轮缩放、从笔记生成、收藏与搜索
- **说说 / 动态**：轻量社交化笔记，支持图文混排
- **分享与权限**：4 档权限（仅查看 / 可评论 / 可编辑 / 可编辑需登录）+ 访客留言 + 密码 / 有效期 + 分享链接可撤销、版本回溯
- **实时同步**：基于 Yjs + WebSocket 的多端实时协作，删除 / 回收站操作跨端即时同步；IndexedDB 本地离线缓存
- **文件管理**：图片缩略图（webp 三档自适应，密集图床场景流量降至 1/100）、「我的上传」分类（已引用 / 未引用细分）、孤儿清理；附件按 `YYYY/MM` 分目录存储
- **导出**：Markdown / PDF / Word / PNG / JPG 多格式导出；Android 导出图片可直接保存到系统相册
- **备份与恢复**：定时自动备份、邮件备份推送、一键恢复；Docker / NAS 部署开箱即用
- **多端**：Web / Electron（Win/macOS/Linux）/ Android（Capacitor）
- **自动化**：沙箱插件系统、Webhook、审计日志
- **开发者生态**：MCP Server、TypeScript SDK、CLI、[浏览器剪藏扩展](https://chromewebstore.google.com/detail/nowen-note-web-clipper/nglkodhfdbnfielchjpkjhenfaecafpg)、OpenAPI 3.0（见 [`packages/`](./packages)）

## 技术栈

| 层 | 技术 |
| --- | --- |
| **前端** | React 18 + Vite + TypeScript + Tailwind CSS + Tiptap 3 + CodeMirror 6 |
| **后端** | Hono + better-sqlite3 + WebSocket + Yjs + sharp + sqlite-vec |
| **桌面端** | Electron（Win / macOS / Linux） |
| **移动端** | Capacitor Android |
| **存储** | SQLite（FTS5 全文搜索） + 本地附件目录 + S3 / R2 / MinIO 对象存储 |
| **同步** | 实时同步（Yjs + WebSocket） + IndexedDB 本地离线缓存 |
| **导出** | Markdown / PDF / Word / PNG / JPG |

## 截图

### 桌面端

| AI 写作助手 | AI 服务商配置 |
| :---: | :---: |
| ![桌面 AI 写作](./docs/screenshots/desktop-ai-writing.png) | ![AI 设置](./docs/screenshots/settings-ai.png) |

### 移动端（Android / Capacitor）

| 侧边栏 | 笔记列表 | 编辑器 |
| :---: | :---: | :---: |
| ![移动端侧边栏](./docs/screenshots/mobile-sidebar.png) | ![移动端列表](./docs/screenshots/mobile-list.png) | ![移动端编辑器](./docs/screenshots/mobile-editor.png) |

## 在线体验

不想本地部署？可以直接打开作者维护的官方体验站点：

- 地址：<https://note.nowen.cn/>
- 账号：`demo`
- 密码：`demo123456`

> ⚠ 体验账号为只读演示用途，数据可能被定期重置，请勿存放任何敏感或重要内容。生产使用请按下方「快速开始」自托管部署。

## 快速开始

> 默认管理员：`admin` / `admin123`，首次登录后请立即修改密码。

### Docker（推荐）

```bash
git clone https://github.com/cropflre/nowen-note.git
cd nowen-note
docker-compose up -d
```

访问 `http://<你的IP>:3001`。

### 本地开发

需要 Node.js 20+。

```bash
git clone https://github.com/cropflre/nowen-note.git
cd nowen-note
npm run install:all
npm run dev:backend   # 后端 :3001
npm run dev:frontend  # 前端 :5173
```

访问 `http://localhost:5173`。

### 桌面端 / 移动端

```bash
npm run electron:dev      # Electron 开发
npm run electron:build    # 打包 Windows / macOS / Linux
```

Android 可直接从 [Releases](https://github.com/cropflre/nowen-note/releases) 下载 APK，或 `npx cap sync android && npx cap open android` 自行构建。

### 飞牛 fnOS（.fpk 一键安装）

从 [Releases](https://github.com/cropflre/nowen-note/releases) 下载最新 `nowen-note-x.y.z.fpk`，在飞牛 NAS 「应用中心 → 设置 → 手动安装应用」选中文件即可。安装后桌面出现「弄文笔记」图标，浏览器打开 `http://<飞牛IP>:3001`。

> 当前 .fpk 仅支持 x86_64 飞牛设备（`platform=x86`）。手动打包参见 [scripts/fpk/README.md](./scripts/fpk/README.md)。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3001` | 服务端口 |
| `DB_PATH` | `/app/data/nowen-note.db` | 数据库文件路径 |
| `TZ` | `Asia/Shanghai` | Docker 容器时区；海外用户可改为 `Europe/London`、`America/Los_Angeles` 等 |
| `OLLAMA_URL` | — | 本地 Ollama 地址（可选） |

数据持久化：容器需将 **`/app/data`** 映射到宿主机（不是 `/data`）。镜像已声明 `VOLUME ["/app/data"]`，主流 NAS 面板会自动预填该路径。

Docker 镜像内置 `tzdata`，`docker-compose.yml` 默认设置 `TZ=Asia/Shanghai`，用于保证待办「今日 / 本周 / 逾期」等后端日期判断按本地时区刷新。海外用户可在项目根目录创建 `.env` 并写入自己的时区，例如 `TZ=Europe/London`。

备份策略：自动备份默认写入 `/app/data/backups`，与数据在同一个卷。建议按 3-2-1 原则把 `/app/backups` 另挂到独立磁盘，并设置 `BACKUP_DIR=/app/backups`，详见 [`docker-compose.yml`](./docker-compose.yml) 内的注释。

## 数据目录说明

`/app/data`（本地开发时为项目根目录下的 `data/`）的典型结构如下：

```
data/
├── nowen-note.db          # SQLite 主数据库
├── backups/               # 自动备份文件
├── attachments/           # 所有附件（笔记图片、文件、任务附件等）
│   ├── 2026/06/           # 新附件按 YYYY/MM 分目录存储
│   │   └── <uuid>.<ext>
│   ├── <uuid>.<ext>       # 旧附件平铺路径，仍兼容读取
│   └── .thumbs/           # 缩略图缓存（webp），不要手动删除
└── fonts/                 # 自定义字体
```

- **新附件路径**：`data/attachments/YYYY/MM/<uuid>.<ext>`，按年月自动归档
- **旧附件兼容**：历史版本平铺在 `attachments/` 根目录的文件仍可正常读取，无需迁移
- **`.thumbs` 目录**：缩略图缓存，由系统自动生成和管理。删除后会在下次访问时重新生成，但会导致短暂的缩略图缺失，不建议手动删除
- **`task_attachments`**：待办任务的图片/附件与普通笔记附件共用同一个 `ATTACHMENTS_DIR`，通过数据库关联区分归属

## 文档

- 浏览器剪藏扩展（Chrome / Edge）：[Chrome Web Store](https://chromewebstore.google.com/detail/nowen-note-web-clipper/nglkodhfdbnfielchjpkjhenfaecafpg)
- 部署指南（本地 / Docker / 桌面 / 移动 / 群晖 / 绿联 / 威联通 / 飞牛 / 极空间 / ARM64）：[docs/deployment.md](./docs/deployment.md)
- 附件对象存储（S3 / R2 / MinIO）：[docs/object-storage.md](./docs/object-storage.md)
- 飞牛 .fpk 应用打包：[scripts/fpk/README.md](./scripts/fpk/README.md)
- ARM64 详解：[docs/deploy-arm64.md](./docs/deploy-arm64.md)
- 邮件备份配置：[docs/backup-email-smtp.md](./docs/backup-email-smtp.md)
- 编辑器模式切换：[docs/editor-mode-switch.md](./docs/editor-mode-switch.md)
- 多设备同步验证：[docs/multi-device-sync-validation.md](./docs/multi-device-sync-validation.md)
- iOS 版本说明：[docs/iOS-Release.md](./docs/iOS-Release.md)
- 隐私策略：[docs/PRIVACY.md](./docs/PRIVACY.md)
- OpenAPI：运行后访问 `/api/openapi.json`

> 📚 **教程中心**：[docs/tutorials/](./docs/tutorials/) — 从快速上手到高级功能的完整教程

- **快速上手**：[5 分钟快速上手](./docs/tutorials/quick-start.md) · [界面概览](./docs/tutorials/ui-overview.md) · [创建第一篇笔记](./docs/tutorials/first-note.md)
- **笔记管理**：[文档树 / 笔记本](./docs/tree-tutorial.md) · [标签和收藏](./docs/tutorials/tags-favorites.md) · [搜索](./docs/tutorials/search.md) · [回收站与恢复](./docs/tutorials/trash-recover.md) · [批量管理](./docs/tutorials/batch-manage.md)
- **编辑器**：[富文本编辑器](./docs/tutorials/editor-rich-text.md) · [Markdown 编辑器](./docs/tutorials/editor-markdown.md) · [斜杠命令](./docs/tutorials/slash-commands.md) · [高级块](./docs/tutorials/advanced-blocks.md) · [附件管理](./docs/tutorials/attachments.md) · [导入导出](./docs/tutorials/import-export.md)
- **AI 功能**：[AI 配置](./docs/tutorials/ai-setup.md) · [AI 生成标题和标签](./docs/tutorials/ai-title-tags.md) · [AI 总结](./docs/tutorials/ai-summary.md)
- **思维导图**：[入门](./docs/tutorials/mindmap-intro.md) · [从笔记生成](./docs/tutorials/mindmap-from-note.md) · [导出](./docs/tutorials/mindmap-export.md) · [Mermaid 图表](./docs/tutorials/mermaid.md)
- **待办事项**：[任务中心](./docs/tutorials/tasks.md)
- **说说 / 动态**：[说说功能](./docs/tutorials/diary.md)
- **分享与协作**：[分享](./docs/tutorials/sharing.md) · [实时协作](./docs/tutorials/realtime-collab.md) · [版本历史](./docs/tutorials/version-history.md) · [工作区](./docs/tutorials/workspace.md)
- **多端**：[桌面端](./docs/tutorials/desktop.md) · [移动端](./docs/tutorials/mobile.md) · [Android](./docs/tutorials/android.md) · [鸿蒙](./docs/tutorials/harmony.md) · [Web](./docs/tutorials/web.md)
- **部署与运维**：[Docker](./docs/tutorials/docker-deploy.md) · [NAS](./docs/tutorials/nas-deploy.md) · [备份与迁移](./docs/tutorials/backup-migrate.md) · [安全](./docs/tutorials/security.md)
- **开发者**：[API](./docs/tutorials/api.md) · [SDK](./docs/tutorials/sdk.md) · [CLI](./docs/tutorials/cli.md) · [MCP](./docs/tutorials/mcp.md) · [Webhook](./docs/tutorials/webhook.md) · [剪藏扩展](./docs/tutorials/clipper.md)
- **常见问题**：[附件问题](./docs/tutorials/faq-attachment.md) · [登录问题](./docs/tutorials/faq-login.md) · [性能问题](./docs/tutorials/faq-performance.md) · [同步问题](./docs/tutorials/faq-sync.md)

## 常见问题

### macOS 首次打开报错 / 无法启动 / "ERR_DLOPEN_FAILED"

由于本应用未做 Apple 公证（notarization），系统会把 dmg 里下载来的 `.app`
打上 quarantine 隔离属性，导致内部的 `better-sqlite3` 原生模块加载失败、
后端启动卡住 30 秒后报"后端启动超时"。

终端执行一行命令解除隔离即可（路径换成你实际拖过去的位置）：

```bash
sudo xattr -dr com.apple.quarantine "/Applications/Nowen Note.app"
# 或
sudo xattr -dr com.apple.quarantine ~/Downloads/Nowen\ Note.app
```

执行后双击重新打开即可。Apple Silicon 用户若用了 x64 版本，需要 Rosetta 2
（系统会自动提示安装）。

## 问题反馈

QQ 群：`1093473044`

## 支持作者

如果这个项目对你有帮助，欢迎扫码请作者喝杯咖啡 ☕

<p align="center">
  <img src="./weixin.jpg" alt="微信赞赏码" width="280" />
</p>

## 开源协议

[GPL-3.0](./LICENSE) — 派生作品对外分发时须同样以 GPL-3.0 开源并保留原作者版权声明。

## 最近重要更新

以下为近期完成的功能与修复，按类别整理。

### 移动端体验

- **Android 导出图片保存到相册**：导出为 PNG / JPG 后可直接写入系统相册，无需手动转存
- **移动端编辑器单图保存到相册**：长按编辑器中的单张图片，一键保存到设备相册

### 存储与附件

- **附件按 YYYY/MM 分目录存储**：新上传的附件自动归入 `data/attachments/YYYY/MM/` 目录，避免单目录文件数过多；旧附件平铺路径仍兼容读取
- **待办图片 orphan 清理误删修复**：修复任务附件被孤儿清理逻辑误判为未引用而删除的问题

### 跨端同步

- **删除 / 回收站跨端实时同步**：笔记删除、移入回收站、从回收站恢复等操作通过 WebSocket 实时推送至所有在线客户端
- **笔记列表更新时间开关**：笔记列表支持切换显示「更新时间」或「创建时间」，设置持久化

### 编辑器

- **表格单元格水平 / 垂直居中**：表格工具栏新增单元格对齐选项，支持水平居中和垂直居中
- **回收站笔记锁定**：回收站中的笔记自动进入只读状态，禁止编辑、收藏、锁定等操作，防止误操作

### 思维导图

- **思维导图滚轮缩放修复**：Ctrl + 滚轮缩放改为原生事件监听，修复部分浏览器下页面整体缩放的问题

### 分享

- **笔记本分享链接可撤销**：已生成的分享链接支持一键撤销，撤销后访客立即无法访问

### 搜索与 AI

- **搜索结果误报修复**：修复全文搜索在特定关键词下返回不相关结果的问题
- **AI 思考内容过滤**：AI 回答中的 `<think>` 思考过程不再展示给用户，仅显示最终回答内容

<!-- CHANGELOG:BEGIN -->
## 更新日志

> 最近 5 个版本的更新内容，完整历史见 [CHANGELOG.md](./CHANGELOG.md)。

### v1.2.8 - 2026-07-07

### ✨ 新增

- combine notebook tree expand toggle (5a283c6)
- add notebook tree expand collapse actions (#162) (add6eba)
- 标题输入框增加 IME 输入法状态感知，避免拼音串被误保存为标题 (9051ece)
- add browser-side size check and asset reference filtering for Siyuan import (fd6879a)

### 🐛 修复

- align notebook tree toggle icon state (3d37362)
- restore cross-device editor sync (da772b4)
- scroll markdown preview outline headings (#163) (b385fb9)
- support markdown default preview and siyuan callouts (#164) (4e94e0a)

### v1.2.7 - 2026-07-06

### ✨ 新增

- HTML 预览资源/大纲提取与编辑器联动优化 (8f46ae0)
- 任务重复/到期计算、导入导出、编辑器与任务面板优化 (25c6050)

### v1.2.6 - 2026-07-06

### ✨ 新增

- add EditorSplitView component (e574cbd)
- add NoteTabsBar and tab navigation system (b4dbfe9)
- add SiYuan SY parser and enhance import service (7d5d4c9)
- add SiYuan note import service (28cd137)

### 🐛 修复

- support manual note sorting (510bed7)
- 修复安全设置、任务中心及分享笔记等问题 (8f2565d)
- 优化登录页组件 (4c8be41)
- 优化登录页组件与国际化 (797be4c)
- 优化桌面端登录与导航组件 (539faf9)
- 优化Electron构建、日记中心及笔记列表 (865dc02)
- 优化笔记列表与标签页组件 (adec6f1)
- improve NoteTabsBar and AppContext integration (6a589a8)
- update Sidebar component (8b0ece9)
- update DataManager and i18n (aea3ac0)
- handle deleted notebooks in export/import flow (bf74ff9)
- enhance SiYuan import media asset handling (dd1d64a)
- improve SiYuan import service and i18n (ad29c60)

### v1.2.5 - 2026-07-03

### ✨ 新增

- 添加笔记本创建笔记功能 (6fe2abd)
- 添加任务日期 SQL 模块和附件 API 测试 (34b9ccd)
- add task calendar feed settings (6934d39)

### 🐛 修复

- 修复任务日历订阅带时间事件无法显示 (08b33b6)
- update Capacitor config (8ffe1a1)

### 📝 文档

- clarify arm64 docker and desktop support status (e59b3ee)

### 📦 构建

- add experimental linux arm64 desktop packaging entry (f86ff27)

### 📌 杂项

- Fix packaged app startup and client connectivity (f9befe7)

### v1.2.4 - 2026-07-02

### ✨ 新增

- source ICP filing from docker env (8eabf91)
- render database ICP filing on login page (6816e29)
- add ICP filing input in appearance settings (46f22a1)
- expose ICP filing site setting (f5deabd)
- add ICP filing setting (3dbfad6)
- add configurable ICP filing footer (15f7f53)
- copy personal notebooks to workspace (d06a70a)
- add rich text line height controls (86c5079)
- 添加Markdown视频预览与思维导图视口支持 (df167f8)
- support markdown preview in task details (df480f2)
- add postgres database adapter (PG-ADAPTER-02) (84acd7f)
- add database dialect helpers (PG-DIALECT-01) (aa6230b)
- add remaining async methods for task projects repository (FINAL) (6a9ef71)
- add remaining async methods for note links repository (C-A.5) (63fc2f1)
- add async replace links transaction for note links repository (C-A.4) (e7ca15a)
- add multi statement transaction support to sqlite adapter (C-A.1.1) (5fd016d)
- add async sort order update for task projects repository (C-A.3) (044500f)
- use executeBatch for system settings async setMany (C-A.2) (11e5ac9)
- add executeBatch to sqlite adapter (C-A.1) (5532f45)
- add bulk revoke and cleanup async methods for user sessions repository (B3-B2) (c7401a2)
- add revoke and list active async methods for user sessions repository (B3-B1) (bf4226a)
- add basic async methods for user sessions repository (B3-A) (bd3dc99)
- add async methods for workspace members repository (8d8bf12)
- **editor**: localize remote images on paste (PASTE-REMOTE-IMAGE-LOCALIZE-01) (296d138)
- **tasks**: add select all/deselect all in batch mode (0c1f688)
- **calendar**: schedule S3 export target refresh (TASK-CALENDAR-EXPORT-STORAGE-01-TIMER) (ffd5129)
- **calendar**: add S3 export target settings UI (TASK-CALENDAR-EXPORT-STORAGE-01-UI) (f343060)
- **say**: support markdown rendering in posts (SAY-MARKDOWN-INPUT-01) (87ff599)
- **calendar**: add S3 export target backend (TASK-CALENDAR-EXPORT-STORAGE-01-BE) (3bf11d5)
- **editor**: 点击块级引用后跳转到目标 heading 并高亮 (BLOCK-LINKS-JUMP-01) (b19b961)
- **editor**: [[ 引用时支持选择目标笔记标题块 (BLOCK-LINKS-UI-01) (ddebbb3)
- **db**: note_links 扩展块级引用支持 (BLOCK-LINKS-01) (b242e4c)
- **editor**: heading blockId 稳定生成 (BLOCK-ID-01) (1aaca83)
- **tasks**: lunar UI, i18n, tests (TASK-RECURRENCE-LUNAR-01) (1e39699)
- **tasks**: support lunar yearly recurrence (TASK-RECURRENCE-LUNAR-01) (9145328)
- **db**: add foreign keys to note_links table (NOTE-LINKS-FK-MIGRATION-01) (ba114d0)
- **backlinks**: add backlinks panel for note references (BACKLINKS-02) (d20df77)
- **tasks**: support custom recurrence rules (TASK-RECURRENCE-CUSTOM-01) (f3683f0)
- **tags**: auto-prune unused tags after note delete (TAG-PRUNE-UNUSED-ON-NOTE-DELETE-01) (8381830)
- **editor**: add note link reference with [[ trigger (BACKLINKS-01) (251666a)
- **journal**: add year-month archive view (JOURNAL-YEAR-MONTH-01) (056d651)
- **table**: improve mobile table editing toolbar (MOBILE-TABLE-EDITING-UX-01) (1c86d55)
- **journal**: add one-click today journal creation (JOURNAL-AUTO-DATE-01) (3cb743c)
- **table**: smart actions for phone numbers in table cells (TABLE-CELL-SMART-ACTIONS-01) (8c96fd9)
- **diary**: support custom publish date for moments (MOMENT-PUBLISH-DATE-01) (0929f08)
- **ui**: redesign diary layout with sidebar for desktop (SAYING-UI-DESKTOP-RV1) (e1dd92b)
- **auth**: add QR code for 2FA setup (AUTH-2FA-QR-01) (7eccea4)
- **tags**: multi-tag AND filtering (TAG-FILTER-MULTI-01) (c46aa33)
- add calendar button to sayings filter bar (SAYING-CALENDAR-PANEL-01) (6030714)
- **files**: show attachment folders in file manager (FILE-MANAGER-FOLDER-VIEW-01) (4806c17)
- show last saved time in editor sync status (SAVE-STATUS-LAST-SAVED-01) (831a060)
- file upload dialog with folder support (FILE-UPLOAD-DIALOG-FOLDER-01) (16e13e5)
- unify note creation menu in notebook tree (NOTE-CREATE-MENU-UNIFY-01) (90565ba)
- add collapsible code blocks (CODE-BLOCK-COLLAPSE-01) (8d2e682)
- add markdown note creation from notebook tree (NOTE-TREE-MARKDOWN-CREATE-01) (badb00e)
- group file manager attachments by notebook path (ATTACHMENT-DIRECTORY-ORGANIZE-01-E) (5d81115)

### 🐛 修复

- prevent title-only observer from freezing login (fabefcf)
- keep note list title toggle compact (8223b24)
- defer note list title-only observer until note list mounts (35e4a5a)
- load note list title-only mode with app bootstrap (17a812b)
- auto-start note list title-only mode (4969674)
- add note list title-only display mode (3cf78bc)
- **mcp**: create markdown notes with contentFormat (bd420d7)
- add issue 145 global UI guards (1db2eff)
- add issue 145 UI guard styles (f07fad9)
- allow larger custom font uploads (b80eb3e)
- prevent cached site settings on login page (dbf2b5a)
- persist and show ICP filing on desktop login (b533096)
- show database ICP filing on login page (ea16fbe)
- render database ICP filing on login page (97ad302)
- show ICP filing only on login page (a9a4aa7)
- keep ICP footer visible after login (b006428)
- preserve icp setting in settings responses (6583d57)
- refresh site settings on server url change (1fb54bf)
- disable mobile haptics and support pull refresh (2fa2c22)
- default ICP footer link when URL env is absent (ee35b46)
- rollback database when backup restore fails (b40fe16)
- show boot loading during remote startup (b76074e)
- move selected mind map nodes together (c9d95a6)
- use DOM hit testing for mind map selection (016c8aa)
- correct mind map selection hit testing (5b41888)
- make uploaded video previews compact (5e64fbc)
- support uploaded video previews in editor (431f4e2)
- harden note save conflict handling (7fdde21)
- improve note version history recovery flow (280f0e2)
- preserve content format in note version history (9c8e106)
- stop offline queue overwriting version conflicts (3837084)
- render markdown notes correctly when exporting images (88d4cf7)
- use sqlite string literal in task batch completion (ca49da5)
- resolve backend typecheck release blockers (b537dd2)
- repair user sessions SQL string quoting (f4b02ae)
- quote camelCase columns in folder sync files repository (929bf90)
- quote camelCase columns in embedding queue repository (2ee8837)
- quote camelCase columns in workspace invites repository (94b40e6)
- quote camelCase columns in task templates repository (8dd7af8)
- quote camelCase columns in task projects repository (1f9ade4)
- quote camelCase columns in calendar export targets repository (38e58e5)
- quote camelCase columns in api tokens repository (cca0b31)
- quote camelCase columns in share comments repository (2ca4ce2)
- quote camelCase columns in notebook share links repository (2a4ec85)
- quote camelCase columns in notebook members repository (42343b1)
- quote camelCase columns in user sessions repository (e66c3e2)
- quote camelCase columns in workspace members repository (813f706)
- quote camelCase columns in note versions repository (1b00230)
- quote camelCase columns in note links repository (b446abd)
- quote camelCase columns in attachment references repository (c58ef87)
- quote camelCase columns in tags repository (929efab)
- quote camelCase columns in note tags repository (5d9ef9d)
- quote camelCase columns in favorites repository (c8d2a29)
- quote camelCase columns in custom fonts repository (019e696)
- quote postgres camelCase column in system settings pilot (15622a2)
- **db**: fix null vs undefined type mismatch in share comments (DB-REPOSITORY-ACCEL-01-PARTIAL-FIX-BATCH-RV-FIX1) (be57e9a)
- **db**: migrate acl and notebook-permissions to repository pattern (DB-REPOSITORY-ACCEL-01-ACCEL-BATCH1) (18a4d3a)
- **db**: partial workspace members repository migration (DB-REPOSITORY-ACCEL-01-WORKSPACE-MEMBERS-FIX1) (7b675fe)
- **db**: complete share comments repository migration (DB-REPOSITORY-ACCEL-01-SHARE-COMMENTS-FIX1) (3a2477c)
- **db**: complete note versions repository migration (DB-REPOSITORY-ACCEL-01-NOTE-VERSIONS-FIX2) (95764c3)
- **db**: fix syntax error in workspaces.ts (DB-REPOSITORY-ACCEL-01-POST-B6-BULK-RV-FIX1) (c198729)
- **db**: complete task templates repository migration (DB-REPOSITORY-ACCEL-01-B-TASK-TEMPLATES-FIX1) (99b1589)
- **db**: complete note versions migration for users.ts (DB-REPOSITORY-ACCEL-01-B-NOTE-VERSIONS-FIX1) (31bc29c)
- **db**: complete notebook members migration for list and get operations (DB-REPOSITORY-ACCEL-01-B15-FIX1) (10d25b2)
- **db**: complete share comments migration for users.ts (DB-REPOSITORY-ACCEL-01-B16-FIX1) (17a4534)
- **db**: complete task attachments migration for data-file.ts (DB-REPOSITORY-ACCEL-01-B9-FIX2) (efe55d6)
- **db**: complete workspace members repository migration for users.ts (DB-REPOSITORY-ACCEL-01-B14-FIX1) (a7e34b8)
- **db**: add attachment references check methods (DB-REPOSITORY-ACCEL-01-B10-FIX1) (13635fc)
- **db**: add task attachments backup methods (DB-REPOSITORY-ACCEL-01-B9-FIX1) (baf2f1b)
- **db**: complete note yjs tables repository migration (DB-REPOSITORY-ACCEL-01-B11-B13-FIX1) (25175f2)
- **db**: complete workspace invites repository migration (DB-REPOSITORY-ACCEL-01-B6-FIX1) (b472637)
- **db**: complete mindmap folders repository migration (DB-REPOSITORY-ACCEL-01-B3-FIX2) (71446c4)
- **db**: complete folder metadata repository migration (DB-REPOSITORY-ACCEL-01-B3-FIX1) (fd6bf29)
- **build**: SEC-ELECTRON-01-E4.2 收敛 Electron 打包文件配置 (853c3ab)
- **security**: SEC-ELECTRON-01-E3.4 修正 meta CSP 兼容性 (66eaa7a)
- **security**: SEC-ELECTRON-01-E3.2 添加 CSP Report-Only 注入 (a1a6d19)
- **security**: SEC-ELECTRON-01-E2 添加权限请求拦截 (a23d5a1)
- **security**: add electron CSP meta policy (SEC-ELECTRON-01-E1-B1) (98d5ef0)
- **typecheck**: TYPECHECK-DEBT-01 清理预存类型错误 (e0d7903)
- **security**: harden folder sync file read boundary (SEC-ELECTRON-01-D4-B1) (3f65a25)
- **security**: SEC-ELECTRON-01-D3.2 收敛 PDF iframe sandbox 权限 (5b06d5f)
- **security**: SEC-ELECTRON-01-D3 附件预览安全 - PDF iframe sandbox + highlight.js DOMPurify (c83d3f7)
- **security**: SEC-ELECTRON-01-D4 folder-sync 扫描跳过 symlink 文件 (0298ebe)
- **security**: SEC-ELECTRON-01-D2 文件打开边界 - symlink 拒绝 + 路径脱敏 (6392325)
- **security**: SEC-ELECTRON-01-C-RV1 补齐 IPC 与 preload 双层校验 (f3925a7)
- **security**: SEC-ELECTRON-01-C IPC 与 preload 权限收敛 (c60888f)
- **security**: SEC-ELECTRON-01-B-RV1 sender 严格绑定 + setup IPC 校验 + 日志脱敏 (98a97c9)
- **electron**: deny window.open in data windows (SEC-ELECTRON-01-C-B2-B3) (7122e1b)
- **electron**: tighten main window navigation guard (SEC-ELECTRON-01-C-B1-FIX1) (3985aae)
- **electron**: guard main window navigation (SEC-ELECTRON-01-C-B1) (8b44ec7)
- **electron**: confirm before resetting local auth (SEC-ELECTRON-01-B2-B1) (ca3839c)
- **security**: SEC-ELECTRON-01-B Electron 最小高危修复 (1925304)
- **electron**: validate external URL protocols (SEC-ELECTRON-01-B1) (74feeba)
- **security**: SEC-XSS-01-E-RV1 parseVideoUrl 协议白名单修复 (e65c862)
- **security**: SEC-XSS-01-E Video iframe / Mermaid / KaTeX 安全兜底 (0cc0842)
- **security**: SEC-XSS-01-D 剪贴板粘贴 HTML 清洗 (1d712a6)
- **security**: SEC-XSS-01-C-RV1 CSP 生效位置修复 + data: 协议收紧 (c3f208a)
- **security**: 安全加固复审验收 (SECURITY-HARDENING-RV1) (f142992)
- **tasks**: 已完成任务的日期标签不再显示"已逾期" (e71c67b)
- **tasks**: remove duplicate batch route (TASK-BATCH-ACTION-500-01-RV2) (d9a5dd3)
- **tasks**: return safe errors for batch actions (TASK-BATCH-ACTION-500-01-RV1) (2c55e64)
- **tasks**: add comprehensive error handling for batch endpoint (d09cd25)
- **tasks**: add try-catch in batch complete to prevent 500 error (9f87408)
- **electron**: open associated markdown files directly (PC-MD-FILE-ASSOCIATION-OPEN-01) (960d461)
- **tags**: limit tag name length and truncate display (TAG-LENGTH-LIMIT-01) (7c736d2)
- **editor**: 修复 LaTeX 公式导致刷新后笔记内容丢失 (4a398b0)
- **editor**: replace HeadingItem with NoteEditorHeading in EditorPane (50d1f5f)
- **editor**: resolve HeadingItem type conflict in TiptapEditor (e529e4c)
- **calendar**: show absolute ICS subscription URL (BUG-CALENDAR-ICS-ABSOLUTE-URL-01) (6c66f11)
- **electron**: 修复 macOS ARM Traffic Light 按钮错位和拖拽问题 (e4afe02)
- **auth**: 退出登录时清除自动登录凭据 (c82c7c0)
- **journal**: 修复点击今日日记时 AnimatePresence 重复 key 警告 (bf992a9)
- **calendar**: correct S3 signing path for export targets (TASK-CALENDAR-EXPORT-STORAGE-01-BE-RV1) (ea5cfa4)
- **editor**: 显式引入 Link 扩展并配置 note: 协议 (BLOCK-LINKS-UI-01-RV3-LINK-PERSIST-DEEP-CHECK) (70b87ac)
- **editor**: 在 tiptapExtensions 中允许 note: 协议 (BLOCK-LINKS-UI-01-RV3-LINK-PERSIST-DEEP) (670cee0)
- **editor**: 允许 Link mark 使用 note: 协议 (BLOCK-LINKS-UI-01-RV2-LINK-PERSIST) (fc6e3e2)
- **diary**: prevent mood filter 'All moods' text wrapping (SIDEBAR-DIARY-SECTION-REMOVE-01) (6e76a21)
- **sidebar**: remove diary section from notes sidebar (SIDEBAR-DIARY-SECTION-REMOVE-01) (05380df)
- **db**: 添加 v39 迁移 (calendar-export-targets) (60c1d0f)
- **editor**: BLOCK-LINKS-UI-01-RV1 修复 triggerFrom 删除范围 (e8286be)
- **editor**: BLOCK-ID-01-RV1 修复 appendTransaction 和 schema 兼容性 (2445e20)
- **mindmap**: ensure schema for folders and reload list (BUG-MINDMAP-RELOAD-500-01) (d9352a1)
- **backlinks**: RV1 fixes for note_links cleanup and linkText (BACKLINKS-02-RV1) (be40897)
- **tasks**: prevent month/year overflow in custom recurrence (TASK-RECURRENCE-CUSTOM-01-RV1) (2118109)
- preserve viewMode context when pruning invalid selectedTagIds (TAG-PRUNE-UNUSED-ON-NOTE-DELETE-01-RV2) (dd52e9d)
- **tags**: cleanup invalid selectedTagIds after prune (TAG-PRUNE-UNUSED-ON-NOTE-DELETE-01-RV1) (678609e)
- **editor**: fix note link search and trigger position (BACKLINKS-01-RV1) (9677b0b)
- **tags**: refresh tags after note delete/trash (TAG-CLEANUP-ON-NOTE-DELETE-01) (9ddc763)
- **calendar**: support token-based public ICS subscription (TASK-CALENDAR-SUBSCRIBE-01-RV1) (09e1c6d)
- **journal**: add refresh token for archive data (JOURNAL-YEAR-MONTH-01-RV1) (0f11186)
- **table**: add toggleHeaderColumn and remove dead state (MOBILE-TABLE-EDITING-UX-01-RV1) (394dcc2)
- **journal**: change GET to POST and add unique index (JOURNAL-AUTO-DATE-01-RV1) (f01eb53)
- **diary**: desktop layout cohesion and visual noise reduction (SAYING-UI-DESKTOP-RV2) (2448059)
- **diary**: fix timezone offset in custom date (MOMENT-PUBLISH-DATE-01-RV1) (042d5a0)
- **share**: align image layout with editor rendering (BUG-SHARED-NOTE-IMAGE-LAYOUT-01) (2c18683)
- **files**: add missing ListView props in grouped view (FILE-MANAGER-TSC-DEBT-01) (69d97e9)
- **tags**: RV1 regression fixes for multi-tag filtering (TAG-FILTER-MULTI-01-RV1) (758a2a2)
- **i18n**: add diary calendar title translation (SAYING-CALENDAR-PANEL-01) (ed7f090)
- **desktop**: support api-only remote servers (BUG-DESKTOP-REMOTE-API-ONLY-01) (9af904e)
- **files**: show empty attachment folders in folder view (FILE-MANAGER-FOLDER-VIEW-01-RV1) (444c328)
- **files**: invalidate cache before refreshing after upload (BUG-FILE-UPLOAD-LIST-REFRESH-01) (4fa7522)
- **files**: update folderId on hash dedup hit (b188eff)
- **auth**: prevent account data leakage on user switch (13ddde0)
- **security**: prevent account data leak after switching users (AUTH-ACCOUNT-SECURITY-CACHE-01) (2e4bd36)
- extract parseServerTime to shared dateTime utility (NOTE-EXPORT-TIME-01-RV1) (5b890e1)
- parse backend timestamps as UTC in note export (NOTE-EXPORT-TIME-01) (0b2276c)
- **files**: deduplicate items to prevent repeated group rendering (cbde17b)
- use correct translation alias in MarkdownEditor status bar (MARKDOWN-EDITOR-RUNTIME-01) (2b85dc3)
- merge create note split-button into unified dropdown trigger (NOTE-LIST-NEW-MENU-01) (fc9783c)
- **files**: remove extra closing div causing JSX error (aaac0cf)
- **files**: toolbar layout regression - missing closing div + search overflow (a8e208b)
- **ui**: move storage badge inline with title in FileManager header (FILE-MANAGER-HEADER-UI-01) (98a5c8b)
- **editor**: markdown status bar char/word count display (0656e04)
- close unclosed div tag in FileManager.tsx (0cc6c94)
- remove duplicate ChevronDown import in FileManager.tsx (63c83e7)
- **files**: mobile layout + download compatibility (9239047)

### ♻️ 重构

- clean appearance settings after ICP removal (b078379)
- hide ICP input in appearance settings (08ac7f7)
- make ICP filing read-only site config (5a39fab)
- remove ICP filing from editable settings (cf1fd3b)
- hide global ICP footer outside login page (8ff2b24)
- define DatabaseAdapter interface (PG-ADAPTER-01) (5200851)
- **db**: add async methods for workspace members repository (B2-C) (93b7763)
- **db**: add async methods for note acl repository (B2-B) (53d2a01)
- **db**: add async methods for notebookMembersRepository (B2-A) (bf83c39)
- **db**: add batch 07 B1 remaining async repository pilots (32cd139)
- **db**: add batch 07 B1 async repository pilots (79e540e)
- **db**: add batch 06 A-level async repository pilots (8aa710d)
- **db**: add batch 05 A-level async repository pilots (decc07b)
- **db**: add batch 04 A-level async repository pilots (e432b63)
- **db**: add calendar export targets async repository pilot (DB-SQLITE-ASYNC-REPOSITORY-PILOT-BATCH-03-CALENDAR-TARGETS) (106c7af)
- **db**: add batch async repository pilots (DB-SQLITE-ASYNC-REPOSITORY-PILOT-BATCH-02) (90943d3)
- **db**: add custom fonts async repository pilot (DB-SQLITE-ASYNC-REPOSITORY-PILOT-02-CUSTOM-FONTS) (9fbf2b4)
- **db**: add sqlite async adapter pilot (DB-SQLITE-ASYNC-ADAPTER-PILOT-01A) (a8e1b54)
- **db**: add member query service pilot (DB-QUERY-LAYER-02-MEMBER-PILOT) (333f23c)
- **db**: add attachment query service pilot (DB-QUERY-LAYER-01-ATTACHMENT-PILOT) (c2d99cc)
- **db**: move embedding queue into repository (DB-REPOSITORY-ACCEL-01-B18) (548fd8d)
- **db**: move diary attachments into repository (DB-REPOSITORY-ACCEL-01-B17) (73d6e62)
- **db**: move share comments into repository (DB-REPOSITORY-ACCEL-01-B16) (b104973)
- **db**: move notebook members into repository (DB-REPOSITORY-ACCEL-01-B15) (27058fa)
- **db**: move workspace members into repository (DB-REPOSITORY-ACCEL-01-B14) (7f6c19c)
- **db**: move note Y-updates into repository (DB-REPOSITORY-ACCEL-01-B13) (2159237)
- **db**: move attachment chunks into repository (DB-REPOSITORY-ACCEL-01-B12) (0f1a355)
- **db**: move note Y-snapshots into repository (DB-REPOSITORY-ACCEL-01-B11) (9a7443e)
- **db**: move attachment references into repository (DB-REPOSITORY-ACCEL-01-B10) (9c1a1b5)
- **db**: move task attachments into repository (DB-REPOSITORY-ACCEL-01-B9) (58b6e56)
- **db**: move note ACL into repository (DB-REPOSITORY-ACCEL-01-B8) (e14cd19)
- **db**: move notebook share links into repository (DB-REPOSITORY-ACCEL-01-B7) (d4a1247)
- **db**: move workspace invites into repository (DB-REPOSITORY-ACCEL-01-B6) (8983d46)
- **db**: move task dependencies into repository (DB-REPOSITORY-ACCEL-01-B5) (1e546e4)
- **db**: move task calendar feeds into repository (DB-REPOSITORY-ACCEL-01-B4) (7960a2b)
- **db**: move folder metadata tables into repositories (DB-REPOSITORY-ACCEL-01-B3) (3138eb8)
- **db**: move task metadata tables into repositories (DB-REPOSITORY-ACCEL-01-B2) (9dec2e3)
- **db**: DB-REPOSITORY-ACCEL-01-B1 迁移 favorites + user_sessions Repository (90bddd7)
- **db**: move note_versions delete cleanup into repository (DB-REPOSITORY-NEXT-CANDIDATES-01-B2-B3) (a8ea3ae)
- **db**: move note_versions insert into repository (DB-REPOSITORY-NEXT-CANDIDATES-01-B2-B2) (db51d49)
- **db**: move note version reads to repository (DB-REPOSITORY-NEXT-CANDIDATES-01-B2-B1) (efe04bd)
- **db**: move ai custom prompts to repository (DB-REPOSITORY-NEXT-CANDIDATES-01-B1) (0b4ecf8)
- **db**: move note tag filtering to repository (DB-REPOSITORY-TAGS-COMPLETE-01-B2) (e119b38)
- **db**: move note tag links to repository (DB-REPOSITORY-TAGS-COMPLETE-01-B1B3) (c20eb53)
- **db**: move tag deletion to repository (DB-REPOSITORY-PILOT-NEXT-D1-C3) (4e1c810)
- **db**: move tag update to repository (DB-REPOSITORY-PILOT-NEXT-D1-C2) (d599f38)
- **db**: move tag creation to repository (DB-REPOSITORY-PILOT-NEXT-D1-C1) (54e4f57)
- **db**: move single tag query to repository (DB-REPOSITORY-PILOT-NEXT-D1-B) (7ce30c5)
- **db**: move tag list query to repository (DB-REPOSITORY-PILOT-NEXT-D1-A) (e38948d)
- **db**: move note link delete cleanup to repository (DB-REPOSITORY-PILOT-NEXT-C3) (10e1eff)
- **db**: move note link sync writes to repository (DB-REPOSITORY-PILOT-NEXT-C2) (68fa5c3)
- **db**: move note backlinks query to repository (DB-REPOSITORY-PILOT-NEXT-C1) (6edba78)
- **db**: migrate calendar export targets to repository (DB-REPOSITORY-PILOT-NEXT-B) (fb9bf88)
- **db**: add calendar export targets repository (DB-REPOSITORY-PILOT-NEXT-B) (73c1df9)
- **db**: route api token usage pruning through repository (DB-REPOSITORY-PILOT-02-C3) (cfe6fe3)
- **db**: route api token usage recording through repository (DB-REPOSITORY-PILOT-02-C2-B) (5266f36)
- **db**: route api token last-used update through repository (DB-REPOSITORY-PILOT-02-C2-A) (c7f2f81)
- **db**: route api token lookup through repository (DB-REPOSITORY-PILOT-02-C1) (0879a79)
- **db**: add api tokens repository for token routes (DB-REPOSITORY-PILOT-02-B) (5dd578c)
- **db**: route vec_dim setting through repository (DB-REPOSITORY-PILOT-01-B) (81e2bf7)
- add system_settings and custom_fonts repositories (DB-REPOSITORY-PILOT-01-A) (71aab0c)

### 📝 文档

- document ICP filing docker env (4a0511f)
- mark PG-PILOT-03 fully closed (150a253)
- mark PG-PILOT-02 fully closed (75cd60d)
- mark PG-PILOT-01 fully closed (1f4cffd)
- document postgres pilot validation blocker (5c43575)
- add postgres schema sql draft (PG-SCHEMA-02) (b176cac)
- add postgres schema migration plan (PG-SCHEMA-01) (ac6fe31)
- add repository pilot guide and migration rules (bed266b)

### 💄 样式

- **css**: 修复 Traffic Light 相关注释乱码 (ef71944)

### ✅ 测试

- assert ICP env source is documented in seed (b0a067a)
- cover ICP docker env source (a8474b5)
- update ICP site settings expectations (a77105b)
- cover rich text note version restore (4b9efd7)
- add postgres pilot for note tags repository (4bfaf3e)
- add postgres pilot for favorites repository (837b022)
- add postgres pilot for custom fonts repository (766356e)
- align postgres pilot test environment (a1d801d)
- add postgres pilot coverage for system settings repository (PG-PILOT-01) (8f16968)
- fix known isolation test failures (1edc05c)
- add repository-level atomicity rollback test for replaceLinksForSourceAsync (8b7ae9c)
- add serial test script for db isolation (TEST-ISOLATION-01-A) (841884b)
- **db**: add sqlite adapter behavior tests (DB-SQLITE-ASYNC-ADAPTER-PILOT-01B-TEST) (5d5b573)

### 🔧 其他

- tune sidebar layout constants (22e3ebf)
- define default ICP footer env values (09fc815)
- add postgres local development environment (PG-DOCKER-01) (776d35e)
- **journal**: 移除今日日记按钮 (af399c1)
- 从版本控制中移除 tsconfig.tsbuildinfo (78c7ddd)
- 将 tsconfig.tsbuildinfo 加入 .gitignore (f518a5f)
- **skills**: 添加中文提交规范 skill (9d2f2a1)
- exclude dist-electron-lite build artifacts from git (3c72186)

### 📌 杂项

- @ fix(security): SEC-XSS-01-C 分享页渲染清洗 + CSP 头 (9d07b6c)
- @ fix(security): SEC-XSS-01-B HTML 安全清洗最小实施 (19cb69b)

<!-- CHANGELOG:END -->
