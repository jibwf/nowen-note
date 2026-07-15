from pathlib import Path


def replace_once(path: str, old: str, new: str, label: str) -> None:
    file = Path(path)
    source = file.read_text(encoding="utf-8")
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"{label}: expected exactly one match in {path}, got {count}")
    file.write_text(source.replace(old, new, 1), encoding="utf-8")


# MCP REST client methods.
replace_once(
    "packages/nowen-mcp/src/api-client.ts",
    '''  /** 删除笔记（永久） */
  async deleteNote(id: string): Promise<any> {
    return this.request(`/api/notes/${id}`, { method: "DELETE" });
  }

  // ==================== 标签 ====================''',
    '''  /** 删除笔记（永久） */
  async deleteNote(id: string): Promise<any> {
    return this.request(`/api/notes/${id}`, { method: "DELETE" });
  }

  // ==================== 通用块 / 双链 ====================

  async listNoteBlocks(noteId: string, limit = 500): Promise<any[]> {
    const result = await this.request<{ blocks: any[] }>(`/api/blocks/note/${noteId}`, { query: { limit } });
    return result.blocks || [];
  }

  async getBlock(noteId: string, blockId: string): Promise<any> {
    return this.request(`/api/blocks/${noteId}/${blockId}`);
  }

  async searchBlocks(query: string, params: { notebookId?: string; limit?: number } = {}): Promise<any[]> {
    return this.request("/api/blocks/search", { query: { q: query, notebookId: params.notebookId, limit: params.limit } });
  }

  async resolveInternalLink(link: string): Promise<any> {
    return this.request("/api/blocks/resolve", { query: { link } });
  }

  async getBacklinks(noteId: string, limit = 100): Promise<any[]> {
    const result = await this.request<{ backlinks: any[] }>(`/api/notes/${noteId}/backlinks`, { query: { limit } });
    return result.backlinks || [];
  }

  async getBlockBacklinks(noteId: string, blockId: string): Promise<any[]> {
    const result = await this.request<{ backlinks: any[] }>(`/api/blocks/${noteId}/${blockId}/backlinks`);
    return result.backlinks || [];
  }

  async createBlock(noteId: string, params: {
    blockType?: "heading" | "paragraph" | "listItem" | "taskItem" | "blockquote" | "codeBlock";
    text?: string;
    afterBlockId?: string;
    expectedNoteVersion: number;
    operationId: string;
  }): Promise<any> {
    return this.request(`/api/blocks/${noteId}`, { method: "POST", body: params });
  }

  async updateBlock(noteId: string, blockId: string, params: {
    text: string;
    expectedNoteVersion: number;
    operationId: string;
  }): Promise<any> {
    return this.request(`/api/blocks/${noteId}/${blockId}`, { method: "PUT", body: params });
  }

  async deleteBlock(noteId: string, blockId: string, params: {
    expectedNoteVersion: number;
    operationId: string;
  }): Promise<any> {
    return this.request(`/api/blocks/${noteId}/${blockId}`, { method: "DELETE", body: params });
  }

  async moveBlock(noteId: string, blockId: string, params: {
    targetBlockId: string;
    position?: "before" | "after";
    expectedNoteVersion: number;
    operationId: string;
  }): Promise<any> {
    return this.request(`/api/blocks/${noteId}/${blockId}/move`, { method: "POST", body: params });
  }

  // ==================== 标签 ====================''',
    "MCP block API methods",
)

# Structured note reading.
replace_once(
    "packages/nowen-mcp/src/index.ts",
    '''server.tool(
  "nowen_read_note",
  "读取 Nowen Note 中指定笔记的完整内容（包括标题、正文、标签等全部信息）",
  {
    noteId: z.string().describe("笔记 ID"),
  },
  async ({ noteId }) => {
    try {
      const note = await api.getNote(noteId);
      const result = buildReadNoteResult(note);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  }
);''',
    '''server.tool(
  "nowen_read_note",
  "读取指定笔记，可返回纯文本、Markdown/原始正文或结构化块树",
  {
    noteId: z.string().describe("笔记 ID"),
    mode: z.enum(["text", "markdown", "blocks"]).optional().describe("返回模式，默认 text"),
    includeBlockIds: z.boolean().optional().describe("text/markdown 模式是否同时附带块 ID 列表"),
    maxBlocks: z.number().int().positive().max(2000).optional().describe("blocks 模式最大块数量，默认 500"),
  },
  async ({ noteId, mode, includeBlockIds, maxBlocks }) => {
    try {
      const note = await api.getNote(noteId);
      const selectedMode = mode || "text";
      if (selectedMode === "blocks") {
        const blocks = await api.listNoteBlocks(noteId, maxBlocks || 500);
        return {
          content: [{ type: "text" as const, text: JSON.stringify({
            id: note.id,
            title: note.title,
            notebookId: note.notebookId,
            version: note.version,
            contentFormat: note.contentFormat,
            blocks,
          }, null, 2) }],
        };
      }
      const result: any = selectedMode === "markdown"
        ? {
            id: note.id,
            title: note.title,
            notebookId: note.notebookId,
            version: note.version,
            contentFormat: note.contentFormat,
            content: note.content,
          }
        : buildReadNoteResult(note);
      if (includeBlockIds) result.blocks = await api.listNoteBlocks(noteId, maxBlocks || 500);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  }
);''',
    "structured read note tool",
)

