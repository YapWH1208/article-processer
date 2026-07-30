package catalog

import (
	"context"
	"database/sql"
	"testing"

	_ "modernc.org/sqlite"
)

func TestSearchReadsExistingCatalogueRows(t *testing.T) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("open SQLite: %v", err)
	}
	defer db.Close()
	if _, err := db.Exec(`CREATE TABLE conference_catalog_papers (
        id INTEGER PRIMARY KEY,
        conference_key TEXT NOT NULL,
        source_external_id TEXT NOT NULL,
        title TEXT NOT NULL,
        authors_json TEXT,
        abstract TEXT,
        keywords_json TEXT,
        published_date TEXT,
        venue TEXT,
        landing_url TEXT,
        pdf_url TEXT,
        imported_at TEXT
    )`); err != nil {
		t.Fatalf("create catalogue table: %v", err)
	}
	if _, err := db.Exec(`INSERT INTO conference_catalog_papers VALUES
        (1, 'iclr_2026', 'paper-1', 'Reliable PDF import', '["Ada"]', 'A paper about recovery.', '["reliability"]', '2026-01-01', 'ICLR', 'https://example.test/paper', 'https://example.test/paper.pdf', '2026-01-02T00:00:00Z'),
        (2, 'iclr_2026', 'paper-2', 'Other paper', '[]', NULL, '[]', NULL, NULL, NULL, NULL, '2026-01-02T00:00:00Z')`); err != nil {
		t.Fatalf("seed catalogue: %v", err)
	}

	page, err := Search(context.Background(), db, "iclr_2026", "Reliable", "title", 0, 20)
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if page.Total != 1 || len(page.Items) != 1 {
		t.Fatalf("page = %#v, want one matching item", page)
	}
	if got := page.Items[0]; got.SourceProvider != "conference_catalog" || got.PDFURL == nil || *got.PDFURL != "https://example.test/paper.pdf" {
		t.Errorf("candidate = %#v", got)
	}
}

func TestSearchRejectsUnsupportedCollection(t *testing.T) {
	if _, err := Search(context.Background(), nil, "unknown_2026", "", "title", 0, 20); err == nil {
		t.Fatal("Search() error = nil, want unsupported collection error")
	}
}
