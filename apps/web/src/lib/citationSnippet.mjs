export function stripCitationPrefix(text) {
  return String(text ?? "").replace(/^\[.*?\]\s*/, "");
}

// CommonMark block elements that can interrupt a paragraph, causing a
// leading quote to render as a dangling paragraph above the block.
const BLOCK_START =
  /^(?:#{1,6}[ \t]|>[ \t]?|[-+*][ \t]|\d{1,9}[.)][ \t]|`{3,}|~{3,}|[-*_]{3,}[ \t]*$|<[a-zA-Z][^>\n]*>|\$\$|\|)/;

export function startsWithBlockElement(text) {
  return BLOCK_START.test(String(text ?? "").replace(/^\s+/, ""));
}

function getFenceMarker(line) {
  const lineWithoutEnding = line.replace(/(?:\r\n|\n|\r)$/, "");
  const match = lineWithoutEnding.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return { char: match[1][0], length: match[1].length };
}

function isTableSeparator(line) {
  return /^\s*\|?[ \t:|-]*-[ \t:|-]*\|?\s*$/.test(line);
}

// compact mode drops images and tables; a snippet consisting only of those
// elements would render as an empty, dangling-quote card.
export function hasVisibleCompactContent(text) {
  const source = String(text ?? "");
  const lines = source
    .replace(/<table\b[\s\S]*?<\/table>/gi, "")
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const content = [];
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    const fence = getFenceMarker(line);

    if (!inFence && fence) {
      inFence = true;
      fenceChar = fence.char;
      fenceLength = fence.length;
      content.push(line);
      index++;
      continue;
    }
    if (inFence) {
      content.push(line);
      if (fence && fence.char === fenceChar && fence.length >= fenceLength) {
        inFence = false;
      }
      index++;
      continue;
    }

    if (line.trim().startsWith("|")) {
      let end = index;
      let isTable = false;
      while (end < lines.length && lines[end].trim().startsWith("|")) {
        if (isTableSeparator(lines[end])) isTable = true;
        end++;
      }
      if (isTable && end - index >= 2) {
        index = end;
        continue;
      }
    }

    content.push(line.replace(/!\[[^\]]*\]\([^)]*\)/g, ""));
    index++;
  }

  return content.some((line) => line.trim() !== "");
}
