package config

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	defaultDatabaseURL = "sqlite:///./data/app.sqlite3"
	defaultStorageDir  = "./storage"
)

// Config holds runtime values shared by the desktop launcher and Go API.
// Relative SQLite and storage paths resolve against DataRoot, matching the
// existing Python backend's ARTICLE_PROCESSOR_DESKTOP_DATA_DIR behavior.
type Config struct {
	DataRoot       string
	DatabasePath   string
	StoragePath    string
	Host           string
	Port           int
	MockAI         bool
	LLMProvider    string
	LLMModel       string
	CustomProtocol string
}

// Load reads the process environment and the same .env location used by the
// Python service. Process environment variables take precedence over .env.
func Load() (Config, error) {
	cwd, err := os.Getwd()
	if err != nil {
		return Config{}, fmt.Errorf("get working directory: %w", err)
	}

	desktopDataDir := strings.TrimSpace(os.Getenv("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR"))
	dataRoot := desktopDataDir
	if dataRoot == "" {
		dataRoot = detectProjectRoot(cwd)
	}
	absDataRoot, err := filepath.Abs(dataRoot)
	if err != nil {
		return Config{}, fmt.Errorf("resolve data root: %w", err)
	}

	dotenvPath := filepath.Join(absDataRoot, ".env")
	if desktopDataDir == "" {
		dotenvPath = filepath.Join(absDataRoot, "services", "api", ".env")
	}
	dotenv, err := readDotenv(dotenvPath)
	if err != nil {
		return Config{}, err
	}
	lookup := func(name, fallback string) string {
		if value, ok := os.LookupEnv(name); ok {
			return value
		}
		if value, ok := dotenv[name]; ok {
			return value
		}
		return fallback
	}

	databasePath, err := resolveSQLitePath(lookup("DATABASE_URL", defaultDatabaseURL), absDataRoot)
	if err != nil {
		return Config{}, err
	}
	storagePath, err := resolvePath(lookup("STORAGE_DIR", defaultStorageDir), absDataRoot)
	if err != nil {
		return Config{}, err
	}
	port, err := strconv.Atoi(lookup("PORT", "8000"))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("PORT must be a number between 1 and 65535")
	}
	mockAI, err := strconv.ParseBool(lookup("USE_MOCK_AI", "true"))
	if err != nil {
		return Config{}, fmt.Errorf("USE_MOCK_AI must be true or false: %w", err)
	}

	cfg := Config{
		DataRoot:       absDataRoot,
		DatabasePath:   databasePath,
		StoragePath:    storagePath,
		Host:           lookup("HOST", "0.0.0.0"),
		Port:           port,
		MockAI:         mockAI,
		LLMProvider:    lookup("LLM_PROVIDER", "openai"),
		LLMModel:       lookup("OPENAI_MODEL", "gpt-4.1-mini"),
		CustomProtocol: lookup("LLM_CUSTOM_PROTOCOL", "openai"),
	}
	if cfg.LLMProvider == "custom" {
		cfg.LLMModel = lookup("LLM_CUSTOM_MODEL", "")
	}
	return cfg, ensureDirectories(cfg)
}

func (c Config) ListenAddress() string {
	return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

func detectProjectRoot(cwd string) string {
	current := cwd
	for {
		if isDirectory(filepath.Join(current, "services")) && isDirectory(filepath.Join(current, "apps")) {
			return current
		}
		parent := filepath.Dir(current)
		if parent == current {
			return cwd
		}
		current = parent
	}
}

func isDirectory(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

func resolveSQLitePath(raw, dataRoot string) (string, error) {
	const prefix = "sqlite:///"
	if !strings.HasPrefix(raw, prefix) {
		return "", fmt.Errorf("DATABASE_URL must use sqlite:/// (got %q)", raw)
	}
	return resolvePath(strings.TrimPrefix(raw, prefix), dataRoot)
}

func resolvePath(raw, dataRoot string) (string, error) {
	if strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("path must not be empty")
	}
	if strings.HasPrefix(raw, "./") || strings.HasPrefix(raw, `.\`) {
		return filepath.Abs(filepath.Join(dataRoot, raw[2:]))
	}
	if filepath.IsAbs(raw) {
		return filepath.Clean(raw), nil
	}
	return filepath.Abs(filepath.Join(dataRoot, raw))
}

func ensureDirectories(cfg Config) error {
	for _, path := range []string{
		filepath.Join(cfg.DataRoot, "data"),
		filepath.Join(cfg.StoragePath, "uploads"),
		filepath.Join(cfg.StoragePath, "markdown"),
		filepath.Join(cfg.StoragePath, "exports"),
		filepath.Join(cfg.StoragePath, "images"),
		filepath.Dir(cfg.DatabasePath),
	} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			return fmt.Errorf("create runtime directory %q: %w", path, err)
		}
	}
	return nil
}

func readDotenv(path string) (map[string]string, error) {
	file, err := os.Open(path)
	if os.IsNotExist(err) {
		return map[string]string{}, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read .env %q: %w", path, err)
	}
	defer file.Close()

	values := make(map[string]string)
	scanner := bufio.NewScanner(file)
	for lineNumber := 1; scanner.Scan(); lineNumber++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimPrefix(line, "export ")
		key, value, ok := strings.Cut(line, "=")
		if !ok || strings.TrimSpace(key) == "" {
			return nil, fmt.Errorf("parse .env %q line %d", path, lineNumber)
		}
		values[strings.TrimSpace(key)] = strings.Trim(strings.TrimSpace(value), `"'`)
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan .env %q: %w", path, err)
	}
	return values, nil
}
