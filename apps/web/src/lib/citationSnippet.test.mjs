import assert from "node:assert/strict";
import test from "node:test";
import {
  stripCitationPrefix,
  startsWithBlockElement,
  hasVisibleCompactContent,
} from "./citationSnippet.mjs";

test("stripCitationPrefix removes the leading [source] marker", () => {
  assert.equal(stripCitationPrefix("[12] The text"), "The text");
  assert.equal(stripCitationPrefix("[1:2:3] text"), "text");
  assert.equal(stripCitationPrefix("No prefix here"), "No prefix here");
  assert.equal(stripCitationPrefix(""), "");
  assert.equal(stripCitationPrefix(null), "");
  assert.equal(stripCitationPrefix(undefined), "");
});

test("startsWithBlockElement detects paragraph-interrupting blocks", () => {
  assert.equal(startsWithBlockElement("# Heading"), true);
  assert.equal(startsWithBlockElement("## Sub"), true);
  assert.equal(startsWithBlockElement("- item"), true);
  assert.equal(startsWithBlockElement("1. item"), true);
  assert.equal(startsWithBlockElement("1) item"), true);
  assert.equal(startsWithBlockElement("> quote"), true);
  assert.equal(startsWithBlockElement("```\ncode"), true);
  assert.equal(startsWithBlockElement("| a | b |"), true);
  assert.equal(startsWithBlockElement("---"), true);
  assert.equal(startsWithBlockElement("<div>content"), true);
  assert.equal(startsWithBlockElement("$$"), true);
  assert.equal(startsWithBlockElement("\n\n# Heading"), true);
});

test("startsWithBlockElement leaves prose unquoted-eligible", () => {
  assert.equal(startsWithBlockElement("Hello world"), false);
  assert.equal(startsWithBlockElement("2026 was a good year"), false);
  assert.equal(startsWithBlockElement("-something"), false);
  assert.equal(startsWithBlockElement("*emphasis*"), false);
  assert.equal(startsWithBlockElement("#1 ranking"), false);
  assert.equal(startsWithBlockElement("text then | pipe"), false);
});

test("hasVisibleCompactContent keeps prose visible", () => {
  assert.equal(hasVisibleCompactContent("Hello world"), true);
  assert.equal(hasVisibleCompactContent("Some ![alt](x.png) text"), true);
  assert.equal(hasVisibleCompactContent("Lead-in\n<table><tr><td>x</td></tr></table>"), true);
  assert.equal(hasVisibleCompactContent("Text before\n\n| a |\n| - |\n| b |"), true);
  assert.equal(hasVisibleCompactContent("```\n| a | b |\n| - |\n```"), true);
});

test("hasVisibleCompactContent hides table/image-only snippets", () => {
  assert.equal(hasVisibleCompactContent(""), false);
  assert.equal(hasVisibleCompactContent("   \n  "), false);
  assert.equal(hasVisibleCompactContent("| a | b |\n| --- | --- |\n| c | d |"), false);
  assert.equal(hasVisibleCompactContent("| a |\n| - |"), false);
  assert.equal(hasVisibleCompactContent("<table><tr><td>x</td></tr></table>"), false);
  assert.equal(hasVisibleCompactContent("![alt](x.png)"), false);
});

test("hasVisibleCompactContent keeps non-table pipe lines", () => {
  assert.equal(hasVisibleCompactContent("| a | b |"), true);
  assert.equal(hasVisibleCompactContent("| --- |"), true);
});
