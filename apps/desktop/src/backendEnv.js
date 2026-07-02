function buildBackendEnv(processEnv, { apiPort, dataDir }) {
  return {
    ...processEnv,
    ARTICLE_PROCESSOR_DESKTOP_DATA_DIR: dataDir,
    DATABASE_URL: "sqlite:///./data/app.sqlite3",
    HOST: "127.0.0.1",
    PORT: String(apiPort),
    STORAGE_DIR: "./storage",
  };
}

module.exports = { buildBackendEnv };