BLOCK_TOOLS = r'''
// ==================== 双链与块工具 ====================

const noteBlockTypeSchema = z.enum(["heading", "paragraph", "listItem", "taskItem", "blockquote", "codeBlock"]);

server.tool(
  "nowen_resolve_link",
  "解析 note: 内部链接，返回目标笔记和可选目标块",
  { link: z.string().describe("note:<noteId> 或 note:<noteId>#blk:<blockId>") },
  async ({ link }) => {
    try {
      const result = await api.resolveInternalLink(link);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_get_backlinks",
  "获取引用指定笔记的来源笔记和来源块",
  {
    noteId: z.string().describe("目标笔记 ID"),
    limit: z.number().int().positive().max(200).optional().describe("最大结果数，默认 100"),
  },
  async ({ noteId, limit }) => {
    try {
      const backlinks = await api.getBacklinks(noteId, limit || 100);
      return { content: [{ type: "text" as const, text: JSON.stringify(backlinks, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_get_block",
  "按 noteId + blockId 读取单个结构化块",
  {
    noteId: z.string().describe("笔记 ID"),
    blockId: z.string().describe("块 ID"),
  },
  async ({ noteId, blockId }) => {
    try {
      const block = await api.getBlock(noteId, blockId);
      return { content: [{ type: "text" as const, text: JSON.stringify(block, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_search_blocks",
  "全文搜索块，返回 noteId、blockId、块类型、文本和路径",
  {
    query: z.string().describe("搜索关键词"),
    notebookId: z.string().optional().describe("限定笔记本 ID"),
    limit: z.number().int().positive().max(200).optional().describe("最大结果数，默认 50"),
  },
  async ({ query, notebookId, limit }) => {
    try {
      const blocks = await api.searchBlocks(query, { notebookId, limit: limit || 50 });
      return { content: [{ type: "text" as const, text: JSON.stringify(blocks, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_get_block_backlinks",
  "获取指向指定块的来源笔记和来源块",
  {
    noteId: z.string().describe("目标笔记 ID"),
    blockId: z.string().describe("目标块 ID"),
  },
  async ({ noteId, blockId }) => {
    try {
      const backlinks = await api.getBlockBacklinks(noteId, blockId);
      return { content: [{ type: "text" as const, text: JSON.stringify(backlinks, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_create_block",
  "在笔记中创建块；通过 expectedNoteVersion 防并发覆盖，operationId 保证重试幂等",
  {
    noteId: z.string().describe("笔记 ID"),
    blockType: noteBlockTypeSchema.optional().describe("块类型，默认 paragraph"),
    text: z.string().optional().describe("块文本"),
    afterBlockId: z.string().optional().describe("插入到该块之后；不传则追加"),
    expectedNoteVersion: z.number().int().positive().describe("当前笔记版本"),
    operationId: z.string().min(8).max(128).describe("调用方生成的幂等操作 ID"),
  },
  async ({ noteId, blockType, text, afterBlockId, expectedNoteVersion, operationId }) => {
    try {
      const result = await api.createBlock(noteId, { blockType, text, afterBlockId, expectedNoteVersion, operationId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_update_block",
  "更新块文本，要求笔记版本和幂等操作 ID",
  {
    noteId: z.string().describe("笔记 ID"),
    blockId: z.string().describe("块 ID"),
    text: z.string().describe("新文本"),
    expectedNoteVersion: z.number().int().positive().describe("当前笔记版本"),
    operationId: z.string().min(8).max(128).describe("幂等操作 ID"),
  },
  async ({ noteId, blockId, text, expectedNoteVersion, operationId }) => {
    try {
      const result = await api.updateBlock(noteId, blockId, { text, expectedNoteVersion, operationId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_delete_block",
  "删除块，要求笔记版本和幂等操作 ID",
  {
    noteId: z.string().describe("笔记 ID"),
    blockId: z.string().describe("块 ID"),
    expectedNoteVersion: z.number().int().positive().describe("当前笔记版本"),
    operationId: z.string().min(8).max(128).describe("幂等操作 ID"),
  },
  async ({ noteId, blockId, expectedNoteVersion, operationId }) => {
    try {
      const result = await api.deleteBlock(noteId, blockId, { expectedNoteVersion, operationId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);

server.tool(
  "nowen_move_block",
  "在同一父块内移动块，要求笔记版本和幂等操作 ID",
  {
    noteId: z.string().describe("笔记 ID"),
    blockId: z.string().describe("要移动的块 ID"),
    targetBlockId: z.string().describe("目标块 ID"),
    position: z.enum(["before", "after"]).optional().describe("放在目标之前或之后，默认 after"),
    expectedNoteVersion: z.number().int().positive().describe("当前笔记版本"),
    operationId: z.string().min(8).max(128).describe("幂等操作 ID"),
  },
  async ({ noteId, blockId, targetBlockId, position, expectedNoteVersion, operationId }) => {
    try {
      const result = await api.moveBlock(noteId, blockId, { targetBlockId, position, expectedNoteVersion, operationId });
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  },
);
'''

