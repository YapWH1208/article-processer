CREATE TABLE IF NOT EXISTS go_backend_migrations (
    version TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
);
