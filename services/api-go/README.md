# Go backend migration

This module is the staged native replacement for `services/api`. It currently
owns only process configuration, additive SQLite migration bookkeeping, and
the compatible `GET /health` endpoint. The Electron launcher continues to use
the Python backend until each remaining API vertical slice has equivalent
contract and migration tests.

## Run locally

From this directory, run:

```powershell
$env:ARTICLE_PROCESSOR_DESKTOP_DATA_DIR = "C:\path\to\article-processor-data"
$env:HOST = "127.0.0.1"
$env:PORT = "12148"
go run ./cmd/article-processor-api
```

The Go service follows the existing Python data-root contract:

- `DATABASE_URL=sqlite:///./data/app.sqlite3` resolves under
  `ARTICLE_PROCESSOR_DESKTOP_DATA_DIR`.
- `STORAGE_DIR=./storage` resolves under the same root.
- Existing SQLite tables remain intact. The only Go-owned migration state is
  the additive `go_backend_migrations` table.
- Environment values override the relevant `.env` file values, matching the
  current backend.

## Validation

```powershell
gofmt -l .
go vet ./...
go test ./...
go build ./cmd/article-processor-api
```

`internal/contract/routes.json` is deliberately checked against FastAPI's
OpenAPI output by `services/api/app/tests/test_go_route_contract.py`. Update it
only with an intentional compatible API-contract change.
