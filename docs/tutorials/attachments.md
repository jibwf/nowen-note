# 附件上传和管理

> 在笔记中插入图片、文件，管理所有上传的附件。

---

## 上传附件

### 在笔记中插入图片

**拖拽上传：** 直接把图片拖进编辑器

**粘贴上传：** 复制图片后 `Ctrl/Cmd + V`

**斜杠命令：** 输入 `/图片` 选择本地文件

### 图片处理

上传的图片会自动：

1. 保存到服务器附件系统
2. 生成 webp 缩略图（三档自适应）
3. 插入笔记中

---

## 附件管理

### 在笔记中查看

点击编辑器标题栏右侧的 📎 附件图标，查看当前笔记的所有附件。

### 在文件管理器中查看

点击左侧导航栏 📁「文件管理」入口，查看所有附件。

---

## 通过 MCP / API 上传

AI 助手和脚本不需要模拟 Web UI 拖拽，可以直接使用后端已有接口。

### MCP 工具

| 工具 | 用途 |
|---|---|
| `nowen_upload_attachment` | 上传本地文件，传 `noteId` 时直接绑定笔记 |
| `nowen_list_attachments` | 查询文件管理列表或某篇笔记引用过的附件 |
| `nowen_attach_to_note` | 把已上传附件插入 Markdown 笔记正文 |

示例需求：

```text
把 C:\Users\me\Pictures\screenshot.png 上传到 note-123，并插入到笔记末尾
```

### REST API

绑定笔记上传：

```bash
curl -X POST http://localhost:3001/api/attachments \
  -H "Authorization: Bearer $TOKEN" \
  -F "noteId=<note-id>" \
  -F "file=@./screenshot.png;type=image/png"
```

未绑定上传到文件管理：

```bash
curl -X POST http://localhost:3001/api/files/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@./manual.pdf;type=application/pdf"
```

---

## 文件管理器

### 功能

- 查看所有上传的文件
- 按笔记分类
- 查看文件大小和上传时间
- 删除不需要的文件

### 「我的上传」分类

| 分类 | 说明 |
|---|---|
| 已引用 | 被笔记引用的附件 |
| 未引用 | 没有被任何笔记引用的附件 |

### 孤儿清理

未引用的附件可以清理以释放空间。清理前系统会检查引用关系，确保不会误删正在使用的文件。

---

## 附件健康检查

在 ⚙️ 设置 → 数据管理中可以执行附件健康检查：

- 检查数据库记录和物理文件是否一致
- 发现物理文件缺失的附件
- 发现悬空引用（正文引用了不存在的附件）

---

## 对象存储

大附件可以存储在 S3/R2/MinIO 等对象存储中，减轻服务器磁盘压力。

配置参考 [对象存储配置](../object-storage.md)。

---

## 常见问题

### Q：图片太大上传失败？

默认限制 10MB。可在服务器配置中调整。

### Q：附件占用空间太大？

使用文件管理器清理未引用的附件。或配置对象存储分流。

---

## 下一步

- [对象存储配置](./object-storage.md) — S3/R2 配置
- [文件管理器教程](./file-manager.md) — 文件管理

---

> 本教程基于 nowen-note v1.1.18 编写。
