const FINAL_MARKER_RE = /(?:^|\n)\s*(最终答案|最终标题|标题|答案|Final|Answer|Result)\s*[:：]\s*/gi;
const QUOTE_RE = /^[\s"'“”‘’「」『』《》#*`\-:：]+|[\s"'“”‘’「」『』《》#*`\-:：。.!！?？]+$/g;

function isLikelyReasoningLine(line: string): boolean {
  const s = line.trim();
  if (!s) return false;
  return [
    /^思考过程\s*[:：]?/,
    /^推理过程\s*[:：]?/,
    /^分析过程\s*[:：]?/,
    /^首先[，,].*(用户|我需要|我们需要|要求)/,
    /^用户(要求|想要|希望|需要)/,
    /^我(需要|会|应该|将|先|可以)/,
    /^我们(需要|可以|应该|先)/,
    /^接下来[，,]/,
    /^根据(用户|提供的|以上)/,
    /标题长度在\s*20\s*字以内/,
    /只返回标题文本/,
    /不要加引号或其他标点/,
  ].some((re) => re.test(s));
}

export function stripAiReasoning(raw: string): string {
  if (!raw) return "";
  let text = String(raw).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");

  text = text.replace(/<\s*(think|reasoning)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  text = text.replace(/<\s*(think|reasoning)[^>]*>[\s\S]*?(?=(?:最终答案|最终标题|标题|答案|Final|Answer|Result)\s*[:：]|$)/gi, "");
  text = text.replace(/<\s*\/\s*(think|reasoning)\s*>/gi, "");
  text = text.replace(/```\s*(think|reasoning)[\s\S]*?```/gi, "");
  text = text.replace(/(?:^|\n)\s*(思考过程|推理过程|分析过程)\s*[:：][\s\S]*?(?=(?:\n\s*)?(最终答案|最终标题|标题|答案|Final|Answer|Result)\s*[:：])/gi, "\n");

  return text
    .split("\n")
    .filter((line) => !isLikelyReasoningLine(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function extractFinalAnswer(raw: string): string {
  const stripped = stripAiReasoning(raw);
  if (!stripped) return "";

  let match: RegExpExecArray | null;
  let lastEnd = -1;
  FINAL_MARKER_RE.lastIndex = 0;
  while ((match = FINAL_MARKER_RE.exec(stripped)) !== null) {
    lastEnd = FINAL_MARKER_RE.lastIndex;
  }

  const picked = lastEnd >= 0 ? stripped.slice(lastEnd) : stripped;
  return stripAiReasoning(picked)
    .replace(/^\s*[-*•]\s*/gm, "")
    .trim();
}

function cleanOneLineTitle(line: string): string {
  return line
    .replace(/^\s*(最终标题|标题|最终答案|答案|Final|Answer|Result)\s*[:：]\s*/i, "")
    .replace(/^#+\s*/, "")
    .replace(QUOTE_RE, "")
    .replace(/\s+/g, "")
    .trim();
}

export function extractAiTitle(raw: string, maxLength = 20): string {
  const answer = extractFinalAnswer(raw);
  const candidates = answer
    .split(/\n+/)
    .map((line) => cleanOneLineTitle(line))
    .filter(Boolean)
    .filter((line) => !isLikelyReasoningLine(line));

  let title = candidates[0] || cleanOneLineTitle(answer);
  if (!title || isLikelyReasoningLine(title)) return "";

  title = title
    .replace(/^这篇笔记(主要)?(讲述|介绍|讨论|关于)/, "")
    .replace(/^根据内容(可知|来看)?/, "")
    .replace(/^可以命名为/, "")
    .replace(/^建议标题为/, "");

  const sentence = title.split(/[。.!！?？；;]/).find((part) => part.trim()) || title;
  title = cleanOneLineTitle(sentence);

  if (!title || isLikelyReasoningLine(title)) return "";
  return title.length > maxLength ? title.slice(0, maxLength) : title;
}

export function fallbackTitleFromContent(content: string, maxLength = 20): string {
  const line = (content || "")
    .replace(/<[^>]+>/g, " ")
    .split(/\n+/)
    .map((item) => item.replace(/^#+\s*/, "").trim())
    .find(Boolean) || "";

  const title = cleanOneLineTitle(line.split(/[。.!！?？；;]/)[0] || line);
  return title.length > maxLength ? title.slice(0, maxLength) : title;
}
