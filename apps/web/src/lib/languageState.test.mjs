import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LANGUAGE,
  getAvailableLanguages,
  getLanguageButtonLabel,
  getLanguageDictionary,
  getPromptText,
  getPromptWrapperLabels,
  getShellCopy,
  normalizeLanguage,
  resolveInitialLanguage,
  translateUiText,
} from "./languageState.mjs";

const REQUIRED_TRANSLATED_UI_STRINGS = [
  "Upload Your First Paper",
  "Ask anything... Tag articles with @",
  "Articles",
  "All Status",
  "Newest first",
  "Delete Permanently",
  "This permanently deletes all selected articles and their data. This cannot be undone.",
  "Archived",
  "Drag and drop documents to upload.",
  "New workspace",
  "Turn your first article into something you can explore",
  "Upload your first article",
  "Review AI setup",
  "Your first result in three steps",
  "Add your first source",
  "Let local AI organize it",
  "Read, ask, and explore",
  "Local processing is ready",
  "Local API needs attention",
  "Retry connection",
  "Browse Files",
  "Browse files to upload",
  "Analysis mode",
  "Deep Analysis",
  "Extraction, graph, and a comprehensive report",
  "Quick Read",
  "Full extraction and graph (default)",
  "Parse Only",
  "Convert to readable markdown, no AI",
  "Import from URL",
  "Paste an arXiv, OpenReview, DOI, scholarly page, or direct PDF link",
  "Checking local backend",
  "Checking local API",
  "Local API unavailable",
  "Start the local API, then retry the connection before choosing a source.",
  "Source controls will be ready as soon as the local processing service responds.",
  "Connection failed. Start the local API, then retry.",
  "AI readiness cannot be checked until the local API reconnects.",
  "AI pipeline",
  "Upload queue",
  "Queue checked — no active uploads to restore.",
  "Processing setup",
  "Review connection, AI, and restored queue details.",
  "Configure provider",
  "Upload another",
  "Clear finished",
  "Open reading guide",
  "Open article",
  "Ready for review",
  "Parsing document…",
  "Generating deep analysis report…",
  "Papers, articles",
  "Archive of PDFs/HTML/MD",
  "Web pages",
  ".md files",
  "No articles found",
  "Add one in Settings →",
  "Clear all",
  "Start a conversation",
  "Upload articles to start chatting",
  "Use a starter or ask your own question. Tag articles with @ for focused context.",
  "What are the main themes across my library?",
  "Summarize the tagged articles.",
  "Processing Logs",
  "No processing jobs found.",
  "Upload an article to see logs here.",
  "Job Queue",
  "Steps",
  "Token Usage",
  "Knowledge Graph",
  "No graph data yet",
  "No nodes match the selected filters",
  "Try enabling more entity types to see results.",
  "Entity types:",
  "| Drag to pan · Scroll to zoom · Click node for article summary",
  "Analytics and metrics for your article processing pipeline.",
  "Avg Process Time",
  "New articles uploaded per day",
  "Prompt vs completion tokens",
  "Most chatted articles by token count",
  "Processing failed",
  "No parsed markdown.",
  "AI extraction returned no summary",
  "Loading skills...",
  "Sources:",
  "No processing jobs yet.",
  "Entities",
  "Links",
  "Loading related articles...",
  "No related articles found. Process more articles to discover connections.",
  "Year",
  "Venue",
  "Providers",
  "System Msgs",
  "Templates",
  "Model Params",
  "LLM Providers",
  "Set Active",
  "Delete Provider",
  "Provider Type",
  "New API Key",
  "Add LLM Provider",
  "What should this provider be called?",
  "What API key should it use?",
  "Presets:",
  "Max Tokens",
  "Installed Parsers",
  "Click \"refresh\" to load installed parsers…",
  "Export",
  "Import",
  "Manage Skills",
  "Purpose (short label)",
  "Output Schema (JSON)",
];

test("language state defaults to English and rejects unsupported values", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(normalizeLanguage("zh"), "zh");
  assert.equal(normalizeLanguage("en"), "en");
  assert.equal(normalizeLanguage("fr"), DEFAULT_LANGUAGE);
  assert.equal(normalizeLanguage(null), DEFAULT_LANGUAGE);
});

test("languages are registered through per-language dictionary files", () => {
  assert.deepEqual(getAvailableLanguages().sort(), ["en", "zh"]);
  assert.equal(getLanguageDictionary("en").ui["Upload Your First Paper"], "Upload Your First Paper");
  assert.equal(getLanguageDictionary("zh").ui["Upload Your First Paper"], "上传第一篇论文");
  assert.equal(getLanguageDictionary("fr").code, "en");
});

