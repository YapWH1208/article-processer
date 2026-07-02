const { contextBridge } = require("electron");

function readApiBaseUrl() {
  const prefix = "--article-processor-api-base-url=";
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : "";
}

contextBridge.exposeInMainWorld("__ARTICLE_PROCESSOR_CONFIG__", {
  apiBaseUrl: readApiBaseUrl(),
});
