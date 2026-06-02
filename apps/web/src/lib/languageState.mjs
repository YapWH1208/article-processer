export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "article-processor-language";

const SUPPORTED_LANGUAGES = new Set(["en", "zh"]);
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"];

const SHELL_COPY = {
  en: {
    appName: "Article Processor",
    nav: {
      home: "Home",
      library: "Library",
      upload: "Upload",
      chat: "Chat",
      graph: "Graph",
      dashboard: "Dashboard",
    },
    settings: "Settings",
    openNavigation: "Open navigation menu",
    closeMenu: "Close menu",
    lightMode: "Light mode",
    darkMode: "Dark mode",
    processing: "processing",
    toggleToChinese: "Switch to Chinese",
    toggleToEnglish: "Switch to English",
  },
  zh: {
    appName: "文章处理器",
    nav: {
      home: "首页",
      library: "文库",
      upload: "上传",
      chat: "聊天",
      graph: "图谱",
      dashboard: "仪表盘",
    },
    settings: "设置",
    openNavigation: "打开导航菜单",
    closeMenu: "关闭菜单",
    lightMode: "浅色模式",
    darkMode: "深色模式",
    processing: "个处理中",
    toggleToChinese: "切换到中文",
    toggleToEnglish: "Switch to English",
  },
};

