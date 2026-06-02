import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_LANGUAGE,
  getLanguageButtonLabel,
  getShellCopy,
  getPromptText,
  normalizeLanguage,
  resolveInitialLanguage,
  translateUiText,
} from "./languageState.mjs";

test("language state defaults to English and rejects unsupported values", () => {
  assert.equal(DEFAULT_LANGUAGE, "en");
  assert.equal(normalizeLanguage("zh"), "zh");
  assert.equal(normalizeLanguage("en"), "en");
  assert.equal(normalizeLanguage("fr"), DEFAULT_LANGUAGE);
  assert.equal(normalizeLanguage(null), DEFAULT_LANGUAGE);
});

test("language shell copy provides English and Chinese labels", () => {
  assert.deepEqual(getShellCopy("en").nav, {
    home: "Home",
    library: "Library",
    upload: "Upload",
    chat: "Chat",
    graph: "Graph",
    dashboard: "Dashboard",
  });

  assert.deepEqual(getShellCopy("zh").nav, {
    home: "首页",
    library: "文库",
    upload: "上传",
    chat: "聊天",
    graph: "图谱",
    dashboard: "仪表盘",
  });
  assert.equal(getShellCopy("zh").settings, "设置");
  assert.equal(getShellCopy("zh").toggleToChinese, "切换到中文");
  assert.equal(getShellCopy("zh").toggleToEnglish, "Switch to English");
});

test("language toggle button uses compact language labels", () => {
  assert.equal(getLanguageButtonLabel("en"), "ENG");
  assert.equal(getLanguageButtonLabel("zh"), "中");
});

test("language state translates page copy and placeholders", () => {
  assert.equal(translateUiText("Upload Your First Paper", "zh"), "上传第一篇论文");
  assert.equal(translateUiText("Ask anything... Tag articles with @", "zh"), "随便提问... 使用 @ 标记文章");
  assert.equal(translateUiText("上传第一篇论文", "en"), "Upload Your First Paper");
});

test("language state translates generated prompts", () => {
  assert.equal(getPromptText("authors", "en"), "Tell me about the authors of this paper");
  assert.equal(getPromptText("authors", "zh"), "请介绍这篇论文的作者");
  assert.equal(
    getPromptText("claim", "zh", { claim: "Transformers improve retrieval" }),
    "请进一步说明这个论点：Transformers improve retrieval"
  );
  assert.equal(
    getPromptText("section", "zh", { section: "Methodology" }),
    "请介绍这篇论文的Methodology"
  );
});

test("language state resolves stored preference before browser language", () => {
  assert.equal(resolveInitialLanguage({ storedLanguage: "zh", browserLanguage: "en-US" }), "zh");
  assert.equal(resolveInitialLanguage({ storedLanguage: "", browserLanguage: "zh-CN" }), "zh");
  assert.equal(resolveInitialLanguage({ storedLanguage: "fr", browserLanguage: "en-US" }), "en");
  assert.equal(resolveInitialLanguage({ storedLanguage: "", browserLanguage: "" }), "en");
});