replace_once(
    "packages/nowen-mcp/src/index.ts",
    '''// ==================== 附件工具 ====================''',
    BLOCK_TOOLS + '''
// ==================== 附件工具 ====================''',
    "MCP block tool registration",
)

replace_once(
    "packages/nowen-mcp/src/index.ts",
    '''server.tool(
  "nowen_search",
  "在 Nowen Note 中全文搜索笔记。使用 FTS5 全文索引，支持模糊匹配，返回匹配的笔记摘要和高亮片段",
  {
    query: z.string().describe("搜索关键词"),
  },
  async ({ query }) => {
    try {
      const results = await api.search(query);
      const summary = results.map((r: any) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        notebookId: r.notebookId,
        updatedAt: r.updatedAt,
      }));
      return {
        content: [{ type: "text" as const, text: `找到 ${results.length} 条结果:\n${JSON.stringify(summary, null, 2)}` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  }
);''',
    '''server.tool(
  "nowen_search",
  "搜索笔记或块；块级搜索会返回稳定 blockId",
  {
    query: z.string().describe("搜索关键词"),
    level: z.enum(["note", "block"]).optional().describe("搜索层级，默认 note"),
    notebookId: z.string().optional().describe("块级搜索时限定笔记本"),
    limit: z.number().int().positive().max(200).optional().describe("块级结果上限"),
  },
  async ({ query, level, notebookId, limit }) => {
    try {
      if (level === "block") {
        const blocks = await api.searchBlocks(query, { notebookId, limit: limit || 50 });
        return { content: [{ type: "text" as const, text: `找到 ${blocks.length} 个块:\n${JSON.stringify(blocks, null, 2)}` }] };
      }
      const results = await api.search(query);
      const summary = results.map((r: any) => ({
        id: r.id,
        title: r.title,
        snippet: r.snippet,
        notebookId: r.notebookId,
        updatedAt: r.updatedAt,
      }));
      return {
        content: [{ type: "text" as const, text: `找到 ${results.length} 条结果:\n${JSON.stringify(summary, null, 2)}` }],
      };
    } catch (err: any) {
      return { content: [{ type: "text" as const, text: `错误: ${err.message}` }], isError: true };
    }
  }
);''',
    "MCP note/block search",
)

