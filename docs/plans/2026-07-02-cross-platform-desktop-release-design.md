# Cross-Platform Desktop Release Design

## Goal

Release Article Processor as installable desktop builds for Windows, macOS, and Linux through GitHub Actions while preserving the existing local web development workflow.

## Decision

Use an Electron desktop shell with two local sidecars:

- a PyInstaller-built FastAPI executable for the backend
- a Next.js standalone server for the existing frontend

Electron owns process startup, port allocation, readiness checks, shutdown, and the desktop window. The backend continues to own ingestion, SQLite, AI provider settings, pipeline processing, and file storage.

## Alternatives Considered

1. Electron plus PyInstaller sidecar
   - Pros: keeps current dynamic Next routes, works across Windows/macOS/Linux, common GitHub Actions path, no native UI rewrite.
   - Cons: larger artifacts because Electron and Python runtime are bundled.

2. PyInstaller plus pywebview plus static Next export
   - Pros: one Python-centered runtime, smaller than Electron in some cases.
   - Cons: static export conflicts with the current dynamic routes such as `/articles/[id]`; would require a heavier frontend routing refactor.

3. Tauri plus Python sidecar
   - Pros: smaller shell runtime.
   - Cons: adds Rust/Tauri tooling and still requires a backend sidecar and careful frontend serving.

## Architecture

The packaged app starts with Electron. Electron finds free localhost ports, launches the backend executable with a desktop data directory, launches the Next standalone server with the selected backend URL, waits for both services, and opens a browser window to the local frontend.

The desktop data directory is controlled by environment variables passed by Electron. SQLite, uploads, exports, markdown, extracted images, provider settings, and logs must live there rather than under the unpacked application bundle or the PyInstaller temporary folder.

The frontend API client must resolve the API base URL at runtime. Development can continue to use `NEXT_PUBLIC_API_BASE_URL` or the existing default. Packaged builds use a small runtime config script written by Electron before the window opens.

## Components

- `apps/desktop`: Electron main process, packaging metadata, and tests.
- `apps/web`: Next standalone build configuration and runtime API URL fallback.
- `services/api`: desktop-aware path configuration and a PyInstaller entry point/spec.
- `.github/workflows/release-desktop.yml`: release workflow matrix for Windows, macOS, and Linux.
- `docs/desktop-release.md`: release and local packaging instructions.

## Data Flow

1. User opens the desktop app.
2. Electron creates or reuses the app data directory.
3. Electron selects local ports for API and web.
4. Electron starts the backend executable with `ARTICLE_PROCESSOR_DESKTOP_DATA_DIR`, `HOST`, `PORT`, `DATABASE_URL`, and `STORAGE_DIR`.
5. Electron writes frontend runtime config with the selected API URL.
6. Electron starts the Next standalone server.
7. Electron waits for `/health` and the frontend root.
8. The window loads the local frontend.
9. The frontend reads the runtime API URL and calls FastAPI.

## Error Handling

Startup failures are logged under the desktop data directory. If either sidecar fails to become ready, Electron shows a small error page with the relevant log location. On app exit, Electron terminates child processes.

## Testing

- Backend tests for desktop path resolution and PyInstaller launcher importability.
- Frontend tests for runtime API base URL resolution.
- Desktop Node tests for port selection, runtime config generation, and sidecar path resolution.
- Existing backend and frontend test/build workflows remain required.
- GitHub Actions release workflow builds artifacts on `v*` tags and can also be triggered manually.
