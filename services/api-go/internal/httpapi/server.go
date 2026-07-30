package httpapi

import (
	"context"
	"database/sql"
	"encoding/json"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/YapWH1208/article-processer/services/api-go/internal/catalog"
	"github.com/YapWH1208/article-processer/services/api-go/internal/config"
)

// Server hosts Go-owned API routes during the staged backend migration.
type Server struct {
	config config.Config
	db     *sql.DB
}

func NewServer(cfg config.Config) Server {
	return Server{config: cfg}
}

func NewServerWithDB(cfg config.Config, db *sql.DB) Server {
	return Server{config: cfg, db: db}
}

func (s Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /discover/collections", s.collections)
	mux.HandleFunc("GET /discover/conferences/{conference_key}/papers", s.conferencePapers)
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

func (s Server) collections(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, catalog.Collections())
}

func (s Server) conferencePapers(w http.ResponseWriter, r *http.Request) {
	if s.db == nil {
		writeError(w, http.StatusServiceUnavailable, "Conference catalogue is not configured")
		return
	}
	offset, err := optionalInt(r.URL.Query().Get("offset"), 0)
	if err != nil {
		writeError(w, http.StatusBadRequest, "offset must be an integer")
		return
	}
	limit, err := optionalInt(r.URL.Query().Get("limit"), 20)
	if err != nil {
		writeError(w, http.StatusBadRequest, "limit must be an integer")
		return
	}
	page, err := catalog.Search(
		context.Background(),
		s.db,
		r.PathValue("conference_key"),
		r.URL.Query().Get("query"),
		r.URL.Query().Get("scope"),
		offset,
		limit,
	)
	if err != nil {
		status := http.StatusBadRequest
		if strings.HasPrefix(err.Error(), "unsupported conference collection") {
			status = http.StatusNotFound
		}
		writeError(w, status, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func optionalInt(raw string, fallback int) (int, error) {
	if raw == "" {
		return fallback, nil
	}
	return strconv.Atoi(raw)
}

func writeError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]string{"detail": detail})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
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
