import en from "./i18n/en.mjs";
import zh from "./i18n/zh.mjs";

export const DEFAULT_LANGUAGE = "en";
export const LANGUAGE_STORAGE_KEY = "article-processor-language";

const LANGUAGE_DICTIONARIES = {
  en,
  zh,
};
const TRANSLATABLE_ATTRIBUTES = ["aria-label", "placeholder", "title"];

function getDictionary(language) {
  return LANGUAGE_DICTIONARIES[normalizeLanguage(language)] || LANGUAGE_DICTIONARIES[DEFAULT_LANGUAGE];
}

function normalizeText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function createReverseUiMap() {
  const entries = [];
  for (const [language, dictionary] of Object.entries(LANGUAGE_DICTIONARIES)) {
    if (language === DEFAULT_LANGUAGE) continue;
    for (const [english, translated] of Object.entries(dictionary.ui || {})) {
      entries.push([translated, english]);
      entries.push([normalizeText(translated), english]);
    }
  }
  return new Map(entries);
}

const UI_REVERSE_TRANSLATIONS = createReverseUiMap();

export function getAvailableLanguages() {
  return Object.keys(LANGUAGE_DICTIONARIES);
}

export function getLanguageDictionary(language) {
  return getDictionary(language);
}

export function normalizeLanguage(value) {
  return Object.prototype.hasOwnProperty.call(LANGUAGE_DICTIONARIES, value) ? value : DEFAULT_LANGUAGE;
}

export function resolveInitialLanguage({ storedLanguage, browserLanguage } = {}) {
  if (Object.prototype.hasOwnProperty.call(LANGUAGE_DICTIONARIES, storedLanguage)) return storedLanguage;
  if (typeof browserLanguage === "string" && browserLanguage.toLowerCase().startsWith("zh")) {
    return "zh";
  }
  return DEFAULT_LANGUAGE;
}

export function getShellCopy(language) {
  return getDictionary(language).shell;
}

export function getLanguageButtonLabel(language) {
  return getDictionary(language).buttonLabel;
}

export function getPromptText(key, language, params = {}) {
  const dictionary = getDictionary(language);
  const template = dictionary.prompts?.[key] || LANGUAGE_DICTIONARIES[DEFAULT_LANGUAGE].prompts?.[key];
  return template ? template(params) : "";
}

export function getPromptWrapperLabels(language) {
  return getDictionary(language).promptWrappers || LANGUAGE_DICTIONARIES[DEFAULT_LANGUAGE].promptWrappers;
}

export function formatProcessingCount(count, language) {
  return normalizeLanguage(language) === "zh"
    ? `${count} ${getShellCopy("zh").processing}`
    : `${count} ${getShellCopy("en").processing}`;
}