# Local MCP notebook scope firewall must also understand /api/blocks.
replace_once(
    "packages/nowen-mcp/src/scoped-entry.ts",
    '''async function handleSearchRequest(request: Request): Promise<Response> {
  await ensureDescendantsHydrated(request);
  const response = await originalFetch(request);
  if (!response.ok) return response;
  const body = await readJsonResponse(response);
  return Array.isArray(body)
    ? replaceJsonResponse(response, policy.filterNotes(body))
    : response;
}
''',
    '''async function handleSearchRequest(request: Request): Promise<Response> {
  await ensureDescendantsHydrated(request);
  const response = await originalFetch(request);
  if (!response.ok) return response;
  const body = await readJsonResponse(response);
  return Array.isArray(body)
    ? replaceJsonResponse(response, policy.filterNotes(body))
    : response;
}

async function handleBlocksRequest(request: Request, url: URL): Promise<Response> {
  await ensureDescendantsHydrated(request);
  const method = request.method.toUpperCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const action = segments[2] || "";

  if (action === "search") {
    const requestedNotebookId = url.searchParams.get("notebookId");
    if (requestedNotebookId) policy.assertNotebookAllowed(requestedNotebookId, "搜索块");
    const response = await originalFetch(request);
    if (!response.ok) return response;
    const body = await readJsonResponse(response);
    return Array.isArray(body)
      ? replaceJsonResponse(response, body.filter((item: any) => {
          try { policy.assertNotebookAllowed(item?.notebookId, "读取块"); return true; } catch { return false; }
        }))
      : response;
  }
  if (action === "resolve") {
    const response = await originalFetch(request);
    if (!response.ok) return response;
    const body = await readJsonResponse(response);
    policy.assertNotebookAllowed(body?.note?.notebookId, "解析内部链接");
    return response;
  }
  if (action === "graph") {
    const response = await originalFetch(request);
    if (!response.ok) return response;
    const body = await readJsonResponse(response);
    if (!body || !Array.isArray(body.nodes)) return response;
    const nodes = body.nodes.filter((node: any) => {
      try { policy.assertNotebookAllowed(node?.notebookId, "读取关系图"); return true; } catch { return false; }
    });
    const ids = new Set(nodes.map((node: any) => node.id));
    const edges = Array.isArray(body.edges)
      ? body.edges.filter((edge: any) => ids.has(edge.sourceNoteId) && ids.has(edge.targetNoteId))
      : [];
    return replaceJsonResponse(response, { nodes, edges });
  }

  const noteId = action === "note" ? decodeURIComponent(segments[3] || "") : decodeURIComponent(action);
  if (!noteId) throw new ScopeDeniedError("块接口缺少 noteId");
  await assertNoteAllowed(noteId, request, isWriteMethod(method));
  return originalFetch(request);
}
''',
    "scoped MCP block handler",
)
replace_once(
    "packages/nowen-mcp/src/scoped-entry.ts",
    '''    if (url.pathname === "/api/search") {
      return await handleSearchRequest(request);
    }
''',
    '''    if (url.pathname === "/api/search") {
      return await handleSearchRequest(request);
    }
    if (url.pathname === "/api/blocks" || url.pathname.startsWith("/api/blocks/")) {
      return await handleBlocksRequest(request, url);
    }
''',
    "scoped MCP block routing",
)

