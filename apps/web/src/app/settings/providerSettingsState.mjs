const BASE_PROVIDER_ADD_STEPS = ["name", "type", "api_key", "base_url", "model"];

export function createProviderEditDraft(provider) {
  return {
    name: provider?.name || "",
    type: provider?.type || "openai",
    api_key: "",
    base_url: provider?.base_url || "",
    model: provider?.model || "",
    protocol: provider?.protocol || (provider?.type === "anthropic" ? "anthropic" : "openai"),
  };
}

export function buildProviderUpdatePayload(draft) {
  const payload = {
    name: (draft?.name || "").trim(),
    type: draft?.type || "openai",
    base_url: draft?.base_url || "",
    model: draft?.model || "",
    protocol: draft?.protocol || (draft?.type === "anthropic" ? "anthropic" : "openai"),
  };

  const apiKey = (draft?.api_key || "").trim();
  if (apiKey) {
    payload.api_key = apiKey;
  }

  return payload;
}

export function getProviderAddWizardSteps(draft) {
  if (draft?.type === "custom") {
    return ["name", "type", "protocol", "api_key", "base_url", "model"];
  }

  return BASE_PROVIDER_ADD_STEPS;
}

export function canContinueProviderAddStep(draft, step) {
  if (step === "name") {
    return Boolean((draft?.name || "").trim());
  }

  if (step === "model") {
    return Boolean((draft?.model || "").trim());
  }

  return true;
}
