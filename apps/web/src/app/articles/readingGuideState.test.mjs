import assert from "node:assert/strict";
import test from "node:test";

import {
  createArticleReadingGuide,
  createLibraryReadingGuide,
} from "./readingGuideState.mjs";

const extraction = {
  abstract: "This paper studies retrieval augmented generation for long technical documents.",
  research_problem: "Readers struggle to find reliable source-backed answers in long articles.",
  methodology: "The system chunks documents, retrieves relevant passages, and asks an LLM to answer with citations.",
  results: "Cited answers improved answer traceability in the evaluation.",
  limitations: "The retrieval layer still depends on lexical overlap.",
  key_claims: [
    { claim: "Source-linked answers make article Q&A easier to verify." },
    { claim: "Section-aware chunks improve navigation back to evidence." },
    { claim: "A compact guide reduces first-read friction." },
  ],
  graph_entities: [
    { type: "Method", name: "Retrieval augmented generation", confidence: 0.94 },
    { type: "Dataset", name: "Long technical documents", confidence: 0.82 },
  ],
};

const graph = {
  entities: [
    { type: "Method", name: "Hybrid retrieval", confidence: 0.91 },
    { type: "Keyword", name: "Citations", confidence: 0.8 },
    { type: "Author", name: "A. Researcher", confidence: 0.99 },
  ],
};

test("article reading guide derives a practical brief from extraction and graph data", () => {
  const guide = createArticleReadingGuide({
    articleTitle: "Source Linked RAG",
    extraction,
    graph,
  });

  assert.equal(guide.status, "ready");
  assert.equal(guide.title, "Source Linked RAG");
  assert.equal(guide.tldr, extraction.abstract);
  assert.equal(guide.contribution, extraction.research_problem);
  assert.equal(guide.method, extraction.methodology);
  assert.deepEqual(guide.claims, [
    "Source-linked answers make article Q&A easier to verify.",
    "Section-aware chunks improve navigation back to evidence.",
  ]);
  assert.equal(guide.limitations, extraction.limitations);
  assert.deepEqual(
    guide.concepts.map((concept) => concept.name),
    ["Retrieval augmented generation", "Hybrid retrieval", "Long technical documents", "Citations"],
  );
  assert.deepEqual(
    guide.readFirst.map((section) => section.title),
    ["Abstract", "Research Problem", "Methodology", "Results"],
  );
  assert.deepEqual(
    guide.questions.map((question) => question.text),
    [
      "What problem does this article solve?",
      "Explain the methodology in plain language.",
      "What are the most important results?",
      "What limitations should I keep in mind?",
    ],
  );
});

test("article reading guide returns a recovery state when extraction is missing", () => {
  const guide = createArticleReadingGuide({
    articleTitle: "Unprocessed paper",
    extraction: null,
    graph: null,
  });

  assert.deepEqual(guide, {
    status: "missing_extraction",
    title: "Unprocessed paper",
    detail: "Run AI extraction to build a reading guide for this article.",
    actions: [{ id: "run_extraction", label: "Run extraction", mode: "extract_only" }],
  });
});

test("article reading guide uses full recovery when extraction is missing before parsing", () => {
  const guide = createArticleReadingGuide({
    articleTitle: "Failed before parse",
    extraction: null,
    graph: null,
    hasMarkdown: false,
  });

  assert.equal(guide.actions[0].mode, "full");
});

test("library reading guide ranks related articles and creates comparison prompts", () => {
  const guide = createLibraryReadingGuide({
    articleId: 7,
    articleTitle: "Source Linked RAG",
    related: [
      {
        id: 10,
        title: "Graph Retrieval",
        similarity: 0.31,
        shared_entities: ["retrieval", "citations"],
      },
      {
        id: 12,
        title: "Document Chunking",
        similarity: 0.46,
        shared_entities: ["chunking"],
      },
    ],
  });

  assert.equal(guide.status, "ready");
  assert.deepEqual(
    guide.readNext.map((item) => [item.rank, item.articleId, item.title, item.reason]),
    [
      [1, 12, "Document Chunking", "Shared concepts: chunking"],
      [2, 10, "Graph Retrieval", "Shared concepts: retrieval, citations"],
    ],
  );
  assert.equal(
    guide.comparePrompt,
    "Compare Source Linked RAG with Document Chunking and Graph Retrieval. Focus on shared concepts, methods, results, and limitations.",
  );
  assert.deepEqual(guide.compareArticleIds, [7, 12, 10]);
});

test("library reading guide explains when there is no related reading yet", () => {
  assert.deepEqual(
    createLibraryReadingGuide({ articleTitle: "Solo Paper", related: [] }),
    {
      status: "empty",
      title: "No read-next suggestions yet",
      detail: "Process more articles to discover shared concepts and comparison paths.",
      readNext: [],
      comparePrompt: "",
      compareArticleIds: [],
    },
  );
});

test("reading guides localize generated prompts and recovery copy", () => {
  const articleGuide = createArticleReadingGuide({
    articleTitle: "Source Linked RAG",
    extraction,
    graph,
    language: "zh",
  });

  assert.deepEqual(
    articleGuide.questions.map((question) => question.text),
    [
      "这篇文章解决了什么问题？",
      "请用通俗语言解释这篇文章的方法。",
      "最重要的结果是什么？",
      "我应该注意哪些局限？",
    ],
  );

  const missingGuide = createArticleReadingGuide({
    articleTitle: "Unprocessed paper",
    extraction: null,
    graph: null,
    language: "zh",
  });
  assert.equal(missingGuide.detail, "运行 AI 抽取，为这篇文章生成阅读指南。");
  assert.equal(missingGuide.actions[0].label, "运行抽取");

  const libraryGuide = createLibraryReadingGuide({
    articleId: 7,
    articleTitle: "Source Linked RAG",
    related: [{ id: 12, title: "Document Chunking", similarity: 0.46 }],
    language: "zh",
  });

  assert.equal(
    libraryGuide.comparePrompt,
    "比较 Source Linked RAG 和 Document Chunking，重点关注共同概念、方法、结果和局限。",
  );
});
