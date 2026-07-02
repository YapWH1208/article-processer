const path = require("node:path");

function getRepoRoot() {
  return path.resolve(__dirname, "..", "..", "..");
}

function getResourcesPath(options = {}) {
  return options.resourcesPath || process.resourcesPath;
}

function executableName(platform = process.platform) {
  return platform === "win32" ? "article-processor-api.exe" : "article-processor-api";
}

function getBackendExecutablePath(electronApp, options = {}) {
  const platform = options.platform || process.platform;
  if (electronApp.isPackaged) {
    return path.join(getResourcesPath(options), "backend", executableName(platform));
  }
  return path.join(
    getRepoRoot(),
    "services",
    "api",
    "dist",
    "article-processor-api",
    executableName(platform)
  );
}

function getWebRoot(electronApp, options = {}) {
  if (electronApp.isPackaged) {
    return path.join(getResourcesPath(options), "web");
  }
  return path.join(getRepoRoot(), "apps", "web", ".next", "standalone");
}

function getWebServerPath(electronApp, options = {}) {
  return path.join(getWebRoot(electronApp, options), "server.js");
}

function getWebPublicDir(electronApp, options = {}) {
  if (electronApp.isPackaged) {
    return path.join(getWebRoot(electronApp, options), "public");
  }
  return path.join(getRepoRoot(), "apps", "web", "public");
}

module.exports = {
  getBackendExecutablePath,
  getRepoRoot,
  getWebPublicDir,
  getWebRoot,
  getWebServerPath,
};