const UI_TRANSLATIONS = {
  "Article Processor": "文章处理器",
  Home: "首页",
  Library: "文库",
  Upload: "上传",
  Chat: "聊天",
  Graph: "图谱",
  Dashboard: "仪表盘",
  Settings: "设置",
  General: "通用",
  Skills: "技能",
  Metadata: "元数据",
  Reader: "阅读器",
  Summary: "摘要",
  Jobs: "任务",
  Context: "上下文",
  "Open navigation menu": "打开导航菜单",
  "Close menu": "关闭菜单",
  "Light mode": "浅色模式",
  "Dark mode": "深色模式",
  "Switch to Chinese": "切换到中文",
  "Switch to English": "切换到英文",
  "Go to Home": "前往首页",
  "Go to Library": "前往文库",
  "Go to Upload": "前往上传",
  "Go to Chat": "前往聊天",
  "Go to Graph": "前往图谱",
  "Go to Dashboard": "前往仪表盘",
  "Go to Settings": "前往设置",
  "Search articles or type a command...": "搜索文章或输入命令...",
  "Search articles or type a command…": "搜索文章或输入命令...",
  select: "选择",
  navigate: "导航",
  "Esc to close": "Esc 关闭",
  "No results found": "未找到结果",

  "AI-Powered Research Intelligence": "AI 驱动的研究智能",
  "Transform Papers": "将论文转换为",
  "into knowledge": "知识",
  "into answers": "答案",
  "into graphs": "图谱",
  "into insights": "洞见",
  "Upload research papers and watch AI": "上传研究论文，让 AI",
  "parse, chunk, extract, and graph": "解析、切分、抽取并构建图谱",
  "them into structured, queryable knowledge": "把它们转换为结构化、可查询的知识",
  "with cited answers": "并提供带引用的答案",
  "you can trust.": "让你可以信任。",
  "Upload Your First Paper": "上传第一篇论文",
  "Browse Library": "浏览文库",
  "Search across all article content...": "搜索所有文章内容...",
  "View all results": "查看全部结果",
  Searching: "搜索中",
  "Backend Connected": "后端已连接",
  "Backend Offline": "后端离线",
  articles: "篇文章",
  processed: "已处理",
  "Processing Pipeline": "处理流水线",
  "From Upload to Insight in 5 Steps": "从上传到洞见只需 5 步",
  "Every paper flows through the same battle-tested pipeline — fully automated, zero configuration.": "每篇论文都会经过同一套可靠流水线，全自动，无需配置。",
  "Every paper flows through the same battle-tested pipeline 鈥?fully automated, zero configuration.": "每篇论文都会经过同一套可靠流水线，全自动，无需配置。",
  "hover for details": "悬停查看详情",
  "AI Capabilities": "AI 能力",
  "Everything Your Research Needs": "研究所需能力一应俱全",
  "Hover each card to reveal specific capabilities. A complete pipeline from raw document to structured, queryable intelligence.": "悬停卡片查看具体能力。从原始文档到结构化、可查询智能的完整流水线。",
  "Bring Your Own AI": "接入你自己的 AI",
  "Connect to any LLM provider. OpenAI, Anthropic, DeepSeek, OpenRouter, GLM, MiniMax, Kimi, or your own custom endpoint.": "连接任意大模型提供商：OpenAI、Anthropic、DeepSeek、OpenRouter、GLM、MiniMax、Kimi，或自定义端点。",
  "Parse Engines": "解析引擎",
  "LLM Providers": "大模型提供商",
  "Output Formats": "输出格式",
  License: "许可证",
  "Open source, self-hosted": "开源，可自托管",
  "Jump Right In": "立即开始",
  "Explore every part of the platform.": "探索平台的每个部分。",
  "Upload Papers": "上传论文",
  "Start processing": "开始处理",
  "Browse & search": "浏览和搜索",
  "Ask your papers": "向论文提问",
  "Explore connections": "探索关联",
  "Ready to Process Your Research?": "准备好处理你的研究了吗？",
  "Upload your first paper and watch the full pipeline in action.": "上传第一篇论文，观察完整流水线运行。",
  "No sign-up required — jump right in.": "无需注册，直接开始。",
  "No sign-up required 鈥?jump right in.": "无需注册，直接开始。",
  "Get Started": "开始使用",
  "Built with FastAPI + Next.js": "使用 FastAPI + Next.js 构建",
  "Self-hosted. Your data stays on your machine.": "自托管，你的数据保留在本机。",
  "Multi-Engine Parsing": "多引擎解析",
  "Smart Semantic Chunking": "智能语义切分",
  "LLM-Powered Extraction": "大模型驱动抽取",
  "Knowledge Graph": "知识图谱",
  "Conversational RAG": "对话式 RAG",
  "Workflow Automation": "工作流自动化",
  "Parse": "解析",
  "Normalize": "规范化",
  "Chunk": "切分",
  "Extract": "抽取",
  "Graph": "图谱",
  "Intelligent PDF parsing with MinerU, Docling, and pypdf. Auto-detects HTML, Markdown, TXT and unpacks ZIP archives preserving structure.": "使用 MinerU、Docling 和 pypdf 进行智能 PDF 解析。自动识别 HTML、Markdown、TXT，并在保留结构的同时解压 ZIP。",
  "Section-aware chunking with heading boundaries, configurable token windows, and overlapping context for high-quality retrieval.": "基于章节和标题边界进行切分，支持可配置 token 窗口与重叠上下文，提升检索质量。",
  "Structured extraction of authors, methodology, claims, entities, and references. Evidence trails link every claim to its source chunk.": "结构化抽取作者、方法、论点、实体和参考文献。证据链会把每个论点关联回来源片段。",
  "Ask questions with cited, source-linked answers drawn from complete article text. @-mention articles for focused context, or let AI search your entire library.": "基于完整文章文本提问，并获得带来源引用的答案。可用 @ 标记文章聚焦上下文，也可让 AI 搜索整个文库。",

  "Welcome to Article Processor": "欢迎使用文章处理器",
  "Upload a paper": "上传论文",
  "Drag & drop PDF, HTML, or Markdown files.": "拖放 PDF、HTML 或 Markdown 文件。",
  "AI extracts insights": "AI 抽取洞见",
  "Entities, claims, methodology & more.": "实体、论点、方法等信息。",
  "Chat & explore": "聊天与探索",
  "Ask questions, browse the knowledge graph.": "提问并浏览知识图谱。",
  Dismiss: "忽略",
  "Dismiss onboarding": "关闭引导",

  "Upload Documents": "上传文档",
  "Drop files here": "将文件拖到这里",
  "or click to browse": "或点击浏览",
  "Accepted File Types": "支持的文件类型",
  "Processing Queue": "处理队列",
  "Upload Queue": "上传队列",
  "Queued": "排队中",
  Uploaded: "已上传",
  Parsing: "解析中",
  Extracting: "抽取中",
  Indexing: "索引中",
  Completed: "已完成",
  Failed: "失败",
  "Needs Review": "需要审核",
  "Add URL": "添加 URL",
  "Upload URL": "上传 URL",
  "Start Upload": "开始上传",
  "Choose Files": "选择文件",
  "Clear completed": "清除已完成",
  "Resume processing": "继续处理",
  "Files uploaded": "文件已上传",
  "Upload failed": "上传失败",

  "Article Library": "文章文库",
  "Search titles & filenames...": "搜索标题和文件名...",
  Status: "状态",
  Sort: "排序",
  "Created": "创建时间",
  "Updated": "更新时间",
  Title: "标题",
  "Export Selected": "导出所选",
  "Import Articles": "导入文章",
  "No articles found": "未找到文章",
  "No articles yet": "还没有文章",
  "Upload articles": "上传文章",
  "Include archived": "包含归档",
  "Search content": "搜索内容",
  "Clear filters": "清除筛选",
  Previous: "上一页",
  Next: "下一页",

  Chats: "聊天",
  "New Chat": "新聊天",
  "No chats yet.": "还没有聊天。",
  "Start one below!": "在下方开始一个吧！",
  "No articles tagged — AI will search your library": "未标记文章，AI 将搜索你的文库",
  "No articles tagged 鈥?AI will search your library": "未标记文章，AI 将搜索你的文库",
  "Tag Articles": "标记文章",
  Processed: "已处理",
  Sources: "来源",
  "Switch Model": "切换模型",
  "No providers configured.": "未配置提供商。",
  "Add one in Settings": "到设置中添加一个",
  "No provider": "无提供商",
  "Select model": "选择模型",
  "default model": "默认模型",
  "Clear all": "清除全部",
  "Start a conversation": "开始对话",
  "Tag articles with": "使用",
  "for focused context, or just ask a question — the AI will search your library.": "标记文章以聚焦上下文，或直接提问，AI 会搜索你的文库。",
  "for focused context, or just ask a question 鈥?the AI will search your library.": "标记文章以聚焦上下文，或直接提问，AI 会搜索你的文库。",
  "Ask anything... Tag articles with @": "随便提问... 使用 @ 标记文章",
  "Type": "输入",
  "to tag articles.": "来标记文章。",
  "Sessions auto-save and persist across refreshes.": "会话会自动保存，并在刷新后保留。",

  "Article not found": "未找到文章",
  "Extraction needs review": "抽取结果需要审核",
  "Click to edit title": "点击编辑标题",
  "Reprocess": "重新处理",
  Archive: "归档",
  Restore: "恢复",
  Delete: "删除",
  "Delete Article": "删除文章",
  "This will move the article to trash. You can restore it later from archived items.": "这会将文章移至回收站。之后可从归档项目中恢复。",
  Cancel: "取消",
  "Document View": "文档视图",
  "View as:": "查看为：",
  "View as Markdown": "以 Markdown 查看",
  "View original PDF": "查看原始 PDF",
  "Original PDF": "原始 PDF",
  Extraction: "抽取结果",
  "AI-extracted info": "AI 抽取的信息",
  "Review JSON": "审核 JSON",
  "Review Extraction JSON": "审核抽取 JSON",
  "Edit the extracted JSON, then save to update this article's structured extraction.": "编辑抽取出的 JSON，然后保存以更新这篇文章的结构化抽取结果。",
  "Save Review": "保存审核",
  "Saving...": "保存中...",
  "AI Skills": "AI 技能",
  "Run focused analysis on this article.": "对这篇文章运行专项分析。",
  "Related Articles": "相关文章",
  "Close chat panel": "关闭聊天面板",
  "Collapse chat panel": "折叠聊天面板",
  "Context added:": "已添加上下文：",
  "Select text and click": "选择文本并点击",
  "Add to Chat": "添加到聊天",
  "to give the model context, or just ask a question.": "为模型提供上下文，或直接提问。",
  "Ask a question...": "输入问题...",
  "Abstract": "摘要",
  "Authors": "作者",
  "Key Claims": "关键论点",
  "Methodology": "方法",
  "Limitations": "局限",
  "Open Chat": "打开聊天",
  "AI Extraction": "AI 抽取",
  "Extraction failed": "抽取失败",

  "Global Knowledge Graph": "全局知识图谱",
  "Knowledge Graph Explorer": "知识图谱浏览器",
  "Entity Search": "实体搜索",
  "Graph Controls": "图谱控制",
  "No graph data": "没有图谱数据",
  "Open Article": "打开文章",
  "Show labels": "显示标签",
  "Hide labels": "隐藏标签",
  "Reset view": "重置视图",

  "Processing Logs": "处理日志",
  "Job Queue": "任务队列",
  "Recent Activity": "最近活动",
  "No jobs found": "未找到任务",
  "Retry failed jobs": "重试失败任务",
  "Token Usage": "Token 用量",
  "Prompt Tokens": "提示词 Token",
  "Completion Tokens": "补全 Token",

  "System Settings": "系统设置",
  "General settings saved": "通用设置已保存",
  "Settings load failed": "设置加载失败",
  "AI Providers": "AI 提供商",
  "Add Provider": "添加提供商",
  "My Provider": "我的提供商",
  "Base URL": "基础 URL",
  Model: "模型",
  Provider: "提供商",
  "Active Provider": "当前提供商",
  "System Prompts": "系统提示词",
  "Per-task system prompts that define the AI's persona and behavior rules.": "定义 AI 角色和行为规则的分任务系统提示词。",
  "Per-task system prompts that define the AI&apos;s persona and behavior rules.": "定义 AI 角色和行为规则的分任务系统提示词。",
  "PDF Parser Priority": "PDF 解析器优先级",
  "Choose which parser to use for PDF documents.": "选择用于 PDF 文档的解析器。",
  Limits: "限制",
  Server: "服务器",
  Host: "主机",
  Port: "端口",
  "Import / Export": "导入 / 导出",
  "Export or import settings + articles as JSON.": "以 JSON 导出或导入设置和文章。",
  "Settings imported — reloading page...": "设置已导入，正在重新加载页面...",

  "Create Skill": "创建技能",
  "Edit:": "编辑：",
  Name: "名称",
  Purpose: "用途",
  Description: "描述",
  "Prompt Instructions": "提示词说明",
  "Output Schema": "输出结构",
  "my_custom_skill": "my_custom_skill",
  "Extract custom info": "抽取自定义信息",
  "What this skill does...": "这个技能的作用...",
  "1. Extract X...\n2. List Y...": "1. 抽取 X...\n2. 列出 Y...",
  Save: "保存",
  "Name is required": "名称为必填项",
  "Invalid JSON in output schema": "输出结构中的 JSON 无效",
  "Save failed": "保存失败",
  "Delete failed": "删除失败",
};

