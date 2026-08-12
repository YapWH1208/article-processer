"""Extract release notes for a version tag from CHANGELOG.md.

Used by the GitHub release workflow: the release notes for a tag (e.g.
``v0.3.0``) come from the matching ``## [0.3.0] — YYYY-MM-DD`` section in
CHANGELOG.md. The workflow fails when no entry exists for the tagged version,
so the changelog stays the single source of truth for release content.

Usage:
    python3 scripts/release_notes.py CHANGELOG.md v0.3.0 > release-notes.md
"""

import re
import sys
from pathlib import Path

VERSION_HEADING_RE = re.compile(r"^##\s+\[([^\]]+)\]")
SEPARATOR_RE = re.compile(r"^\s*---\s*$")


def _strip_v(version: str) -> str:
    return version[1:] if version.startswith("v") else version


def extract_release_notes(changelog_text: str, version: str) -> str:
    """Return the changelog section for ``version`` (with or without leading 'v').

    The section spans from the ``## [<version>]`` heading until the next
    ``## `` heading or ``---`` separator. Raises ``ValueError`` when the
    version has no entry.
    """
    wanted = _strip_v(version)
    lines = changelog_text.splitlines()

    start: int | None = None
    end: int | None = None
    for index, line in enumerate(lines):
        match = VERSION_HEADING_RE.match(line)
        if start is None:
            if match and _strip_v(match.group(1)) == wanted:
                start = index
            continue
        if match or SEPARATOR_RE.match(line):
            end = index
            break

    if start is None:
        raise ValueError(
            f"No CHANGELOG entry found for version '{wanted}'. "
            f"Add a '## [{wanted}] — YYYY-MM-DD' section to CHANGELOG.md before releasing."
        )

    body = lines[start + 1 : end if end is not None else len(lines)]
    while body and not body[0].strip():
        body.pop(0)
    while body and not body[-1].strip():
        body.pop()
    return "\n".join(body).strip() + "\n"


def main(argv: list[str] | None = None) -> int:
    argv = argv if argv is not None else sys.argv[1:]
    if len(argv) != 2:
        print(f"Usage: {Path(sys.argv[0]).name} CHANGELOG.md <tag-or-version>", file=sys.stderr)
        return 2
    changelog_path, version = argv
    try:
        text = Path(changelog_path).read_text(encoding="utf-8")
        notes = extract_release_notes(text, version)
    except OSError as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1
    except ValueError as err:
        print(f"Error: {err}", file=sys.stderr)
        return 1
    print(notes, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
