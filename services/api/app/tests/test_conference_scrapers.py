"""Offline parser tests for the approved public conference source adapters."""

import json

from app.services.discovery.conference_scrapers import scrape_conference, write_catalog_snapshot


def _fetcher(pages):
    def fetch(url):
        for marker, content in pages.items():
            if marker in url:
                return content
        raise AssertionError(f"Unexpected source URL: {url}")

    return fetch


def test_iclr_scraper_reads_only_accepted_entries_from_the_official_virtual_program():
    payload = {
        "results": [
            {
                "id": 1001,
                "name": "Accepted ICLR Paper",
                "authors": [{"fullname": "Ada Researcher"}, {"fullname": "Lin Scientist"}],
                "keywords": ["triage"],
                "decision": "Accept (Poster)",
                "starttime": "2026-04-23T06:30:00-07:00",
                "paper_url": "https://openreview.net/forum?id=accepted-id",
            },
            {
                "id": 1002,
                "name": "Rejected ICLR Paper",
                "decision": "Reject",
            },
        ]
    }

    papers = scrape_conference("iclr_2026", fetch=_fetcher({"iclr.cc": json.dumps(payload)}))

    assert [paper["id"] for paper in papers] == ["accepted-id"]
    paper = papers[0]
    assert paper["content"]["authors"]["value"] == ["Ada Researcher", "Lin Scientist"]
    assert paper["content"]["pdf"]["value"] == "https://openreview.net/pdf?id=accepted-id"
    assert paper["landing_url"] == "https://openreview.net/forum?id=accepted-id"


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
        "proceedings.neurips.cc": """
            <ul><li><a href="/paper_files/paper/2025/hash/abc-Abstract-Conference.html">NeurIPS Paper</a><i>Ada Researcher, Lin Scientist</i></li></ul>
        """,
        "proceedings.mlr.press": """
            <div class="paper"><p class="title">ICML Paper</p>
            <span class="authors">Ada Researcher, Lin Scientist</span><a href="example25a.html">abs</a>
            <a href="https://raw.githubusercontent.com/mlresearch/v267/main/assets/example25a/example25a.pdf">Download PDF</a></div>
        """,
    }
    fetch = _fetcher(pages)

    cvpr = scrape_conference("cvpr_2026", fetch=fetch)
    chi = scrape_conference("chi_2026", fetch=fetch)
    neurips = scrape_conference("neurips_2025", fetch=fetch)
    icml = scrape_conference("icml_2025", fetch=fetch)

    assert cvpr[0]["content"]["pdf"]["value"].endswith("Example_CVPR_2026_paper.pdf")
    assert chi[0]["id"] == "10.1145/3772318.3772345"
    assert chi[0]["content"]["pdf"]["value"] == "https://dl.acm.org/doi/pdf/10.1145/3772318.3772345"
    assert neurips[0]["content"]["pdf"]["value"] == (
        "https://proceedings.neurips.cc/paper_files/paper/2025/file/abc-Paper-Conference.pdf"
    )
    assert icml[0]["content"]["pdf"]["value"].endswith("example25a.pdf")


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