test("English and Chinese dictionaries cover the same UI keys", () => {
  const englishKeys = Object.keys(getLanguageDictionary("en").ui).sort();
  const chineseKeys = Object.keys(getLanguageDictionary("zh").ui).sort();
  assert.deepEqual(chineseKeys, englishKeys);
});

test("language shell copy provides English and Chinese labels", () => {
  assert.deepEqual(getShellCopy("en").nav, {
    home: "Home",
    library: "Library",
    upload: "Upload",
    chat: "Chat",
    jobs: "Jobs",
    graph: "Graph",
    dashboard: "Dashboard",
  });

  assert.deepEqual(getShellCopy("zh").nav, {
    home: "首页",
    library: "文库",
    upload: "上传",
    chat: "聊天",
    jobs: "任务",
    graph: "图谱",
    dashboard: "仪表盘",
  });
  assert.equal(getShellCopy("zh").settings, "设置");
  assert.equal(getShellCopy("zh").toggleToChinese, "切换到中文");
  assert.equal(getShellCopy("zh").toggleToEnglish, "切换到英文");
});

test("language toggle button uses compact language labels", () => {
  assert.equal(getLanguageButtonLabel("en"), "ENG");
  assert.equal(getLanguageButtonLabel("zh"), "中");
});

test("language state translates page copy, placeholders, and reverses to English", () => {
  assert.equal(translateUiText("Upload Your First Paper", "zh"), "上传第一篇论文");
  assert.equal(translateUiText("  Upload Your First Paper  ", "zh"), "  上传第一篇论文  ");
  assert.equal(translateUiText("Ask anything... Tag articles with @", "zh"), "随便提问... 使用 @ 标记文章");
  assert.equal(translateUiText("上传第一篇论文", "en"), "Upload Your First Paper");
});

test("language state covers common page-level UI strings", () => {
  for (const value of REQUIRED_TRANSLATED_UI_STRINGS) {
    assert.notEqual(translateUiText(value, "zh"), value, value);
  }
});

test("language state translates dynamic UI text", () => {
  assert.equal(translateUiText("3 articles", "zh"), "3 篇文章");
  assert.equal(translateUiText("2 article(s) tagged", "zh"), "已标记 2 篇文章");
  assert.equal(translateUiText("No results found for “graph”", "zh"), "未找到“graph”的结果");
  assert.equal(translateUiText("ID 42 does not exist.", "zh"), "ID 42 不存在。");
  assert.equal(translateUiText("2/3 ready", "zh"), "2/3 已就绪");
  assert.equal(translateUiText("1 active upload restored.", "zh"), "已恢复 1 个进行中的上传。");
  assert.equal(translateUiText("Processing 2 files", "zh"), "正在处理 2 个文件");
  assert.equal(translateUiText("1 article ready", "zh"), "1 篇文章已就绪");
  assert.equal(translateUiText("2 articles ready · 1 upload needs attention", "zh"), "2 篇文章已就绪 · 1 个上传需要处理");
  assert.equal(translateUiText("2 uploads need attention", "zh"), "2 个上传需要处理");
  assert.equal(translateUiText("Ready with local-model", "zh"), "已就绪：local-model");
  assert.equal(translateUiText("~128 tokens", "zh"), "约 128 tokens");
  assert.equal(translateUiText("步骤：parse", "en"), "Step: parse");
  assert.equal(translateUiText("2/3 已就绪", "en"), "2/3 ready");
  assert.equal(translateUiText("1 篇文章已就绪", "en"), "1 article ready");
  assert.equal(translateUiText("2 个上传需要处理", "en"), "2 uploads need attention");
});

test("language state translates generated prompts and prompt wrappers", () => {
  assert.equal(getPromptText("authors", "en"), "Tell me about the authors of this paper");
  assert.equal(getPromptText("authors", "zh"), "请介绍这篇论文的作者");
  assert.equal(
    getPromptText("claim", "zh", { claim: "Transformers improve retrieval" }),
    "请进一步说明这个论点：Transformers improve retrieval"
  );
  assert.equal(getPromptText("section", "zh", { section: "Methodology" }), "请介绍这篇论文的方法");
  assert.deepEqual(getPromptWrapperLabels("zh"), {
    selectedContext: "[用户选择的上下文]",
    question: "[问题]",
  });
});

test("language state resolves stored preference before browser language", () => {
  assert.equal(resolveInitialLanguage({ storedLanguage: "zh", browserLanguage: "en-US" }), "zh");
  assert.equal(resolveInitialLanguage({ storedLanguage: "", browserLanguage: "zh-CN" }), "zh");
  assert.equal(resolveInitialLanguage({ storedLanguage: "fr", browserLanguage: "en-US" }), "en");
  assert.equal(resolveInitialLanguage({ storedLanguage: "", browserLanguage: "" }), "en");
});
