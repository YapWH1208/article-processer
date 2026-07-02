const fs = require("node:fs");
const path = require("node:path");

function runtimeConfigSource(config) {
  return `window.__ARTICLE_PROCESSOR_CONFIG__ = ${JSON.stringify(config)};\n`;
}

function writeRuntimeConfig(publicDir, config) {
  fs.mkdirSync(publicDir, { recursive: true });
  const filePath = path.join(publicDir, "desktop-config.js");
  fs.writeFileSync(filePath, runtimeConfigSource(config), "utf-8");
  return filePath;
}

module.exports = { runtimeConfigSource, writeRuntimeConfig };
