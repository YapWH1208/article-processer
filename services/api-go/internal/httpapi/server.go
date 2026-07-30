package httpapi

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"github.com/YapWH1208/article-processer/services/api-go/internal/config"
)

// Server hosts Go-owned API routes during the staged backend migration.
type Server struct {
	config config.Config
}

func NewServer(cfg config.Config) Server {
	return Server{config: cfg}
}

func (s Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	return withCORS(mux)
}

func (s Server) health(w http.ResponseWriter, _ *http.Request) {
	response := map[string]any{
		"status":              "ok",
		"version":             "0.1.0",
		"mock_ai":             s.config.MockAI,
		"llm_provider":        s.config.LLMProvider,
		"llm_model":           s.config.LLMModel,
		"llm_custom_protocol": nil,
	}
	if s.config.LLMProvider == "custom" {
		response["llm_custom_protocol"] = s.config.CustomProtocol
	}
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	_ = json.NewEncoder(w).Encode(response)
}

func withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin := allowedOrigin(r.Header.Get("Origin")); origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func allowedOrigin(raw string) string {
	origin, err := url.Parse(raw)
	if err != nil || origin.Scheme != "http" || origin.Port() == "" {
		return ""
	}
	if host := strings.ToLower(origin.Hostname()); host == "localhost" || host == "127.0.0.1" {
		return raw
	}
	return ""
}