function translateDynamicText(text, language) {
  const normalized = normalizeLanguage(language);
  if (normalized === "zh") {
    let match = text.match(/^(\d+) articles$/);
    if (match) return `${match[1]} 篇文章`;
    match = text.match(/^(\d+) article\(s\) tagged$/);
    if (match) return `已标记 ${match[1]} 篇文章`;
    match = text.match(/^No results found for ["“](.+)["”]$/);
    if (match) return `未找到“${match[1]}”的结果`;
    match = text.match(/^ID (.+) does not exist\.$/);
    if (match) return `ID ${match[1]} 不存在。`;
    match = text.match(/^Switched to (.+)$/);
    if (match) return `已切换到 ${match[1]}`;
    match = text.match(/^(.+) processing$/);
    if (match) return `${match[1]} 个处理中`;
    match = text.match(/^(\d+)\/(\d+) ready$/);
    if (match) return `${match[1]}/${match[2]} 已就绪`;
    match = text.match(/^(\d+) active uploads? restored\.$/);
    if (match) return `已恢复 ${match[1]} 个进行中的上传。`;
    match = text.match(/^Processing (\d+) files?$/);
    if (match) return `正在处理 ${match[1]} 个文件`;
    match = text.match(/^(\d+) articles? ready$/);
    if (match) return `${match[1]} 篇文章已就绪`;
    match = text.match(/^(\d+) articles? ready · (\d+) uploads? needs? attention$/);
    if (match) return `${match[1]} 篇文章已就绪 · ${match[2]} 个上传需要处理`;
    match = text.match(/^(\d+) uploads? needs? attention$/);
    if (match) return `${match[1]} 个上传需要处理`;
    match = text.match(/^Ready with (.+)$/);
    if (match) return `已就绪：${match[1]}`;
    match = text.match(/^~(.+) tokens$/);
    if (match) return `约 ${match[1]} tokens`;
    match = text.match(/^Step: (.+)$/);
    if (match) return `步骤：${match[1]}`;
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
  match = text.match(/^(\d+)\/(\d+) 已就绪$/);
  if (match) return `${match[1]}/${match[2]} ready`;
  match = text.match(/^已恢复 (\d+) 个进行中的上传。$/);
  if (match) return `${match[1]} active upload${match[1] === "1" ? "" : "s"} restored.`;
  match = text.match(/^正在处理 (\d+) 个文件$/);
  if (match) return `Processing ${match[1]} file${match[1] === "1" ? "" : "s"}`;
  match = text.match(/^(\d+) 篇文章已就绪 · (\d+) 个上传需要处理$/);
  if (match) return `${match[1]} article${match[1] === "1" ? "" : "s"} ready · ${match[2]} upload${match[2] === "1" ? " needs" : "s need"} attention`;
  match = text.match(/^(\d+) 篇文章已就绪$/);
  if (match) return `${match[1]} article${match[1] === "1" ? "" : "s"} ready`;
  match = text.match(/^(\d+) 个上传需要处理$/);
  if (match) return `${match[1]} upload${match[1] === "1" ? " needs" : "s need"} attention`;
  match = text.match(/^已就绪：(.+)$/);
  if (match) return `Ready with ${match[1]}`;
  match = text.match(/^约 (.+) tokens$/);
  if (match) return `~${match[1]} tokens`;
  match = text.match(/^步骤：(.+)$/);
  if (match) return `Step: ${match[1]}`;
  return null;
}

export function translateUiText(value, language) {
  if (value == null) return value;
  const raw = String(value);
  if (!raw.trim()) return raw;

  const leading = raw.match(/^\s*/)?.[0] || "";
  const trailing = raw.match(/\s*$/)?.[0] || "";
  const text = raw.slice(leading.length, raw.length - trailing.length);
  const normalizedText = normalizeText(text);
  const normalizedLanguage = normalizeLanguage(language);

  if (normalizedLanguage === DEFAULT_LANGUAGE) {
    const translated =
      UI_REVERSE_TRANSLATIONS.get(text) ||
      UI_REVERSE_TRANSLATIONS.get(normalizedText) ||
      translateDynamicText(text, normalizedLanguage) ||
      translateDynamicText(normalizedText, normalizedLanguage);
    return translated ? `${leading}${translated}${trailing}` : raw;
  }

  const dictionary = getDictionary(normalizedLanguage);
  const translated =
    dictionary.ui?.[text] ||
    dictionary.ui?.[normalizedText] ||
    translateDynamicText(text, normalizedLanguage) ||
    translateDynamicText(normalizedText, normalizedLanguage);
  return translated ? `${leading}${translated}${trailing}` : raw;
}

function shouldSkipTextNode(node) {
  const parent = node.parentElement;
  if (!parent || !node.nodeValue?.trim()) return true;
  return Boolean(
    parent.closest(
      "script, style, code, pre, textarea, svg, canvas, .prose, [data-no-translate], [data-i18n-skip], [contenteditable='true']"
    )
  );
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

  const dictionary = getDictionary(language);
  globalThis.document.documentElement.lang = dictionary.htmlLang;
  globalThis.document.documentElement.dataset.language = dictionary.code;

  const walker = globalThis.document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  for (const node of textNodes) {
    if (shouldSkipTextNode(node)) continue;
    const current = node.nodeValue || "";
    const translated = translateUiText(current, dictionary.code);
    if (translated !== current) node.nodeValue = translated;
  }

  if (root.nodeType === Node.ELEMENT_NODE) {
    translateElementAttributes(root, dictionary.code);
    for (const element of root.querySelectorAll("*")) {
      translateElementAttributes(element, dictionary.code);
    }
  }
}
