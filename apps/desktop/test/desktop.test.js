const assert = require("node:assert/strict");
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { getBackendExecutablePath, getRepoRoot, getWebPublicDir, getWebServerPath } = require("../src/paths");
const { getFreePort } = require("../src/ports");
const { writeRuntimeConfig } = require("../src/runtimeConfig");

test("getFreePort returns a bindable local port", async () => {
  const port = await getFreePort();

  await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.close(resolve);
    });
  });
});

test("writeRuntimeConfig writes the desktop API URL", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "article-processor-config-"));

  const filePath = writeRuntimeConfig(tempDir, { apiBaseUrl: "http://127.0.0.1:4567" });

  assert.equal(filePath, path.join(tempDir, "desktop-config.js"));
  assert.match(fs.readFileSync(filePath, "utf-8"), /window\.__ARTICLE_PROCESSOR_CONFIG__/);
  assert.match(fs.readFileSync(filePath, "utf-8"), /http:\/\/127\.0\.0\.1:4567/);
});

test("sidecar paths use packaged resources in packaged mode", () => {
  const resourcesPath = path.join("C:", "Program Files", "Article Processor", "resources");
  const fakeApp = { isPackaged: true };

  assert.equal(
    getBackendExecutablePath(fakeApp, { platform: "win32", resourcesPath }),
    path.join(resourcesPath, "backend", "article-processor-api.exe")
  );
  assert.equal(
    getBackendExecutablePath(fakeApp, { platform: "linux", resourcesPath }),
    path.join(resourcesPath, "backend", "article-processor-api")
  );
  assert.equal(
    getWebServerPath(fakeApp, { resourcesPath }),
    path.join(resourcesPath, "web", "server.js")
  );
  assert.equal(
    getWebPublicDir(fakeApp, { resourcesPath }),
    path.join(resourcesPath, "web", "public")
  );
});

test("sidecar paths use repo build outputs in development", () => {
  const repoRoot = getRepoRoot();
  const fakeApp = { isPackaged: false };

  assert.equal(
    getBackendExecutablePath(fakeApp, { platform: "win32" }),
    path.join(repoRoot, "services", "api", "dist", "article-processor-api", "article-processor-api.exe")
  );
  assert.equal(
    getWebServerPath(fakeApp),
    path.join(repoRoot, "apps", "web", ".next", "standalone", "server.js")
  );
  assert.equal(
    getWebPublicDir(fakeApp),
    path.join(repoRoot, "apps", "web", "public")
  );
});
