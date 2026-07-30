"""Offline parser tests for the approved public conference source adapters."""

import json
from urllib.parse import parse_qs, urlparse

from app.services.discovery.conference_scrapers import scrape_conference, write_catalog_snapshot


def _fetcher(pages):
    def fetch(url):
        for marker, content in pages.items():
            if marker in url:
                return content
        raise AssertionError(f"Unexpected source URL: {url}")

    return fetch


def test_openreview_scraper_uses_exact_accepted_venue_filters_and_preserves_notes():
    seen = []

    def fetch(url):
        query = parse_qs(urlparse(url).query)
        seen.append(query)
        venue = query["content.venue"][0]
        if venue != "ICLR 2026 poster":
            return json.dumps({"count": 0, "notes": []})
        return json.dumps({
            "count": 1,
            "notes": [{
                "id": "accepted-id",
                "pdate": "2026-04-23",
                "content": {
                    "title": "Accepted ICLR Paper",
                    "authors": ["Ada Researcher", "Lin Scientist"],
                    "abstract": "An accepted paper.",
                    "keywords": ["triage"],
                    "venue": "ICLR 2026 poster",
                },
            }],
        })

    papers = scrape_conference("iclr_2026", fetch=fetch)

    assert [paper["id"] for paper in papers] == ["accepted-id"]
    paper = papers[0]
    assert paper["content"]["authors"]["value"] == ["Ada Researcher", "Lin Scientist"]
    assert paper["content"]["pdf"]["value"] == "https://openreview.net/pdf?id=accepted-id"
    assert paper["landing_url"] == "https://openreview.net/forum?id=accepted-id"
    assert paper["source_payload"]["id"] == "accepted-id"
    assert seen[0]["domain"] == ["ICLR.cc/2026/Conference"]
    assert seen[0]["invitation"] == ["ICLR.cc/2026/Conference/-/Submission"]
    assert seen[0]["details"] == ["replyCount,presentation,writable"]
    assert seen[0]["limit"] == ["25"]


def test_static_proceedings_scrapers_normalize_their_pdf_and_landing_links():
    pages = {
        "openaccess.thecvf.com": """
            <dl><dt class="ptitle"><a href="/content/CVPR2026/html/Example_CVPR_2026_paper.html">CVPR Paper</a></dt>
            <dd><i>Ada Researcher, Lin Scientist</i></dd>
            <dd><a href="/content/CVPR2026/papers/Example_CVPR_2026_paper.pdf">pdf</a></dd></dl>
        """,
        "dl.acm.org": """
            <div class="issue-item"><h5 class="issue-item__title"><a href="/doi/10.1145/3772318.3772345">CHI Paper</a></h5>
            <div class="issue-item__authors">Ada Researcher; Lin Scientist</div></div>
        """,
    }
    fetch = _fetcher(pages)

    cvpr = scrape_conference("cvpr_2026", fetch=fetch)
    chi = scrape_conference("chi_2026", fetch=fetch)

    assert cvpr[0]["content"]["pdf"]["value"].endswith("Example_CVPR_2026_paper.pdf")
    assert chi[0]["id"] == "10.1145/3772318.3772345"
    assert chi[0]["content"]["pdf"]["value"] == "https://dl.acm.org/doi/pdf/10.1145/3772318.3772345"


def test_openreview_scraper_supports_the_neurips_and_icml_collection_configs():
    requests = []

    def fetch(url):
        query = parse_qs(urlparse(url).query)
        requests.append(query)
        return json.dumps({"count": 0, "notes": []})

    for key in ("neurips_2025", "icml_2025"):
        try:
            scrape_conference(key, fetch=fetch)
        except RuntimeError:
            # The test deliberately returns no notes and no HTML fallback rows.
            pass

    assert any(query.get("domain") == ["NeurIPS.cc/2025/Conference"] for query in requests)
    assert any(query.get("domain") == ["ICML.cc/2025/Conference"] for query in requests)


def test_chi_scraper_falls_back_to_crossref_when_the_acm_index_blocks_a_request():
    crossref_payload = {
        "message": {
            "items": [
                {
                    "DOI": "10.1145/3772318.3772345",
                    "title": ["CHI Crossref Paper"],
                    "container-title": ["Proceedings of the 2026 CHI Conference on Human Factors in Computing Systems"],
                    "author": [{"given": "Ada", "family": "Researcher"}],
                    "published": {"date-parts": [[2026, 4, 13]]},
                }
            ]
        }
    }

    def fetch(url):
        if "dl.acm.org" in url:
            raise RuntimeError("403 Forbidden")
        if "api.crossref.org" in url:
            return json.dumps(crossref_payload)
        raise AssertionError(f"Unexpected source URL: {url}")

    papers = scrape_conference("chi_2026", fetch=fetch)

    assert papers[0]["content"]["authors"]["value"] == ["Ada Researcher"]
    assert papers[0]["content"]["published_date"]["value"] == "2026-04-13"
    assert papers[0]["landing_url"] == "https://doi.org/10.1145/3772318.3772345"


def test_snapshot_writer_sorts_and_replaces_a_jsonl_snapshot(tmp_path):
    output_path = tmp_path / "catalog" / "iclr_2026.jsonl"
    count = write_catalog_snapshot(
        [
            {"id": "z-paper", "content": {"title": {"value": "Z"}}},
            {"id": "a-paper", "content": {"title": {"value": "A"}}},
        ],
        output_path,
    )

    assert count == 2
    rows = [json.loads(line) for line in output_path.read_text(encoding="utf-8").splitlines()]
    assert [row["id"] for row in rows] == ["a-paper", "z-paper"]
