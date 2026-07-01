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

function createReadFirst(extraction) {
  return READ_FIRST_FIELDS
    .map(([title, field, reason]) => ({
      title,
      field,
      reason,
      text: text(extraction?.[field]),
    }))
    .filter((section) => section.text)
    .slice(0, 4);
}

function createQuestions(extraction) {
  const questions = [];
  if (text(extraction?.research_problem)) {
    questions.push({
      label: "Problem",
      text: "What problem does this article solve?",
    });
  }
  if (text(extraction?.methodology)) {
    questions.push({
      label: "Method",
      text: "Explain the methodology in plain language.",
    });
  }
  if (text(extraction?.results)) {
    questions.push({
      label: "Results",
      text: "What are the most important results?",
    });
  }
  if (text(extraction?.limitations)) {
    questions.push({
      label: "Limits",
      text: "What limitations should I keep in mind?",
    });
  }
  return questions;
}

export function createArticleReadingGuide({
  articleTitle = "Untitled article",
  extraction = null,
  graph = null,
} = {}) {
  const title = text(articleTitle) || "Untitled article";
  if (!extraction || typeof extraction !== "object") {
    return {
      status: "missing_extraction",
      title,
      detail: "Run AI extraction to build a reading guide for this article.",
      actions: [{ id: "run_extraction", label: "Run extraction", mode: "extract_only" }],
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
    readFirst: createReadFirst(extraction),
    questions: createQuestions(extraction),
  };
}

function relatedTitle(item) {
  return text(item?.title || item?.original_filename || `Article #${item?.id ?? ""}`) || "Untitled article";
}

function relatedReason(item) {
  const shared = asArray(item?.shared_entities).map(text).filter(Boolean);
  if (shared.length > 0) return `Shared concepts: ${shared.slice(0, 3).join(", ")}`;
  const similarity = Number(item?.similarity);
  return Number.isFinite(similarity) ? `Similarity: ${Math.round(similarity * 100)}%` : "Related by extracted concepts";
}

export function createLibraryReadingGuide({
  articleTitle = "this article",
  related = [],
} = {}) {
  const sorted = asArray(related)
    .slice()
    .sort((a, b) => Number(b?.similarity || 0) - Number(a?.similarity || 0));

  if (sorted.length === 0) {
    return {
      status: "empty",
      title: "No read-next suggestions yet",
      detail: "Process more articles to discover shared concepts and comparison paths.",
      readNext: [],
      comparePrompt: "",
    };
  }

  const readNext = sorted.slice(0, 5).map((item, index) => ({
    rank: index + 1,
    articleId: Number(item.id),
    title: relatedTitle(item),
    similarity: Number(item.similarity || 0),
    sharedEntities: asArray(item.shared_entities).map(text).filter(Boolean),
    reason: relatedReason(item),
  }));

  const compareTitles = readNext.slice(0, 3).map((item) => item.title);
  return {
    status: "ready",
    readNext,
    comparePrompt: `Compare ${text(articleTitle) || "this article"} with ${compareTitles.join(" and ")}. Focus on shared concepts, methods, results, and limitations.`,
  };
}