# Universal block IDs in Tiptap.
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    ''' *   - 只处理 heading，不处理 paragraph / list / image / table 等
 *   - 不做块引用 UI，不做跳转，不改 note_links
 */''',
    ''' *   - 第一版处理 heading / paragraph / listItem / taskItem / blockquote / codeBlock
 *   - table / image / media 暂不纳入块身份模型
 */''',
    "Tiptap block ID comment",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''        types: ["heading"],''',
    '''        types: ["heading", "paragraph", "listItem", "taskItem", "blockquote", "codeBlock"],''',
    "Tiptap universal block ID types",
)
replace_once(
    "frontend/src/components/TiptapEditor.tsx",
    '''          // 扫描所有 heading 节点
          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "heading") return;''',
    '''          // 扫描所有受支持块节点
          const supportedBlockTypes = new Set(["heading", "paragraph", "listItem", "taskItem", "blockquote", "codeBlock"]);
          newState.doc.descendants((node, pos) => {
            if (!supportedBlockTypes.has(node.type.name)) return;''',
    "Tiptap universal block scan",
)

# Content conversion keeps block IDs across RTE <-> Markdown.
replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''       types: ["heading"],''',
    '''       types: ["heading", "paragraph", "listItem", "taskItem", "blockquote", "codeBlock"],''',
    "content format universal block attrs",
)
replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''  // 视频节点：必须与 TiptapEditor 保持一致，否则 generateHTML 时 video 节点
    // 会被 schema 过滤，导致切换到 MD 后视频丢失。
    VideoExtension,
  ];''',
    '''  // 视频节点：必须与 TiptapEditor 保持一致，否则 generateHTML 时 video 节点
    // 会被 schema 过滤，导致切换到 MD 后视频丢失。
    VideoExtension,
  ];''',
    "content extension anchor verification",
)
replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''  td.addRule("videoEmbed", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      (node as Element).getAttribute("data-video-platform") != null,
    replacement: (_content, node) => {
      const el = node as Element;
      return videoNodeToMarkdown({
        src: el.getAttribute("data-src") || "",
        kind: (el.getAttribute("data-kind") as any) || "iframe",
        platform: (el.getAttribute("data-video-platform") as any) || "unknown",
        originalUrl: el.getAttribute("data-original-url") || "",
      });
    },
  });

  _turndown = td;''',
    '''  td.addRule("videoEmbed", {
    filter: (node) =>
      node.nodeName === "DIV" &&
      (node as Element).getAttribute("data-video-platform") != null,
    replacement: (_content, node) => {
      const el = node as Element;
      return videoNodeToMarkdown({
        src: el.getAttribute("data-src") || "",
        kind: (el.getAttribute("data-kind") as any) || "iframe",
        platform: (el.getAttribute("data-video-platform") as any) || "unknown",
        originalUrl: el.getAttribute("data-original-url") || "",
      });
    },
  });

  // Persist universal block identity in Markdown using the compatible `^blk_xxx` suffix.
  td.addRule("nowenBlockId", {
    filter: (node) => {
      if (!(node instanceof Element)) return false;
      if (!node.getAttribute("data-block-id")) return false;
      return /^(H[1-6]|P|LI|BLOCKQUOTE|PRE)$/.test(node.nodeName);
    },
    replacement: (content, node) => {
      const el = node as Element;
      const id = el.getAttribute("data-block-id") || "";
      const clean = content.replace(/^\\n+|\\n+$/g, "").trim();
      if (!id) return content;
      if (/^H[1-6]$/.test(el.nodeName)) {
        const level = Number(el.nodeName.slice(1));
        return `\\n\\n${"#".repeat(level)} ${clean} ^${id}\\n\\n`;
      }
      if (el.nodeName === "LI") {
        const task = el.getAttribute("data-type") === "taskItem";
        const checked = el.getAttribute("data-checked") === "true";
        const marker = task ? `- [${checked ? "x" : " "}]` : (el.parentElement?.nodeName === "OL" ? "1." : "-");
        return `\\n${marker} ${clean} ^${id}\\n`;
      }
      if (el.nodeName === "BLOCKQUOTE") return `\\n\\n> ${clean.replace(/\\n/g, "\\n> ")} ^${id}\\n\\n`;
      if (el.nodeName === "PRE") return `\\n\\n${clean}\\n^${id}\\n\\n`;
      if (el.parentElement?.nodeName === "LI") return content;
      return `\\n\\n${clean} ^${id}\\n\\n`;
    },
  });

  _turndown = td;''',
    "Turndown block ID preservation",
)
replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''  // 脚注：定义行 `[^id]: 内容` → 保留内容文本；引用 `[^id]` → 去掉
  // 全文搜索语义化更合理（脚注内容应该可被搜到，引用标记本身不重要）
  text = text.replace(/^\[\^[A-Za-z0-9_-]+\]:\s?/gm, "");
  text = text.replace(/\[\^[A-Za-z0-9_-]+\]/g, "");
  // 合并多余空白''',
    '''  // 脚注：定义行 `[^id]: 内容` → 保留内容文本；引用 `[^id]` → 去掉
  // 全文搜索语义化更合理（脚注内容应该可被搜到，引用标记本身不重要）
  text = text.replace(/^\[\^[A-Za-z0-9_-]+\]:\s?/gm, "");
  text = text.replace(/\[\^[A-Za-z0-9_-]+\]/g, "");
  // 派生块 ID 是结构元数据，不进入全文索引与摘要。
  text = text.replace(/(?:\s+|^)\^blk_[A-Za-z0-9_-]{6,}\s*$/gm, "");
  // 合并多余空白''',
    "plain text strips block IDs",
)

