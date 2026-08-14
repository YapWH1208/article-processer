function hasProviderDetails(modelInfo) {
  if (!modelInfo || modelInfo.mock) return true;
  return Boolean(
    modelInfo.llmProvider &&
    modelInfo.llmProvider !== "unknown" &&
    modelInfo.llmModel &&
    modelInfo.llmModel !== "unknown",
  );
}

export function createUploadSetupChecklist({
  modelInfo,
  runAI,
  queueRestored,
  restoredCount = 0,
  backendState = modelInfo ? "ready" : "checking",
}) {
  const backendReady = backendState === "ready" && Boolean(modelInfo);
  const backendUnavailable = backendState === "unavailable";
  const providerReady = hasProviderDetails(modelInfo);
  const aiReady = Boolean(runAI && backendReady && providerReady);
  const needsProviderSetup = Boolean(runAI && backendReady && !providerReady);

  const items = [
    {
      id: "backend",
      label: "Local API",
      state: backendReady ? "complete" : backendUnavailable ? "error" : "pending",
      detail: backendReady
        ? "Connected and ready to receive uploads."
        : backendUnavailable
          ? "Connection failed. Start the local API, then retry."
          : "Checking the backend health endpoint.",
    },
    {
      id: "ai",
      label: "AI pipeline",
      state: !runAI ? "warning" : aiReady ? "complete" : needsProviderSetup ? "warning" : "pending",
      detail: !runAI
        ? "Extraction, embeddings, and graph creation are off."
        : !backendReady
          ? backendUnavailable
            ? "AI readiness cannot be checked until the local API reconnects."
            : "Waiting for model status from the backend."
          : needsProviderSetup
            ? "Choose a provider and model before relying on AI extraction."
            : modelInfo?.mock
              ? "Mock AI is ready for deterministic local processing."
              : `${modelInfo.llmProviderName || modelInfo.llmProvider}: ${modelInfo.llmModel}`,
    },
    {
      id: "queue",
      label: "Upload queue",
      state: queueRestored ? "complete" : "pending",
      detail: !queueRestored
        ? "Restoring local upload progress."
        : restoredCount > 0
          ? `${restoredCount} active upload${restoredCount === 1 ? "" : "s"} restored.`
          : "Queue checked — no active uploads to restore.",
    },
  ];

  const readyCount = items.filter((item) => item.state === "complete").length;
  const primaryMessage = backendUnavailable
    ? "Local API unavailable"
    : !backendReady
      ? "Checking local backend"
    : !runAI
      ? "Upload only mode"
      : needsProviderSetup
        ? "Provider setup needed"
        : modelInfo?.mock
          ? "Ready with Mock AI"
          : `Ready with ${modelInfo.llmModel}`;

  return {
    items,
    readyCount,
    total: items.length,
    primaryMessage,
    needsProviderSetup,
    backendReady,
    backendUnavailable,
  };
}
