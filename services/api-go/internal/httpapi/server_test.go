package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/YapWH1208/article-processer/services/api-go/internal/config"
	"github.com/YapWH1208/article-processer/services/api-go/internal/database"
)

func TestHealthMatchesExistingFrontendContract(t *testing.T) {
	handler := NewServer(config.Config{
		MockAI:      true,
		LLMProvider: "openai",
		LLMModel:    "gpt-4.1-mini",
	}).Handler()
	request := httptest.NewRequest(http.MethodGet, "/health", nil)
	request.Header.Set("Origin", "http://127.0.0.1:3000")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusOK)
	}
	if got := response.Header().Get("Access-Control-Allow-Origin"); got != "http://127.0.0.1:3000" {
		t.Errorf("CORS origin = %q", got)
	}
	var body map[string]any
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode health response: %v", err)
	}
	if body["status"] != "ok" || body["mock_ai"] != true || body["version"] != "0.1.0" {
		t.Errorf("unexpected health body: %#v", body)
	}
}

func TestConferenceSearchReadsSharedCatalogue(t *testing.T) {
	db, err := database.Open(context.Background(), filepath.Join(t.TempDir(), "app.sqlite3"))
	if err != nil {
		t.Fatalf("open database: %v", err)
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
        (1, 'cvpr_2026', 'cvpr-1', 'Vision paper', '["Grace"]', 'Abstract', '["vision"]', '2026', 'CVPR', 'https://example.test', 'https://example.test/paper.pdf', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatalf("seed catalogue: %v", err)
	}

	handler := NewServerWithDB(config.Config{}, db).Handler()
	request := httptest.NewRequest(http.MethodGet, "/discover/conferences/cvpr_2026/papers?query=Vision", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
	var body struct {
		Items []struct {
			ID       int     `json:"id"`
			PDFURL   *string `json:"pdf_url"`
			Provider string  `json:"source_provider"`
		} `json:"items"`
		Total int `json:"total"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("decode search response: %v", err)
	}
	if body.Total != 1 || len(body.Items) != 1 || body.Items[0].ID != 1 || body.Items[0].PDFURL == nil || body.Items[0].Provider != "conference_catalog" {
		t.Errorf("unexpected catalogue response: %#v", body)
	}
}
