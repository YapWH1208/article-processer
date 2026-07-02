const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { app, BrowserWindow, dialog } = require("electron");

const { getBackendExecutablePath, getRepoRoot, getWebPublicDir, getWebServerPath, getWebRoot } = require("./paths");
const { getFreePort } = require("./ports");
const { writeRuntimeConfig } = require("./runtimeConfig");

const children = new Set();

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function logFileFor(logDir, name) {
  ensureDir(logDir);
  return fs.openSync(path.join(logDir, `${name}.log`), "a");
}

function spawnManaged(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: ["ignore", logFileFor(options.logDir, options.name), logFileFor(options.logDir, options.name)],
    windowsHide: true,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  return child;
}

function waitForHttp(url, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;

  return new Promise((resolve, reject) => {
    function attempt() {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) {
          resolve();
          return;
        }
        retry();
      });
      req.on("error", retry);
      req.setTimeout(1000, () => {
        req.destroy();
        retry();
      });
    }

    function retry() {
      if (Date.now() > deadline) {
        reject(new Error(`Timed out waiting for ${url}`));
        return;
      }
      setTimeout(attempt, 250);
    }

    attempt();
  });
}

function startBackend(apiPort, dataDir, logDir) {
  const env = {
    ...process.env,
    ARTICLE_PROCESSOR_DESKTOP_DATA_DIR: dataDir,
    DATABASE_URL: "sqlite:///./data/app.sqlite3",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    STORAGE_DIR: "./storage",
    USE_MOCK_AI: process.env.USE_MOCK_AI || "true",
  };

  if (app.isPackaged) {
    const executable = getBackendExecutablePath(app);
    return spawnManaged(executable, [], {
      cwd: path.dirname(executable),
      env,
      logDir,
      name: "backend",
    });
  }

  const python = process.env.PYTHON || (process.platform === "win32" ? "python.exe" : "python3");
  return spawnManaged(
    python,
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(apiPort)],
    {
      cwd: path.join(getRepoRoot(), "services", "api"),
      env,
      logDir,
      name: "backend",
    }
  );
}

function startWeb(webPort, apiBaseUrl, logDir) {
  if (!app.isPackaged) {
    writeRuntimeConfig(getWebPublicDir(app), { apiBaseUrl });
  }

  const serverPath = getWebServerPath(app);
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    PORT: String(webPort),
  };

  return spawnManaged(process.execPath, [serverPath], {
    cwd: getWebRoot(app),
    env,
    logDir,
    name: "web",
  });
}

function createWindow(webUrl, apiBaseUrl) {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: "Article Processor",
    webPreferences: {
      additionalArguments: [`--article-processor-api-base-url=${apiBaseUrl}`],
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });
  win.loadURL(webUrl);
  return win;
}

async function start() {
  const dataDir = ensureDir(app.getPath("userData"));
  const logDir = ensureDir(path.join(dataDir, "logs"));
  const apiPort = await getFreePort();
  const webPort = await getFreePort();
  const apiBaseUrl = `http://127.0.0.1:${apiPort}`;
  const webUrl = `http://127.0.0.1:${webPort}`;

  startBackend(apiPort, dataDir, logDir);
  await waitForHttp(`${apiBaseUrl}/health`);

  startWeb(webPort, apiBaseUrl, logDir);
  await waitForHttp(webUrl);

  createWindow(webUrl, apiBaseUrl);
}

function stopChildren() {
  for (const child of children) {
    child.kill();
  }
}

app.whenReady().then(() => {
  start().catch((error) => {
    dialog.showErrorBox(
      "Article Processor failed to start",
      `${error.message}\n\nLogs: ${path.join(app.getPath("userData"), "logs")}`
    );
    app.quit();
  });
});

app.on("before-quit", stopChildren);
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    start().catch((error) => dialog.showErrorBox("Article Processor failed to start", error.message));
  }
});
