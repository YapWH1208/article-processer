"""HTML parser — converts HTML to Markdown."""

import logging
from pathlib import Path
from bs4 import BeautifulSoup
from app.services.parsers.base import BaseParser, ParseResult

logger = logging.getLogger(__name__)


class HtmlParser(BaseParser):
    """Parse HTML files to Markdown."""

    async def parse(self, file_path: Path) -> ParseResult:
        """Convert HTML to Markdown using BeautifulSoup + simple conversion."""
        try:
            html_content = file_path.read_text(encoding="utf-8", errors="replace")
            soup = BeautifulSoup(html_content, "html.parser")

            # Remove script and style elements
            for tag in soup(["script", "style", "nav", "footer", "header"]):
                tag.decompose()

            # Extract title
            title = None
            title_tag = soup.find("title")
            if title_tag:
                title = title_tag.get_text(strip=True)
            if not title:
                h1 = soup.find("h1")
                if h1:
                    title = h1.get_text(strip=True)
            if not title:
                title = file_path.stem

            # Get body or entire document
            body = soup.find("body") or soup

            markdown = self._html_to_markdown(body)

            return ParseResult(
                markdown=f"# {title}\n\n{markdown}",
                title=title,
                metadata={"source": "html"},
            )
        except Exception as e:
            logger.error(f"HTML parsing failed for {file_path}: {e}")
            raise

    def _html_to_markdown(self, element) -> str:
        """Simple HTML to Markdown conversion."""
        from bs4 import NavigableString, Tag

        def convert(el, level=0):
            if isinstance(el, NavigableString):
                text = str(el).strip()
                return text if text else ""

            if not isinstance(el, Tag):
                return ""

            tag_name = el.name.lower() if el.name else ""
            children = "".join(convert(c, level) for c in el.children)

            if tag_name in ("h1", "h2", "h3", "h4", "h5", "h6"):
                level = int(tag_name[1])
                return f"\n\n{'#' * level} {children.strip()}\n\n"

            if tag_name == "p":
                return f"\n\n{children.strip()}\n\n"

            if tag_name in ("ul", "ol"):
                return f"\n\n{children.strip()}\n\n"

            if tag_name == "li":
                return f"- {children.strip()}\n"

            if tag_name in ("strong", "b"):
                return f"**{children.strip()}**"

            if tag_name in ("em", "i"):
                return f"*{children.strip()}*"

            if tag_name == "a":
                href = el.get("href", "")
                if href:
                    return f"[{children.strip()}]({href})"
                return children.strip()

            if tag_name == "img":
                alt = el.get("alt", "")
                src = el.get("src", "")
                return f"\n\n![{alt}]({src})\n\n"

            if tag_name == "table":
                return f"\n\n<!-- table placeholder -->\n\n{children.strip()}\n\n"

            if tag_name == "blockquote":
                lines = children.strip().split("\n")
                quoted = "\n".join(f"> {line}" for line in lines if line.strip())
                return f"\n\n{quoted}\n\n"

            if tag_name in ("br",):
                return "\n"

            if tag_name in ("hr",):
                return "\n\n---\n\n"

            if tag_name == "code":
                return f"`{children.strip()}`"

            if tag_name == "pre":
                return f"\n\n```\n{children.strip()}\n```\n\n"

            return children

        return convert(element)

    def supports(self, source_type: str) -> bool:
        return source_type == "html"
