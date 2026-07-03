# OpenAPI 接入指南

> 通过 REST API 与 nowen-note 集成，构建自定义应用。

---

## API 概览

nowen-note 提供完整的 REST API，访问 `/api/openapi.json` 查看 OpenAPI 3.0 规范文档。

---

## 认证

所有 API 需要 JWT Token 认证。

### 获取 Token

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```

返回：`{ "token": "eyJ..." }`

### 使用 Token

在请求 Header 中添加：

```
Authorization: Bearer <token>
```

---

## API 端点一览

### 认证

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/verify` | 验证 Token |
| PUT | `/api/auth/change-password` | 修改密码 |

### 笔记本

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notebooks` | 获取笔记本列表 |
| POST | `/api/notebooks` | 创建笔记本 |
| PUT | `/api/notebooks/:id` | 更新笔记本 |
| DELETE | `/api/notebooks/:id` | 删除笔记本 |
| PUT | `/api/notebooks/:id/move` | 移动笔记本 |
| PUT | `/api/notebooks/reorder/batch` | 批量排序 |

### 笔记

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/notes` | 获取笔记列表 |
| GET | `/api/notes/:id` | 获取笔记详情 |
| POST | `/api/notes` | 创建笔记 |
| PUT | `/api/notes/:id` | 更新笔记 |
| DELETE | `/api/notes/:id` | 删除笔记 |

### 标签

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tags` | 获取标签列表 |
| POST | `/api/tags` | 创建标签 |
| PUT | `/api/tags/:id` | 更新标签 |
| DELETE | `/api/tags/:id` | 删除标签 |

### 搜索

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/search?q=关键词` | 全文搜索 |

### 附件和文件

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/attachments` | 上传并绑定到指定笔记，`multipart/form-data` 字段为 `file`、`noteId` |
| GET | `/api/attachments/:id` | 下载或内联预览附件 |
| DELETE | `/api/attachments/:id` | 删除附件 |
| GET | `/api/files` | 文件管理列表，支持 `noteId`、`category`、`q`、`page` 等筛选 |
| GET | `/api/files/stats` | 文件统计 |
| GET | `/api/files/:id` | 文件详情和引用信息 |
| POST | `/api/files/upload` | 上传到文件管理，暂不绑定业务笔记 |
| PATCH | `/api/files/:id` | 重命名文件 |
| DELETE | `/api/files/:id` | 删除文件 |
| POST | `/api/files/batch-delete` | 批量删除文件 |

### AI

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/ai/chat` | AI 对话 |
| POST | `/api/ai/ask` | AI 知识库问答 |

### 任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/tasks` | 获取任务列表 |
| POST | `/api/tasks` | 创建任务 |
| PUT | `/api/tasks/:id` | 更新任务 |

### 思维导图

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/mindmaps` | 获取思维导图列表 |
| POST | `/api/mindmaps` | 创建思维导图 |

### 其他

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查 |
| GET | `/api/settings` | 系统设置 |
| GET | `/api/audit` | 审计日志 |
| GET | `/api/backups` | 备份列表 |

---

## 示例：创建笔记

```bash
# 1. 登录获取 Token
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}' | jq -r '.token')

# 2. 创建笔记本
curl -X POST http://localhost:3001/api/notebooks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"API 测试"}'

# 3. 创建笔记
curl -X POST http://localhost:3001/api/notes \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title":"通过 API 创建的笔记","contentText":"这是内容"}'
```

---

## 示例：上传附件

绑定到指定笔记上传：

```bash
curl -X POST http://localhost:3001/api/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "noteId=<note-id>" \
  -F "file=@./screenshot.png;type=image/png"
```

先上传到文件管理：

```bash
curl -X POST http://localhost:3001/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./manual.pdf;type=application/pdf"
```

上传成功会返回 `url`，例如 `/api/attachments/<id>`。Markdown 笔记中可写入：

```markdown
![截图](/api/attachments/<id>)
[PDF 附件](/api/attachments/<id>?download=1)
```

---

## SDK 和 CLI

不想直接调用 HTTP API？还有更方便的方式：

- [TypeScript SDK](./sdk.md) — Node.js/TypeScript 集成
- [CLI 工具](./cli.md) — 命令行操作
- [MCP Server](./mcp.md) — AI 助手集成

---

## 下一步

- [SDK 使用教程](./sdk.md)
- [MCP Server 教程](./mcp.md)
- [CLI 工具教程](./cli.md)

---

> 本教程基于 nowen-note v1.1.18 编写。
