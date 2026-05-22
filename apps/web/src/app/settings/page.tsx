"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────

interface Settings {
  ai_provider: string;
  openai_api_key: string;
  openai_model: string;
  openai_embedding_model: string;
  anthropic_api_key: string;
  anthropic_model: string;
  custom_api_base: string;
  custom_api_key: string;
  custom_model: string;
  use_mock_ai: boolean;
  max_upload_mb: number;
  host: string;
  port: number;
  env_path: string;
}

interface ProviderDef {
  value: string;
  label: string;
  description: string;
}

const PROVIDERS: ProviderDef[] = [
  {
    value: "openai",
    label: "OpenAI",
    description: "Official OpenAI API — GPT-4.1, GPT-4o, GPT-4 Turbo",
  },
  {
    value: "anthropic",
    label: "Anthropic",
    description: "Official Anthropic API — Claude Sonnet, Haiku, Opus",
  },
  {
    value: "custom_openai",
    label: "Custom (OpenAI protocol)",
    description:
      "Any OpenAI-compatible endpoint — Ollama, vLLM, LocalAI, Groq, OpenRouter, LiteLLM proxy",
  },
  {
    value: "custom_anthropic",
    label: "Custom (Anthropic protocol)",
    description:
      "Any Anthropic-compatible endpoint — LiteLLM proxy, OpenRouter",
  },
];

const OPENAI_MODELS = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini — fast, cheap, good" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano — fastest, cheapest" },
  { value: "gpt-4o", label: "GPT-4o — best overall" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini — balanced" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo — legacy, reliable" },
];

const ANTHROPIC_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4 — best balance" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet — fast" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku — fastest" },
  { value: "claude-3-opus-latest", label: "Claude 3 Opus — most capable" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4 — top tier" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "text-embedding-3-small — 1536d, cheap" },
  { value: "text-embedding-3-large", label: "text-embedding-3-large — 3072d, better" },
  { value: "text-embedding-ada-002", label: "text-embedding-ada-002 — legacy" },
];

