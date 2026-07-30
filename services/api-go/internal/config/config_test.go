package config

import (
	"path/filepath"
	"testing"
)

func TestLoadUsesDesktopDataRootForSQLiteAndStorage(t *testing.T) {
	dataRoot := t.TempDir()
	t.Setenv("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR", dataRoot)
	t.Setenv("DATABASE_URL", "sqlite:///./data/app.sqlite3")
	t.Setenv("STORAGE_DIR", "./storage")
	t.Setenv("PORT", "12148")
	t.Setenv("USE_MOCK_AI", "true")

	cfg, err := Load()
	if err != nil {
		t.Fatalf("Load() error = %v", err)
	}
	if got, want := cfg.DatabasePath, filepath.Join(dataRoot, "data", "app.sqlite3"); got != want {
		t.Errorf("DatabasePath = %q, want %q", got, want)
	}
	if got, want := cfg.StoragePath, filepath.Join(dataRoot, "storage"); got != want {
		t.Errorf("StoragePath = %q, want %q", got, want)
	}
	if got, want := cfg.ListenAddress(), "0.0.0.0:12148"; got != want {
		t.Errorf("ListenAddress() = %q, want %q", got, want)
	}
}

func TestResolveSQLitePathRejectsOtherDatabaseDrivers(t *testing.T) {
	if _, err := resolveSQLitePath("postgresql://localhost/article_processor", t.TempDir()); err == nil {
		t.Fatal("resolveSQLitePath() error = nil, want unsupported driver error")
	}
}
