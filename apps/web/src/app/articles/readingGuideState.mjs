import { getPromptText, translateUiText } from "../../lib/languageState.mjs";

const CONCEPT_EXCLUDE_TYPES = new Set(["Article", "Author", "Institution", "Citation"]);

const READ_FIRST_FIELDS = [
  ["Abstract", "abstract", "Start here for the shortest overview."],
  ["Research Problem", "research_problem", "Understand the gap before reading the solution."],
  ["Methodology", "methodology", "Read this before judging the results."],
  ["Results", "results", "Check the main evidence and outcomes."],
  ["Limitations", "limitations", "Use this to calibrate confidence."],
  ["Future Work", "future_work", "See where the work points next."],
];

function text(value) {
  return String(value ?? "").trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function ui(value, language) {
  return translateUiText(value, language);
}

function prompt(key, language, params = {}, fallback = "") {
  return getPromptText(key, language, params) || fallback;
}

function numberId(value) {
  const id = Number(value);
  return Number.isFinite(id) ? id : null;
}

function uniqueIds(values) {
  const seen = new Set();
  const ids = [];
  for (const value of values) {
    const id = numberId(value);
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function claimText(claim) {
  if (typeof claim === "string") return text(claim);
  if (!claim || typeof claim !== "object") return "";
  return text(claim.claim || claim.text || claim.content || claim.description);
}

function addConcept(target, concept, seen) {
  if (!concept || typeof concept !== "object") return;
  const name = text(concept.name || concept.canonical_name || concept.label || concept.title);
  if (!name) return;
  const type = text(concept.type || "Keyword") || "Keyword";
  if (CONCEPT_EXCLUDE_TYPES.has(type)) return;
  const key = name.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  target.push({
    name,
    type,
    confidence: Number.isFinite(Number(concept.confidence)) ? Number(concept.confidence) : 0,
  });
}

function createConcepts(extraction, graph) {
  const concepts = [];
  const seen = new Set();
  for (const concept of asArray(extraction?.graph_entities)) {
    addConcept(concepts, concept, seen);
  }
  for (const concept of asArray(graph?.entities)) {
    addConcept(concepts, concept, seen);
  }
  return concepts
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 8);
}

function createReadFirst(extraction, language) {
  return READ_FIRST_FIELDS
    .map(([title, field, reason]) => ({
      title: ui(title, language),
      field,
      reason: ui(reason, language),
      text: text(extraction?.[field]),
      prompt: prompt(
        "readingSection",
        language,
        { section: title },
        `Walk me through the ${String(title).toLowerCase()} section.`,
      ),
    }))
    .filter((section) => section.text)
    .slice(0, 4);
}

function createQuestions(extraction, language) {
  const questions = [];
  if (text(extraction?.research_problem)) {
    questions.push({
      label: ui("Problem", language),
      text: prompt("readingProblem", language, {}, "What problem does this article solve?"),
    });
  }
  if (text(extraction?.methodology)) {
    questions.push({
      label: ui("Method", language),
      text: prompt("readingMethodPlain", language, {}, "Explain the methodology in plain language."),
    });
  }
  if (text(extraction?.results)) {
    questions.push({
      label: ui("Results", language),
      text: prompt("readingResults", language, {}, "What are the most important results?"),
    });
  }
  if (text(extraction?.limitations)) {
    questions.push({
      label: ui("Limits", language),
      text: prompt("readingLimitations", language, {}, "What limitations should I keep in mind?"),
    });
  }
  return questions;
}

/**
 * @param {{
 *   articleTitle?: string,
 *   extraction?: Record<string, any> | null,
 *   graph?: { entities?: any[] } | null,
 *   hasMarkdown?: boolean,
 *   language?: string,
 * }} input
 * @returns {any}
 */
export function createArticleReadingGuide({
  articleTitle = "Untitled article",
  extraction = null,
  graph = null,
  hasMarkdown = true,
  language = "en",
} = {}) {
  const title = text(articleTitle) || ui("Untitled article", language);
  if (!extraction || typeof extraction !== "object") {
    const mode = hasMarkdown ? "extract_only" : "full";
    return {
      status: "missing_extraction",
      title,
      detail: ui("Run AI extraction to build a reading guide for this article.", language),
      actions: [{ id: "run_extraction", label: ui("Run extraction", language), mode }],
    };
  }

  return {
    status: "ready",
    title,
    tldr: text(extraction.abstract || extraction.background || extraction.research_problem),
    contribution: text(extraction.research_problem || extraction.background),
    method: text(extraction.methodology),
    results: text(extraction.results),
    limitations: text(extraction.limitations),
    claims: asArray(extraction.key_claims).map(claimText).filter(Boolean).slice(0, 2),
    concepts: createConcepts(extraction, graph),
    readFirst: createReadFirst(extraction, language),
    questions: createQuestions(extraction, language),
  };
}

function relatedTitle(item) {
  return text(item?.title || item?.original_filename || `Article #${item?.id ?? ""}`) || "Untitled article";
}

function relatedReason(item, language) {
  const shared = asArray(item?.shared_entities).map(text).filter(Boolean);
  if (shared.length > 0) return `${ui("Shared concepts:", language)} ${shared.slice(0, 3).join(", ")}`;
  const similarity = Number(item?.similarity);
  return Number.isFinite(similarity)
    ? `${ui("Similarity:", language)} ${Math.round(similarity * 100)}%`
    : ui("Related by extracted concepts", language);
}

/**
 * @param {{
 *   articleId?: number,
 *   articleTitle?: string,
 *   related?: Array<Record<string, any>>,
 *   language?: string,
 * }} input
 * @returns {any}
 */
export function createLibraryReadingGuide({
  articleId,
  articleTitle = "this article",
  related = [],
  language = "en",
} = {}) {
  const sorted = asArray(related)
    .slice()
    .sort((a, b) => Number(b?.similarity || 0) - Number(a?.similarity || 0));

  if (sorted.length === 0) {
    return {
      status: "empty",
      title: ui("No read-next suggestions yet", language),
      detail: ui("Process more articles to discover shared concepts and comparison paths.", language),
      readNext: [],
      comparePrompt: "",
      compareArticleIds: [],
    };
  }

  const readNext = sorted.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    articleId: Number(item.id),
    title: relatedTitle(item),
    similarity: Number(item.similarity || 0),
    sharedEntities: asArray(item.shared_entities).map(text).filter(Boolean),
    reason: relatedReason(item, language),
  }));

  const compareTitles = readNext.slice(0, 3).map((item) => item.title);
  const compareArticleIds = uniqueIds([articleId, ...readNext.slice(0, 3).map((item) => item.articleId)]);
  return {
    status: "ready",
    readNext,
    comparePrompt: prompt(
      "readingCompare",
      language,
      { articleTitle: text(articleTitle) || ui("this article", language), compareTitles },
      `Compare ${text(articleTitle) || "this article"} with ${compareTitles.join(" and ")}. Focus on shared concepts, methods, results, and limitations.`,
    ),
    compareArticleIds,
  };
}
