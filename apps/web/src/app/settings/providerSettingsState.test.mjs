import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderUpdatePayload,
  canContinueProviderAddStep,
  createProviderEditDraft,
  getProviderAddWizardSteps,
} from "./providerSettingsState.mjs";

test("provider edit draft never pre-fills the masked API key", () => {
  const draft = createProviderEditDraft({
    id: "provider-1",
    name: "OpenRouter",
    type: "openrouter",
    api_key: "********1234",
    base_url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    protocol: "openai",
  });

  assert.deepEqual(draft, {
    name: "OpenRouter",
    type: "openrouter",
    api_key: "",
    base_url: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4.1-mini",
    protocol: "openai",
  });
});

test("provider update payload keeps existing API key when edit key is blank", () => {
  assert.deepEqual(
    buildProviderUpdatePayload({
      name: "OpenRouter Updated",
      type: "openrouter",
      api_key: "   ",
      base_url: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-sonnet-4",
      protocol: "openai",
    }),
    {
      name: "OpenRouter Updated",
      type: "openrouter",
      base_url: "https://openrouter.ai/api/v1",
      model: "anthropic/claude-sonnet-4",
      protocol: "openai",
    }
  );
});

test("provider update payload includes a newly entered API key", () => {
  assert.deepEqual(
    buildProviderUpdatePayload({
      name: "Custom Endpoint",
      type: "custom",
      api_key: " new-key ",
      base_url: "http://localhost:11434/v1",
      model: "llama3.1:8b",
      protocol: "openai",
    }),
    {
      name: "Custom Endpoint",
      type: "custom",
      api_key: "new-key",
      base_url: "http://localhost:11434/v1",
      model: "llama3.1:8b",
      protocol: "openai",
    }
  );
});

test("provider add wizard asks for provider name first and model name last", () => {
  assert.deepEqual(
    getProviderAddWizardSteps({ type: "openai" }),
    ["name", "type", "api_key", "base_url", "model"]
  );
});

test("provider add wizard includes protocol question only for custom endpoints", () => {
  assert.deepEqual(
    getProviderAddWizardSteps({ type: "custom" }),
    ["name", "type", "protocol", "api_key", "base_url", "model"]
  );
});

test("provider add wizard requires a name and model before continuing", () => {
  assert.equal(canContinueProviderAddStep({ name: "   " }, "name"), false);
  assert.equal(canContinueProviderAddStep({ name: "OpenRouter" }, "name"), true);
  assert.equal(canContinueProviderAddStep({ model: "" }, "model"), false);
  assert.equal(canContinueProviderAddStep({ model: "openai/gpt-4.1-mini" }, "model"), true);
});
