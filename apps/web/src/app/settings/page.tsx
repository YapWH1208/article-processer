"use client";

import { useState, useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface Settings {
  openai_api_key: string;
  openai_model: string;
  openai_embedding_model: string;
  use_mock_ai: boolean;
  max_upload_mb: number;
  host: string;
  port: number;
  env_path: string;
}

const MODELS = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini — fast, cheap, good" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano — fastest, cheapest" },
  { value: "gpt-4o", label: "GPT-4o — best overall" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini — balanced" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo — legacy, reliable" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "text-embedding-3-small — 1536d, cheap" },
  { value: "text-embedding-3-large", label: "text-embedding-3-large — 3072d, better" },
  { value: "text-embedding-ada-002", label: "text-embedding-ada-002 — legacy" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Editable fields
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [mockAi, setMockAi] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(50);
  const [keyTouched, setKeyTouched] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load settings");
      const data: Settings = await res.json();
      setSettings(data);
      setApiKey(data.openai_api_key);
      setModel(data.openai_model);
      setEmbeddingModel(data.openai_embedding_model);
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
      const body: Record<string, unknown> = {};
      if (keyTouched) body.openai_api_key = apiKey;
      body.openai_model = model;
      body.openai_embedding_model = embeddingModel;
      body.use_mock_ai = mockAi;
      body.max_upload_mb = maxUploadMb;

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
      setApiKey(data.openai_api_key);
      setKeyTouched(false);
      setSuccess("Settings saved — changes are live.");
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
          <div className="h-40 bg-gray-200 rounded" />
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div className="max-w-2xl mx-auto mt-8">
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
          <button onClick={loadSettings} className="ml-4 underline text-sm">
            Retry
          </button>
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
        . Changes take effect immediately.
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
        {/* ── AI Provider ──────────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">🤖 AI Provider</h2>

          <label className="block mb-2">
            <span className="text-sm font-medium text-gray-700">
              OpenAI API Key
            </span>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setKeyTouched(true);
              }}
              onFocus={() => {
                if (!keyTouched) setApiKey("");
              }}
              placeholder={
                settings?.openai_api_key
                  ? "Using saved key (click to edit)"
                  : "sk-..."
              }
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-400 mt-1 block">
              {settings?.openai_api_key && !keyTouched
                ? `Current key: ${settings.openai_api_key}`
                : "Paste your OpenAI API key"}
            </span>
          </label>

          <label className="block mb-2">
            <span className="text-sm font-medium text-gray-700">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block mb-2">
            <span className="text-sm font-medium text-gray-700">
              Embedding Model
            </span>
            <select
              value={embeddingModel}
              onChange={(e) => setEmbeddingModel(e.target.value)}
              className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {EMBEDDING_MODELS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* ── Behaviour ────────────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">⚡ Behaviour</h2>

          <label className="flex items-center gap-3 mb-3 cursor-pointer">
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
                OpenAI. Works offline, no API key needed. Turn off to use real
                GPT-4 extraction.
              </p>
            </div>
          </label>
        </div>

        {/* ── Limits ───────────────────────────────────────────── */}
        <div className="p-5">
          <h2 className="font-semibold mb-3">📏 Limits</h2>

          <label className="block mb-2">
            <span className="text-sm font-medium text-gray-700">
              Max Upload Size (MB)
            </span>
            <input
              type="number"
              value={maxUploadMb}
              onChange={(e) => setMaxUploadMb(Number(e.target.value))}
              min={1}
              max={500}
              className="mt-1 w-32 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
            <span className="text-xs text-gray-400 ml-2">1–500 MB</span>
          </label>
        </div>

        {/* ── Server Info (read-only) ──────────────────────────── */}
        <div className="p-5 bg-gray-50 rounded-b-lg">
          <h2 className="font-semibold mb-3 text-gray-500">
            🔒 Server (read-only)
          </h2>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-500">
            <span>Host</span>
            <code className="text-xs">{settings?.host || "—"}</code>
            <span>Port</span>
            <code className="text-xs">{settings?.port || "—"}</code>
          </div>
        </div>
      </div>

      {/* ── Save ───────────────────────────────────────────────── */}
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
