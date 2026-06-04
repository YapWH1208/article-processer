export function normalizeHtmlTablesForMarkdown(text) {
  const source = String(text || "");
  if (!/<table\b/i.test(source)) return source;

  return normalizeOutsideFencedCode(source);
}

function normalizeOutsideFencedCode(source) {
  const lines = splitLines(source);
  let output = "";
  let pending = "";
  let inFence = false;
  let fenceChar = "";
  let fenceLength = 0;

  for (const line of lines) {
    const fence = getFenceMarker(line);
    if (fence) {
      if (!inFence) {
        output += normalizeTablesInSegment(pending);
        pending = "";
        inFence = true;
        fenceChar = fence.char;
        fenceLength = fence.length;
        output += line;
        continue;
      }

      if (fence.char === fenceChar && fence.length >= fenceLength) {
        inFence = false;
        output += line;
        continue;
      }
    }

    if (inFence) {
      output += line;
    } else {
      pending += line;
    }
  }

  return output + normalizeTablesInSegment(pending);
}

function splitLines(source) {
  const parts = source.split(/(\r\n|\n|\r)/);
  const lines = [];
  for (let index = 0; index < parts.length; index += 2) {
    if (parts[index] === "" && index >= parts.length - 1) continue;
    lines.push(parts[index] + (parts[index + 1] || ""));
  }
  return lines;
}

function getFenceMarker(line) {
  const lineWithoutEnding = line.replace(/(?:\r\n|\n|\r)$/, "");
  const match = lineWithoutEnding.match(/^[ \t]{0,3}(`{3,}|~{3,})/);
  if (!match) return null;
  return { char: match[1][0], length: match[1].length };
}

function normalizeTablesInSegment(segment) {
  return segment.replace(/<table\b[\s\S]*?<\/table>/gi, (tableHtml) => {
    const markdown = htmlTableToMarkdown(tableHtml);
    return markdown || tableHtml;
  });
}

function htmlTableToMarkdown(tableHtml) {
  const rows = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(tableHtml)) !== null) {
    const cells = parseCells(rowMatch[1]);
    if (cells.length > 0) rows.push(cells);
  }

  const columnCount = Math.max(0, ...rows.map((row) => row.length));
  if (rows.length === 0 || columnCount === 0) return null;

  const normalizedRows = rows.map((row) => {
    const padded = row.slice(0, columnCount);
    while (padded.length < columnCount) padded.push("");
    return padded.map(formatMarkdownCell);
  });

  const [header, ...body] = normalizedRows;
  const separator = Array.from({ length: columnCount }, () => "---");
  const lines = [
    markdownTableRow(header),
    markdownTableRow(separator),
    ...body.map(markdownTableRow),
  ];

  return `\n\n${lines.join("\n")}\n\n`;
}

function parseCells(rowHtml) {
  const cells = [];
  const cellPattern = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
  let cellMatch;

  while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
    cells.push(cleanCellText(cellMatch[1]));
  }

  return cells;
}

function cleanCellText(cellHtml) {
  return decodeHtmlEntities(
    cellHtml
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/<script\b[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(?:p|div|li|h[1-6])>/gi, " ")
      .replace(/<[^>]+>/g, "")
  );
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return String(value).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]+);/gi, (entity, body) => {
    const lower = body.toLowerCase();
    if (lower.startsWith("#x")) {
      return decodeCodePoint(Number.parseInt(lower.slice(2), 16), entity);
    }
    if (lower.startsWith("#")) {
      return decodeCodePoint(Number.parseInt(lower.slice(1), 10), entity);
    }
    return Object.prototype.hasOwnProperty.call(named, lower) ? named[lower] : entity;
  });
}

function decodeCodePoint(codePoint, fallback) {
  if (!Number.isFinite(codePoint)) return fallback;
  try {
    return String.fromCodePoint(codePoint);
  } catch {
    return fallback;
  }
}

function formatMarkdownCell(value) {
  return String(value)
    .replace(/\|/g, "\\|")
    .replace(/(?:\r\n|\n|\r)/g, " ")
    .replace(/[ \t\f\v]+/g, " ")
    .trim();
}

function markdownTableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}
