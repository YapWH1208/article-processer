# Cross-Platform Desktop Release Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build releaseable Windows, macOS, and Linux desktop artifacts for Article Processor through GitHub Actions.

**Architecture:** Add an Electron app that starts a PyInstaller-packaged FastAPI backend and a Next.js standalone frontend on local ports. The packaged runtime stores SQLite, uploads, exports, markdown, images, settings, and logs in a desktop data directory supplied by Electron.

**Tech Stack:** Electron, electron-builder, Next.js standalone output, FastAPI, PyInstaller, GitHub Actions matrix builds.

---

### Task 1: Backend Desktop Paths

**Files:**
- Modify: `services/api/app/core/config.py`
- Test: `services/api/app/tests/test_desktop_config.py`

**Step 1: Write failing tests**

Add tests that set `ARTICLE_PROCESSOR_DESKTOP_DATA_DIR` and assert:

- `settings.project_root` still points at the repo for source files.
- `settings.data_path` points at the desktop data dir.
- `DATABASE_URL=sqlite:///./data/app.sqlite3` resolves under the desktop data dir.
- `STORAGE_DIR=./storage` resolves under the desktop data dir.
- required storage subdirectories are created under the desktop data dir.

Run:

```bash
cd services/api
python -m pytest app/tests/test_desktop_config.py -v
```

Expected: fail because the desktop data-root helpers do not exist yet.

**Step 2: Implement minimal config support**

In `config.py`, add:

- `_APP_ROOT` for source/package location.
- `_DESKTOP_DATA_DIR = os.environ.get("ARTICLE_PROCESSOR_DESKTOP_DATA_DIR")`.
- `_DATA_ROOT = Path(_DESKTOP_DATA_DIR).expanduser().resolve()` when set, otherwise `_APP_ROOT`.
- helpers that resolve `./data` and `./storage` against `_DATA_ROOT`.
- `Settings.data_path` property.

Keep `DOTENV_PATH` under the source/package root unless a desktop data dir is set and a copied `.env` exists there.

**Step 3: Verify**

Run:

```bash
cd services/api
python -m pytest app/tests/test_desktop_config.py app/tests/test_migrations_sqlite.py app/tests/test_backend_startup_imports.py -v
```

Expected: pass.

### Task 2: Backend Desktop Launcher and PyInstaller Spec

**Files:**
- Create: `services/api/app/desktop_launcher.py`
- Create: `services/api/app/desktop_app.spec`
- Modify: `services/api/pyproject.toml`
- Test: `services/api/app/tests/test_desktop_launcher.py`

**Step 1: Write failing tests**

Test that:

- `desktop_launcher.create_app()` returns the FastAPI app object.
- `desktop_launcher.main` is importable without starting uvicorn.
- `desktop_app.spec` exists and does not rely on `__file__`.
- `pyinstaller` is present in the `desktop` optional dependency group.

Run:

```bash
cd services/api
python -m pytest app/tests/test_desktop_launcher.py -v
```

Expected: fail because launcher/spec do not exist.

**Step 2: Implement launcher/spec**

Add a small launcher with `create_app()` and `main()`. `main()` reads `HOST` and `PORT`, bootstraps frozen stdout/stderr logs if needed, imports `app.main:app`, and calls `uvicorn.run`.

Add a PyInstaller spec that packages `app.desktop_launcher`, includes Alembic migration files, and names the backend binary `article-processor-api`.

Add optional dependency group:

```toml
desktop = [
    "pyinstaller>=6.0.0",
]
```

**Step 3: Verify**

Run:

```bash
cd services/api
python -m pytest app/tests/test_desktop_launcher.py -v
```

Expected: pass.

### Task 3: Frontend Runtime API URL and Standalone Build

**Files:**
- Modify: `apps/web/next.config.js`
- Modify: `apps/web/src/lib/api.ts`
- Create: `apps/web/src/lib/apiBase.test.mjs`
- Test: `apps/web/src/lib/apiBase.test.mjs`

