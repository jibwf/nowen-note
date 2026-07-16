import fs from "node:fs";

const filePath = "frontend/src/components/WeChatFavoritesImport.tsx";
let source = fs.readFileSync(filePath, "utf8");

function replaceOnce(search, replacement, label) {
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`Missing ${label}`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label} is not unique`);
  }
  source = source.slice(0, first) + replacement + source.slice(first + search.length);
}

replaceOnce(
`  CheckCircle,
  FileArchive,
  Loader2,
  RefreshCw,
  Tags,
  Upload,
`,
`  CheckCircle,
  ChevronDown,
  Download,
  ExternalLink,
  FileArchive,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Tags,
  Upload,
`,
"guide icon imports",
);

replaceOnce(
`type Phase = "idle" | "scanning" | "ready" | "importing" | "done" | "error";
`,
`type Phase = "idle" | "scanning" | "ready" | "importing" | "done" | "error";

const WECHAT_DATA_ANALYSIS_RELEASE_URL = "https://github.com/LifeArchiveProject/WeChatDataAnalysis/releases/latest";
const WECHAT_FAVORITES_TUTORIAL_URL = "https://github.com/cropflre/nowen-note/blob/main/docs/tutorials/wechat-favorites-import.md";
`,
"guide URLs",
);

replaceOnce(
`  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
`,
`  const [message, setMessage] = useState("");
  const [showDetails, setShowDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
`,
"guide state",
);

replaceOnce(
`  const typeEntries = useMemo(
`,
`  const guide = zh ? {
    title: "如何获取微信收藏 ZIP",
    summary: "先用 WeChatDataAnalysis 从本人电脑上的微信本地数据导出，再上传工具生成的原始 ZIP。",
    steps: [
      ["1", "下载并安装", "从官方 Release 安装 WeChatDataAnalysis（Windows）。"],
      ["2", "打开收藏", "选择正确的微信账号，进入「收藏」，确认能看到收藏内容。"],
      ["3", "导出 JSON", "点击「导出收藏」，把默认 HTML 改为 JSON，选择类型和保存目录。"],
      ["4", "上传原始 ZIP", "使用工具生成的 ZIP；不要解压、删媒体、改名或重新压缩。"],
    ],
    warning: "关键：导出弹窗默认是 HTML，必须手动切换为 JSON。普通聊天记录 ZIP 和账号数据归档 ZIP 不能使用。",
    official: "下载官方工具",
    tutorial: "查看完整教程",
    expand: "展开获取教程",
    collapse: "收起获取教程",
  } : {
    title: "How to get a WeChat Favorites ZIP",
    summary: "Export your own local WeChat data with WeChatDataAnalysis, then upload the original ZIP produced by the tool.",
    steps: [
      ["1", "Install the exporter", "Download WeChatDataAnalysis from its official Windows release."],
      ["2", "Open Favorites", "Select the correct WeChat account and confirm your favorites are visible."],
      ["3", "Export as JSON", "Choose Export Favorites, change the default HTML format to JSON, then select types and a destination."],
      ["4", "Upload the original ZIP", "Do not extract, rename, remove media from, or recompress the generated ZIP."],
    ],
    warning: "Important: the export dialog defaults to HTML. Change it to JSON. Chat-history ZIPs and account archive ZIPs are not supported here.",
    official: "Download official tool",
    tutorial: "Read full tutorial",
    expand: "Show export guide",
    collapse: "Hide export guide",
  };

  const typeEntries = useMemo(
`,
"guide copy",
);

replaceOnce(
`    setShowDetails(false);
    await runPreflight(selected, DEFAULT_CONFIG);
`,
`    setShowDetails(false);
    setShowGuide(false);
    await runPreflight(selected, DEFAULT_CONFIG);
`,
"collapse guide after file selection",
);

replaceOnce(
`    setShowDetails(false);
    if (inputRef.current) inputRef.current.value = "";
`,
`    setShowDetails(false);
    setShowGuide(true);
    if (inputRef.current) inputRef.current.value = "";
`,
"restore guide on reset",
);

replaceOnce(
`          </span>
        </div>
      </div>

      {phase === "idle" && (
`,
`          </span>
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-sky-200/80 bg-white/80 dark:border-sky-900/50 dark:bg-zinc-900/55">
        <button
          type="button"
          onClick={() => setShowGuide((value) => !value)}
          aria-expanded={showGuide}
          aria-controls="wechat-favorites-export-guide"
          className="flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors hover:bg-sky-50/70 dark:hover:bg-sky-500/5"
        >
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
            <Download size={16} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-zinc-800 dark:text-zinc-100">{guide.title}</span>
            <span className="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{guide.summary}</span>
            <span className="mt-1 block text-[11px] font-medium text-sky-700 dark:text-sky-300">
              {showGuide ? guide.collapse : guide.expand}
            </span>
          </span>
          <ChevronDown
            size={16}
            className={\`mt-1 shrink-0 text-zinc-400 transition-transform \${showGuide ? "rotate-180" : ""}\`}
          />
        </button>

        {showGuide && (
          <div id="wechat-favorites-export-guide" className="border-t border-sky-100 px-3.5 pb-3.5 pt-3 dark:border-sky-900/40">
            <ol className="grid gap-2 sm:grid-cols-2">
              {guide.steps.map(([number, title, description]) => (
                <li key={number} className="flex gap-2.5 rounded-lg bg-zinc-50/90 p-2.5 dark:bg-zinc-950/45">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-600 text-[10px] font-bold text-white">
                    {number}
                  </span>
                  <span className="min-w-0">
                    <strong className="block text-xs text-zinc-700 dark:text-zinc-200">{title}</strong>
                    <span className="mt-0.5 block text-[11px] leading-5 text-zinc-500 dark:text-zinc-400">{description}</span>
                  </span>
                </li>
              ))}
            </ol>

            <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-5 text-amber-800 dark:border-amber-900/50 dark:bg-amber-500/10 dark:text-amber-300">
              <ShieldCheck size={14} className="mt-0.5 shrink-0" />
              <span>{guide.warning}</span>
            </div>

            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <a
                href={WECHAT_DATA_ANALYSIS_RELEASE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-sky-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-sky-700"
              >
                <Download size={14} /> {guide.official}
              </a>
              <a
                href={WECHAT_FAVORITES_TUTORIAL_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                <ExternalLink size={14} /> {guide.tutorial}
              </a>
            </div>
          </div>
        )}
      </div>

      {phase === "idle" && (
`,
"inline guide placement",
);

fs.writeFileSync(filePath, source, "utf8");
console.log("Applied inline WeChat Favorites export guide.");