// ── Component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable state
  const [provider, setProvider] = useState("openai");
  const [openaiKey, setOpenaiKey] = useState("");
  const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-4.1-mini");
  const [openaiEmbeddingModel, setOpenaiEmbeddingModel] = useState("text-embedding-3-small");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [anthropicKeyTouched, setAnthropicKeyTouched] = useState(false);
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");
  const [customBase, setCustomBase] = useState("");
  const [customKey, setCustomKey] = useState("");
  const [customKeyTouched, setCustomKeyTouched] = useState(false);
  const [customModel, setCustomModel] = useState("");
  const [mockAi, setMockAi] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(50);

  // Derived
  const isCustom = provider === "custom_openai" || provider === "custom_anthropic";

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      const data: Settings = await res.json();
      setSettings(data);
      setProvider(data.ai_provider);
      setOpenaiKey(data.openai_api_key);
      setOpenaiModel(data.openai_model);
      setOpenaiEmbeddingModel(data.openai_embedding_model);
      setAnthropicKey(data.anthropic_api_key);
      setAnthropicModel(data.anthropic_model);
      setCustomBase(data.custom_api_base);
      setCustomKey(data.custom_api_key);
      setCustomModel(data.custom_model);
      setMockAi(data.use_mock_ai);
      setMaxUploadMb(data.max_upload_mb);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const body: Record<string, unknown> = {
        ai_provider: provider,
        openai_model: openaiModel,
        openai_embedding_model: openaiEmbeddingModel,
        anthropic_model: anthropicModel,
        custom_api_base: customBase,
        custom_model: customModel,
        use_mock_ai: mockAi,
        max_upload_mb: maxUploadMb,
      };
      if (openaiKeyTouched) body.openai_api_key = openaiKey;
      if (anthropicKeyTouched) body.anthropic_api_key = anthropicKey;
      if (customKeyTouched) body.custom_api_key = customKey;

      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to save settings");
      }
      const data: Settings = await res.json();
      setSettings(data);
      setOpenaiKey(data.openai_api_key);
      setOpenaiKeyTouched(false);
      setAnthropicKey(data.anthropic_api_key);
      setAnthropicKeyTouched(false);
      setCustomKey(data.custom_api_key);
      setCustomKeyTouched(false);
      setSuccess("Settings saved — changes take effect on the next request.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3" />
          <div className="h-60 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">⚙️ Settings</h1>
      <p className="text-sm text-gray-500 mb-6">
        Configuration stored in{" "}
        <code className="bg-gray-100 px-1 rounded text-xs">
          {settings?.env_path || ".env"}
        </code>
        . Changes take effect on the next request.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-100">
        {/* ── Provider Selector ──────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">🤖 AI Provider</h2>

          <div className="space-y-2 mb-4">
            {PROVIDERS.map((p) => (
              <label
                key={p.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  provider === p.value
                    ? "border-primary-500 bg-primary-50"
                    : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.value}
                  checked={provider === p.value}
                  onChange={(e) => setProvider(e.target.value)}
                  className="mt-0.5"
                />
                <div>
                  <span className="text-sm font-medium text-gray-800">
                    {p.label}
                  </span>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {p.description}
                  </p>
                </div>
              </label>
            ))}
          </div>

          {/* ── OpenAI fields ──────────────────────────────────── */}
          {(provider === "openai" || provider === "custom_openai") && (
            <div className="ml-1 space-y-3 pl-4 border-l-2 border-primary-200">
              {provider === "openai" ? (
                <>
                  <ApiKeyField
                    label="OpenAI API Key"
                    value={openaiKey}
                    savedMasked={settings?.openai_api_key}
                    touched={openaiKeyTouched}
                    onChange={(v) => { setOpenaiKey(v); setOpenaiKeyTouched(true); }}
                    onFocus={() => { if (!openaiKeyTouched) setOpenaiKey(""); }}
                    placeholder="sk-..."
                  />
                  <SelectField
                    label="Model"
                    value={openaiModel}
                    onChange={setOpenaiModel}
                    options={OPENAI_MODELS}
                  />
                  <SelectField
                    label="Embedding Model"
                    value={openaiEmbeddingModel}
                    onChange={setOpenaiEmbeddingModel}
                    options={EMBEDDING_MODELS}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="API Base URL"
                    value={customBase}
                    onChange={setCustomBase}
                    placeholder="http://localhost:11434/v1"
                  />
                  <ApiKeyField
                    label="API Key"
                    value={customKey}
                    savedMasked={settings?.custom_api_key}
                    touched={customKeyTouched}
                    onChange={(v) => { setCustomKey(v); setCustomKeyTouched(true); }}
                    onFocus={() => { if (!customKeyTouched) setCustomKey(""); }}
                    placeholder="ollama or your-api-key"
                  />
                  <TextField
                    label="Model Name"
                    value={customModel}
                    onChange={setCustomModel}
                    placeholder="llama3.1:8b"
                  />
                  <p className="text-xs text-gray-400">
                    Embeddings use this same endpoint if it supports
                    <code className="mx-1 bg-gray-100 px-1 rounded">/v1/embeddings</code>.
                  </p>
                </>
              )}
            </div>
          )}

          {/* ── Anthropic fields ────────────────────────────────── */}
          {(provider === "anthropic" || provider === "custom_anthropic") && (
            <div className="ml-1 space-y-3 pl-4 border-l-2 border-orange-200">
              {provider === "anthropic" ? (
                <>
                  <ApiKeyField
                    label="Anthropic API Key"
                    value={anthropicKey}
                    savedMasked={settings?.anthropic_api_key}
                    touched={anthropicKeyTouched}
                    onChange={(v) => { setAnthropicKey(v); setAnthropicKeyTouched(true); }}
                    onFocus={() => { if (!anthropicKeyTouched) setAnthropicKey(""); }}
                    placeholder="sk-ant-..."
                  />
                  <SelectField
                    label="Model"
                    value={anthropicModel}
                    onChange={setAnthropicModel}
                    options={ANTHROPIC_MODELS}
                  />
                </>
              ) : (
                <>
                  <TextField
                    label="API Base URL"
                    value={customBase}
                    onChange={setCustomBase}
                    placeholder="https://your-proxy.example.com"
                  />
                  <ApiKeyField
                    label="API Key"
                    value={customKey}
                    savedMasked={settings?.custom_api_key}
                    touched={customKeyTouched}
                    onChange={(v) => { setCustomKey(v); setCustomKeyTouched(true); }}
                    onFocus={() => { if (!customKeyTouched) setCustomKey(""); }}
                    placeholder="your-api-key"
                  />
                  <TextField
                    label="Model Name"
                    value={customModel}
                    onChange={setCustomModel}
                    placeholder="claude-sonnet-4-20250514"
                  />
                </>
              )}
            </div>
          )}
        </div>

        {/* ── Behaviour ────────────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">⚡ Behaviour</h2>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={mockAi}
              onChange={(e) => setMockAi(e.target.checked)}
              className="w-4 h-4 text-primary-600 rounded focus:ring-primary-500"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Mock AI Mode
              </span>
              <p className="text-xs text-gray-400">
                When enabled, uses regex-based extraction instead of calling
                any LLM. Works offline — no API key needed. Turn off to use the
                provider selected above.
              </p>
            </div>
          </label>
        </div>

        {/* ── Limits ───────────────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">📏 Limits</h2>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Max Upload Size (MB)
            </span>
            <input
              type="number"
              value={maxUploadMb}
              onChange={(e) => setMaxUploadMb(Number(e.target.value))}
              min={1} max={500}
              className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-400 ml-2">1–500 MB</span>
          </label>
        </div>

        {/* ── Server Info ──────────────────────────────────────── */}
        <div className="p-5 bg-gray-50 rounded-b-lg">
          <h2 className="font-semibold mb-3 text-gray-500">🔒 Server (read-only)</h2>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
            <span>Host</span><code className="text-xs">{settings?.host || "—"}</code>
            <span>Port</span><code className="text-xs">{settings?.port || "—"}</code>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3 items-center">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 font-medium text-sm"
        >
          {saving ? "Saving..." : "Save Settings"}
        </button>
        <button
          onClick={loadSettings}
          className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 rounded-lg border border-gray-200 hover:border-gray-300"
        >
          Reset
        </button>
      </div>
    </div>
  );
}

// ── Reusable field components ─────────────────────────────────────────────

function ApiKeyField({
  label, value, savedMasked, touched, onChange, onFocus, placeholder,
}: {
  label: string;
  value: string;
  savedMasked?: string;
  touched: boolean;
  onChange: (v: string) => void;
  onFocus: () => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type="password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={!touched && savedMasked ? `Using saved key: ${savedMasked}` : placeholder}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}

function SelectField({
  label, value, onChange, options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function TextField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
      />
    </label>
  );
}
