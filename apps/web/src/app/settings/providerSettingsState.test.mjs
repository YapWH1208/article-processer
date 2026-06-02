import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProviderUpdatePayload,
  createProviderEditDraft,
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