**Step 1: Write failing tests**

Extract API URL resolution into a pure helper and test:

- explicit env URL wins.
- desktop runtime config URL wins when env is absent.
- default remains `http://localhost:8000`.
- trailing slashes are trimmed.

Run:

```bash
cd apps/web
node --test src/lib/apiBase.test.mjs
```

Expected: fail because the helper does not exist yet.

**Step 2: Implement runtime resolution**

Add a helper that reads:

- `process.env.NEXT_PUBLIC_API_BASE_URL`
- `globalThis.__ARTICLE_PROCESSOR_CONFIG__?.apiBaseUrl`
- default `http://localhost:8000`

Set `output: "standalone"` in `next.config.js`.

**Step 3: Verify**

Run:

```bash
cd apps/web
node --test src/lib/apiBase.test.mjs
npm test
npm run build
```

Expected: pass.

### Task 4: Electron Desktop App

**Files:**
- Create: `apps/desktop/package.json`
- Create: `apps/desktop/src/main.js`
- Create: `apps/desktop/src/runtimeConfig.js`
- Create: `apps/desktop/src/ports.js`
- Create: `apps/desktop/test/desktop.test.js`
- Create: `apps/desktop/assets/icon.svg`

**Step 1: Write failing tests**

Test pure Node helpers:

- `getFreePort()` returns an available port.
- `writeRuntimeConfig()` writes `window.__ARTICLE_PROCESSOR_CONFIG__`.
- sidecar path resolution uses packaged resources when `app.isPackaged` is true and repo paths in development.

Run:

```bash
cd apps/desktop
npm test
```

Expected: fail because the desktop app does not exist.

**Step 2: Implement Electron shell**

Add Electron main process that:

- creates app data/log directories.
- chooses API and web ports.
- starts backend executable in packaged mode or `python -m uvicorn app.main:app` in development.
- writes `apps/web/public/desktop-config.js` in development and the standalone public dir in packaged mode.
- starts Next standalone server in packaged mode or points at dev URL in development.
- waits for readiness.
- opens a `BrowserWindow`.
- shuts down children on quit.

**Step 3: Verify**

Run:

```bash
cd apps/desktop
npm test
```

Expected: pass.

### Task 5: Build Scripts and Release Workflow

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Create: `scripts/build-desktop.ps1`
- Create: `.github/workflows/release-desktop.yml`
- Create: `docs/desktop-release.md`

**Step 1: Add scripts**

Root scripts:

```json
{
  "scripts": {
    "desktop:install": "npm --prefix apps/web ci && npm --prefix apps/desktop ci",
    "desktop:test": "npm --prefix apps/desktop test",
    "desktop:build": "powershell -ExecutionPolicy Bypass -File scripts/build-desktop.ps1"
  }
}
```

**Step 2: Add release workflow**

Workflow should:

- trigger on `workflow_dispatch` and tags `v*`.
- run matrix `windows-latest`, `macos-latest`, `ubuntu-latest`.
- install Python 3.12 and Node 22.
- run backend tests and frontend tests/build.
- build PyInstaller backend.
- build Next standalone frontend.
- run Electron tests.
- run electron-builder for the current OS.
- upload artifacts.
- attach artifacts to a GitHub Release on tag pushes.

**Step 3: Add docs**

Document local packaging commands, release tag flow, data directory behavior, and known unsigned-app notes.

### Task 6: Full Verification

Run:

```bash
cd services/api
python -m pytest app/tests/test_desktop_config.py app/tests/test_desktop_launcher.py app/tests/test_quick_start_scripts.py -v
```

Run:

```bash
cd apps/web
npm test
npm run build
```

Run:

```bash
cd apps/desktop
npm test
```

Run:

```bash
git diff --check
```

Expected: all pass with no whitespace errors.
