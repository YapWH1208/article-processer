"use client";

import { useState, useEffect } from "react";
import { Save, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

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

const PROVIDERS = [
  { value: "openai", label: "OpenAI", desc: "GPT-4.1, GPT-4o, GPT-4 Turbo" },
  { value: "anthropic", label: "Anthropic", desc: "Claude Sonnet, Haiku, Opus" },
  { value: "custom_openai", label: "Custom (OpenAI protocol)", desc: "Ollama, vLLM, LocalAI, Groq, LiteLLM" },
  { value: "custom_anthropic", label: "Custom (Anthropic protocol)", desc: "LiteLLM proxy, OpenRouter" },
];

const OPENAI_MODELS = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-4o", label: "GPT-4o" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const ANTHROPIC_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { value: "claude-3-opus-latest", label: "Claude 3 Opus" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "3-small (1536d)" },
  { value: "text-embedding-3-large", label: "3-large (3072d)" },
  { value: "text-embedding-ada-002", label: "ada-002 (legacy)" },
];

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  const isCustom = provider === "custom_openai" || provider === "custom_anthropic";

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load");
      const d: Settings = await res.json();
      setSettings(d);
      setProvider(d.ai_provider);
      setOpenaiKey(d.openai_api_key);
      setOpenaiModel(d.openai_model);
      setOpenaiEmbeddingModel(d.openai_embedding_model);
      setAnthropicKey(d.anthropic_api_key);
      setAnthropicModel(d.anthropic_model);
      setCustomBase(d.custom_api_base);
      setCustomKey(d.custom_api_key);
      setCustomModel(d.custom_model);
      setMockAi(d.use_mock_ai);
      setMaxUploadMb(d.max_upload_mb);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
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
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      const d: Settings = await res.json();
      setSettings(d);
      setOpenaiKey(d.openai_api_key); setOpenaiKeyTouched(false);
      setAnthropicKey(d.anthropic_api_key); setAnthropicKeyTouched(false);
      setCustomKey(d.custom_api_key); setCustomKeyTouched(false);
      setSuccess("Saved — changes take effect on the next request.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="max-w-2xl mx-auto space-y-4"><Skeleton className="h-8 w-48"/><Skeleton className="h-80 w-full"/></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Stored in <code className="bg-muted px-1 rounded text-xs">{settings?.env_path || ".env"}</code>
        </p>
      </div>

      {error && <div className="p-3 rounded-md bg-destructive/10 border border-destructive/20 text-sm text-destructive">{error}</div>}
      {success && <div className="p-3 rounded-md bg-primary/5 border border-primary/20 text-sm text-primary">{success}</div>}

      {/* AI Provider */}
      <Card>
        <CardHeader>
          <CardTitle>AI Provider</CardTitle>
          <CardDescription>Choose your LLM backend.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2">
            {PROVIDERS.map((p) => (
              <label
                key={p.value}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  provider === p.value ? "border-primary bg-primary/5" : "hover:bg-accent"
                }`}
              >
                <input
                  type="radio"
                  name="provider"
                  value={p.value}
                  checked={provider === p.value}
                  onChange={(e) => setProvider(e.target.value)}
                  className="mt-1"
                />
                <div>
                  <p className="text-sm font-medium">{p.label}</p>
                  <p className="text-xs text-muted-foreground">{p.desc}</p>
                </div>
              </label>
            ))}
          </div>

          {/* Provider-specific fields */}
          {(provider === "openai" || provider === "custom_openai") && (
            <div className="pl-4 border-l-2 border-primary/30 space-y-3">
              {provider === "openai" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>OpenAI API Key</Label>
                    <Input
                      type="password"
                      value={openaiKey}
                      onChange={(e) => { setOpenaiKey(e.target.value); setOpenaiKeyTouched(true); }}
                      onFocus={() => { if (!openaiKeyTouched) setOpenaiKey(""); }}
                      placeholder={!openaiKeyTouched && settings?.openai_api_key ? `Using key: ${settings.openai_api_key}` : "sk-..."}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Select value={openaiModel} onValueChange={setOpenaiModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {OPENAI_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Embedding Model</Label>
                    <Select value={openaiEmbeddingModel} onValueChange={setOpenaiEmbeddingModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EMBEDDING_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>API Base URL</Label>
                    <Input value={customBase} onChange={(e) => setCustomBase(e.target.value)} placeholder="http://localhost:11434/v1" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>API Key</Label>
                    <Input
                      type="password"
                      value={customKey}
                      onChange={(e) => { setCustomKey(e.target.value); setCustomKeyTouched(true); }}
                      onFocus={() => { if (!customKeyTouched) setCustomKey(""); }}
                      placeholder="ollama or your-key"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model Name</Label>
                    <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="llama3.1:8b" />
                  </div>
                </>
              )}
            </div>
          )}

          {(provider === "anthropic" || provider === "custom_anthropic") && (
            <div className="pl-4 border-l-2 border-orange-400/30 space-y-3">
              {provider === "anthropic" ? (
                <>
                  <div className="space-y-1.5">
                    <Label>Anthropic API Key</Label>
                    <Input
                      type="password"
                      value={anthropicKey}
                      onChange={(e) => { setAnthropicKey(e.target.value); setAnthropicKeyTouched(true); }}
                      onFocus={() => { if (!anthropicKeyTouched) setAnthropicKey(""); }}
                      placeholder={!anthropicKeyTouched && settings?.anthropic_api_key ? `Using key: ${settings.anthropic_api_key}` : "sk-ant-..."}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Select value={anthropicModel} onValueChange={setAnthropicModel}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ANTHROPIC_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label>API Base URL</Label>
                    <Input value={customBase} onChange={(e) => setCustomBase(e.target.value)} placeholder="https://your-proxy.example.com" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>API Key</Label>
                    <Input type="password" value={customKey} onChange={(e) => { setCustomKey(e.target.value); setCustomKeyTouched(true); }} placeholder="your-key" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model Name</Label>
                    <Input value={customModel} onChange={(e) => setCustomModel(e.target.value)} placeholder="claude-sonnet-4-20250514" />
                  </div>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Behaviour */}
      <Card>
        <CardHeader>
          <CardTitle>Behaviour</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Mock AI Mode</p>
              <p className="text-xs text-muted-foreground">When on, uses regex extraction instead of calling any LLM. Works offline.</p>
            </div>
            <Switch checked={mockAi} onCheckedChange={setMockAi} />
          </div>
        </CardContent>
      </Card>

      {/* Limits */}
      <Card>
        <CardHeader>
          <CardTitle>Limits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label>Max Upload Size (MB)</Label>
            <Input type="number" value={maxUploadMb} onChange={(e) => setMaxUploadMb(Number(e.target.value))} min={1} max={500} className="w-32" />
          </div>
        </CardContent>
      </Card>

      {/* Server */}
      <Card>
        <CardHeader>
          <CardTitle className="text-muted-foreground">Server</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
            <span>Host</span><code className="text-xs">{settings?.host || "—"}</code>
            <span>Port</span><code className="text-xs">{settings?.port || "—"}</code>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? "Saving..." : "Save Settings"}
        </Button>
        <Button variant="outline" onClick={loadSettings} className="gap-2">
          <RotateCcw className="h-4 w-4" />
          Reset
        </Button>
      </div>
    </div>
  );
}