const UI_REVERSE_TRANSLATIONS = Object.fromEntries(
  Object.entries(UI_TRANSLATIONS).map(([english, chinese]) => [chinese, english])
);

const PROMPT_TEMPLATES = {
  contextDefault: {
    en: () => "Tell me about this",
    zh: () => "请介绍这段内容",
  },
  authors: {
    en: () => "Tell me about the authors of this paper",
    zh: () => "请介绍这篇论文的作者",
  },
  claim: {
    en: ({ claim } = {}) => `Tell me more about this claim: ${claim || ""}`.trim(),
    zh: ({ claim } = {}) => `请进一步说明这个论点：${claim || ""}`.trim(),
  },
  section: {
    en: ({ section } = {}) => `Tell me about the ${String(section || "").toLowerCase()} of this paper`,
    zh: ({ section } = {}) => `请介绍这篇论文的${section || "内容"}`,
  },
};

export function normalizeLanguage(value) {
  return SUPPORTED_LANGUAGES.has(value) ? value : DEFAULT_LANGUAGE;
}

export function resolveInitialLanguage({ storedLanguage, browserLanguage } = {}) {
  if (SUPPORTED_LANGUAGES.has(storedLanguage)) return storedLanguage;
  if (typeof browserLanguage === "string" && browserLanguage.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return DEFAULT_LANGUAGE;
}

export function getShellCopy(language) {
  return SHELL_COPY[normalizeLanguage(language)];
}

export function getLanguageButtonLabel(language) {
  return normalizeLanguage(language) === "zh" ? "中" : "ENG";
}

export function getPromptText(key, language, params = {}) {
  const normalized = normalizeLanguage(language);
  const template = PROMPT_TEMPLATES[key]?.[normalized] || PROMPT_TEMPLATES[key]?.en;
  return template ? template(params) : "";
}

export function formatProcessingCount(count, language) {
  return normalizeLanguage(language) === "zh" ? `${count} ${SHELL_COPY.zh.processing}` : `${count} ${SHELL_COPY.en.processing}`;
}

function translateDynamicText(text, language) {
  const normalized = normalizeLanguage(language);
  if (normalized === "zh") {
    let match = text.match(/^(\d+) articles$/);
    if (match) return `${match[1]} 篇文章`;
    match = text.match(/^(\d+) article\(s\) tagged$/);
    if (match) return `已标记 ${match[1]} 篇文章`;
    match = text.match(/^No results found for “(.+)”$/);
    if (match) return `未找到“${match[1]}”的结果`;
    match = text.match(/^ID (.+) does not exist\.$/);
    if (match) return `ID ${match[1]} 不存在。`;
    match = text.match(/^Switched to (.+)$/);
    if (match) return `已切换到 ${match[1]}`;
    match = text.match(/^(.+) processing$/);
    if (match) return `${match[1]} 个处理中`;
    match = text.match(/^~(.+) tokens$/);
    if (match) return `约 ${match[1]} tokens`;
    return null;
  }

  let match = text.match(/^(\d+) 篇文章$/);
  if (match) return `${match[1]} articles`;
  match = text.match(/^已标记 (\d+) 篇文章$/);
  if (match) return `${match[1]} article(s) tagged`;
  match = text.match(/^未找到“(.+)”的结果$/);
  if (match) return `No results found for “${match[1]}”`;
  match = text.match(/^ID (.+) 不存在。$/);
  if (match) return `ID ${match[1]} does not exist.`;
  match = text.match(/^已切换到 (.+)$/);
  if (match) return `Switched to ${match[1]}`;
  match = text.match(/^(.+) 个处理中$/);
  if (match) return `${match[1]} processing`;
  match = text.match(/^约 (.+) tokens$/);
  if (match) return `~${match[1]} tokens`;
  return null;
}

export function translateUiText(value, language) {
  if (value == null) return value;
  const raw = String(value);
  if (!raw.trim()) return raw;

  const leading = raw.match(/^\s*/)?.[0] || "";
  const trailing = raw.match(/\s*$/)?.[0] || "";
  const text = raw.slice(leading.length, raw.length - trailing.length);
  const normalized = normalizeLanguage(language);

  if (normalized === "zh") {
    const translated = UI_TRANSLATIONS[text] || translateDynamicText(text, normalized);
    return translated ? `${leading}${translated}${trailing}` : raw;
  }

  const translated = UI_REVERSE_TRANSLATIONS[text] || translateDynamicText(text, normalized);
  return translated ? `${leading}${translated}${trailing}` : raw;
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim()) return true;
  return Boolean(parent.closest("script, style, code, pre, textarea, svg, canvas, .prose, [data-no-translate], [data-i18n-skip], [contenteditable='true']"));
}

function translateElementAttributes(element, language) {
  if (element.closest("[data-no-translate], [data-i18n-skip]")) return;
  for (const attribute of TRANSLATABLE_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (!value) continue;
    const translated = translateUiText(value, language);
    if (translated !== value) element.setAttribute(attribute, translated);
  }
}

export function applyLanguageToDocument(language, root = globalThis.document?.body) {
  if (!root || !globalThis.document) return;

  const normalized = normalizeLanguage(language);
  globalThis.document.documentElement.lang = normalized === "zh" ? "zh-CN" : "en";
  globalThis.document.documentElement.dataset.language = normalized;

  const walker = globalThis.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    if (shouldSkipTextNode(node)) continue;
    const current = node.nodeValue || "";
    const translated = translateUiText(current, normalized);
    if (translated !== current) node.nodeValue = translated;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(root, normalized);
    for (const element of root.querySelectorAll("*")) {
      translateElementAttributes(element, normalized);
    }
  }
}
