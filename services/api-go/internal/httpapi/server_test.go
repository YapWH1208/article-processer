package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/YapWH1208/article-processer/services/api-go/internal/config"
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
