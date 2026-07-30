package database

import (
	"context"
	"path/filepath"
	"testing"
)

func TestOpenAddsOnlyGoMigrationLedger(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "data", "app.sqlite3")
	db, err := Open(context.Background(), databasePath)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer db.Close()

	var count int
	if err := db.QueryRow("SELECT COUNT(*) FROM go_backend_migrations WHERE version = ?", "0001_go_backend_state").Scan(&count); err != nil {
		t.Fatalf("query migration ledger: %v", err)
	}
	if count != 1 {
		t.Errorf("migration count = %d, want 1", count)
	}
}

func TestOpenPreservesExistingSQLiteTables(t *testing.T) {
	databasePath := filepath.Join(t.TempDir(), "data", "app.sqlite3")
	seed, err := Open(context.Background(), databasePath)
	if err != nil {
		t.Fatalf("seed Open() error = %v", err)
	}
	if _, err := seed.Exec("CREATE TABLE articles (id INTEGER PRIMARY KEY, title TEXT NOT NULL)"); err != nil {
		seed.Close()
		t.Fatalf("create existing table: %v", err)
	}
	if _, err := seed.Exec("INSERT INTO articles(id, title) VALUES (7, 'existing article')"); err != nil {
		seed.Close()
		t.Fatalf("seed existing table: %v", err)
	}
	if err := seed.Close(); err != nil {
		t.Fatalf("close seeded database: %v", err)
	}

	db, err := Open(context.Background(), databasePath)
	if err != nil {
		t.Fatalf("reopen existing SQLite database: %v", err)
	}
	defer db.Close()

	var title string
	if err := db.QueryRow("SELECT title FROM articles WHERE id = 7").Scan(&title); err != nil {
		t.Fatalf("read preserved row: %v", err)
	}
	if title != "existing article" {
		t.Errorf("preserved title = %q, want existing article", title)
	}
}
