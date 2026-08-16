# Docker Deployment

Run the whole stack (FastAPI backend + Next.js frontend) in containers.
A self-hosted MinerU parsing service is available as an opt-in profile.

## Prerequisites

- Docker Engine ≥ 24 (Compose v2.24+) or Docker Desktop
- Optional: NVIDIA GPU + `nvidia-container-toolkit` for the `mineru-api` profile

## Quick start

```bash
cp .env.example .env          # edit keys as needed
docker compose up -d --build
```

- Web UI: http://localhost:3000
- API: http://localhost:8000 (docs at `/docs`, health at `/health`)

The frontend image bakes `NEXT_PUBLIC_API_BASE_URL` at build time (default
`http://localhost:8000`, override via `.env`). Rebuild after changing it:

```bash
docker compose build web
docker compose up -d web
```

## Data persistence

SQLite + uploaded files live on the `app-data` volume mounted at `/data`
(`DATABASE_URL=sqlite:////data/app.sqlite3`, `STORAGE_DIR=/data/storage`).
Migrations run automatically on container start (`alembic upgrade head`).

Backup / inspect:

```bash
docker volume ls | grep article-processor
docker run --rm -v article-processor_app-data:/data alpine ls /data
```

Note: settings saved through the web UI's Settings pages are written to the
container's `.env` file and are **ephemeral** — they disappear when the
container is recreated. Use the compose `.env` file for persistent
configuration (real environment variables take precedence over the `.env`
file inside the container).

## Parsing strategies in Docker

The `api` image ships lightweight local parsers only (pypdf, Docling,
Tesseract OCR — installed via `.[all]`). Heavy MinerU runs elsewhere:

| Strategy                    | How to enable                                                            |
| --------------------------- | ------------------------------------------------------------------------ |
| MinerU cloud API (mineru.net) | Set `MINERU_API_ENABLED=true` + `MINERU_API_KEY=<token>` in `.env`       |
| Self-hosted `mineru-api`      | `docker compose --profile mineru up -d --build`, then set `MINERU_API_ENABLED=true`, `MINERU_API_MODE=selfhosted`, `MINERU_API_BASE_URL=http://mineru-api:8000` |
| Docling / pypdf / OCR       | Fallbacks — always available, used when MinerU is not configured          |

## Self-hosted MinerU service (optional)

```bash
docker compose --profile mineru up -d
```

`mineru-api` listens on port 8000 inside the container, exposed on the host at
http://localhost:8001 (API docs at `/docs`). The API container must reach it
by Compose service name — `MINERU_API_BASE_URL=http://mineru-api:8000` (the
host's `localhost:8001` only works if you run the API process on the host too).
The default `opendatalab/mineru:latest` image may need to be built
locally from [opendatalab/MinerU](https://github.com/opendatalab/MinerU)
(see their `docker/compose.yaml`); for GPU acceleration uncomment the `deploy`
block in `docker-compose.yml` and pull with the NVIDIA container toolkit
installed.

This profile is off by default because the image is very large
(multi-GB, model weights + torch).