BLOCK_ID_HELPERS = r'''
interface MarkdownBlockIdPlaceholderResult {
  text: string;
  ids: string[];
}

function extractMarkdownBlockIdPlaceholders(md: string): MarkdownBlockIdPlaceholderResult {
  const ids: string[] = [];
  const text = md.replace(/(?:\s+|^)\^(blk_[A-Za-z0-9_-]{6,})\s*$/gm, (_match, id) => {
    const index = ids.push(id) - 1;
    return ` NOWENBLOCKIDTOKEN${index}END`;
  });
  return { text, ids };
}

function restoreMarkdownBlockIdPlaceholders(html: string, ids: string[]): string {
  let out = html;
  ids.forEach((id, index) => {
    const token = `NOWENBLOCKIDTOKEN${index}END`;
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`<([a-zA-Z0-9]+)([^>]*)>([\\s\\S]*?)${escaped}([\\s\\S]*?)<\\/\\1>`, "i");
    out = out.replace(pattern, (_match, tag, attrs, before, after) => {
      const safeId = escapeAttr(id);
      return `<${tag}${attrs} data-block-id="${safeId}">${before}${after}</${tag}>`;
    });
  });
  return out;
}
'''

replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''export function markdownToHtml(md: string): string {
  if (!md) return "";
  try {
    // 第 1 步：抽离数学公式
    const { text: afterMath, blocks, inlines } = extractMathPlaceholders(md);
    // 第 2 步：抽离脚注（在 math 之后做，避免 `$..$` 内的 `[^x]` 被当成 ref）
    const { text: preprocessed, refs, defs } = extractFootnotePlaceholders(afterMath);''',
    BLOCK_ID_HELPERS + '''
export function markdownToHtml(md: string): string {
  if (!md) return "";
  try {
    // 第 0 步：把 ^blk_xxx 换成不会被 Markdown parser 吞掉的占位文本。
    const { text: afterBlockIds, ids: blockIds } = extractMarkdownBlockIdPlaceholders(md);
    // 第 1 步：抽离数学公式
    const { text: afterMath, blocks, inlines } = extractMathPlaceholders(afterBlockIds);
    // 第 2 步：抽离脚注（在 math 之后做，避免 `$..$` 内的 `[^x]` 被当成 ref）
    const { text: preprocessed, refs, defs } = extractFootnotePlaceholders(afterMath);''',
    "Markdown block ID placeholder extraction",
)
replace_once(
    "frontend/src/lib/contentFormat.ts",
    '''    // 第 3 步：还原 math + footnote 占位
    return restoreFootnotePlaceholders(
      restoreMathPlaceholders(html, blocks, inlines),
      refs,
      defs
    );''',
    '''    // 第 3 步：还原 math + footnote + blockId 占位
    return restoreMarkdownBlockIdPlaceholders(
      restoreFootnotePlaceholders(
        restoreMathPlaceholders(html, blocks, inlines),
        refs,
        defs
      ),
      blockIds,
    );''',
    "Markdown block ID placeholder restore",
)

# Backlink panel surfaces source/target block context already returned by the backend.
replace_once(
    "frontend/src/components/BacklinksPanel.tsx",
    '''interface BacklinkItem {
  sourceNoteId: string;
  title: string;
  updatedAt: string;
  linkText: string | null;
}''',
    '''interface BacklinkItem {
  sourceNoteId: string;
  sourceBlockId: string | null;
  sourceNotebookId: string;
  title: string;
  updatedAt: string;
  linkText: string | null;
  linkType: "note" | "block";
  targetBlockId: string | null;
  excerpt: string | null;
}''',
    "backlink panel data contract",
)
replace_once(
    "frontend/src/components/BacklinksPanel.tsx",
    '''                        {item.linkText && item.linkText !== item.title && (
                          <span className="text-xs text-tx-tertiary truncate">
                            引用: {item.linkText}
                          </span>
                        )}''',
    '''                        <span className="text-[10px] rounded bg-app-hover px-1.5 py-0.5 text-tx-tertiary shrink-0">
                          {item.linkType === "block" ? "块引用" : "笔记引用"}
                        </span>
                        {item.sourceBlockId && (
                          <span className="text-[10px] text-tx-tertiary truncate" title={item.sourceBlockId}>
                            {item.sourceBlockId}
                          </span>
                        )}''',
    "backlink panel link type",
)
replace_once(
    "frontend/src/components/BacklinksPanel.tsx",
    '''                      </div>
                    </div>
                  </motion.button>''',
    '''                      </div>
                      {(item.excerpt || item.linkText) && (
                        <p className="mt-1.5 text-xs leading-5 text-tx-secondary line-clamp-3">
                          {item.excerpt || item.linkText}
                        </p>
                      )}
                    </div>
                  </motion.button>''',
    "backlink panel excerpt",
)

print("issue 165 client patch applied")
