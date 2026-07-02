# Desktop Release

Article Processor can be packaged as a desktop app for Windows, macOS, and Linux. The desktop build uses Electron for the app window, a PyInstaller-built FastAPI sidecar for the API, and the existing Next.js standalone server for the frontend.

## Local Build

Prerequisites:

- Python 3.12
- Node.js 22
- PowerShell. Windows uses Windows PowerShell; macOS/Linux require PowerShell 7 (`pwsh`).

Build everything locally:

```powershell
npm run desktop:build
```

Skip dependency installation when the environment is already prepared:

```powershell
npm run desktop:build -- -SkipInstall
```

Artifacts are written to `apps/desktop/dist/`.

## GitHub Release Flow

The desktop release workflow runs on tags that start with `v` and can also be run manually from GitHub Actions.

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow builds on:

- `windows-latest`
- `macos-latest`
- `ubuntu-latest`

Each matrix job uploads its desktop artifacts. On tag builds, a release job attaches those artifacts to the GitHub Release for the tag.

## Runtime Model

When the desktop app opens, Electron:

1. creates the user data directory
2. selects free localhost ports for the backend and frontend
3. starts the FastAPI backend sidecar
4. starts the Next.js standalone server
5. exposes the selected API URL to the frontend through the Electron preload script
6. opens the desktop window

The frontend and backend still communicate over localhost, but no browser tab is opened.

## Data Directory

Electron passes `ARTICLE_PROCESSOR_DESKTOP_DATA_DIR` to the backend. The backend stores mutable files under that directory:

- SQLite database: `data/app.sqlite3`
- uploads: `storage/uploads`
- parsed markdown: `storage/markdown`
- exports: `storage/exports`
- extracted images: `storage/images`
- logs: `logs`

Typical user data locations:

- Windows: `%APPDATA%/Article Processor`
- macOS: `~/Library/Application Support/Article Processor`
- Linux: `~/.config/Article Processor` or `$XDG_CONFIG_HOME/Article Processor`

## Signing Notes

The default workflow creates unsigned desktop artifacts. Users may see platform warnings on first launch. Add code-signing certificates and notarization credentials later if a signed public distribution is required.
