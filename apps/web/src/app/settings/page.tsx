"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Save, RotateCcw, Brain, Cpu, Settings2, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/animated";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────

interface Settings {
  llm_provider: string; llm_custom_protocol: string;
  llm_custom_base_url: string; llm_custom_api_key: string; llm_custom_model: string;
  openai_api_key: string; openai_model: string;
  anthropic_api_key: string; anthropic_model: string;
  embedding_provider: string;
  embedding_custom_base_url: string; embedding_custom_api_key: string; embedding_custom_model: string;
  openai_embedding_model: string;
  use_mock_ai: boolean; max_upload_mb: number;
  host: string; port: number; env_path: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const LLM_PROVIDERS = [
  { value: "openai", label: "OpenAI", desc: "GPT-4.1, GPT-4o, GPT-4 Turbo" },
  { value: "anthropic", label: "Anthropic", desc: "Claude Sonnet, Haiku, Opus" },
  { value: "custom", label: "Custom Endpoint", desc: "Any OpenAI or Anthropic compatible API" },
];

const OPENAI_MODELS = [
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini" }, { value: "gpt-4.1-nano", label: "GPT-4.1 Nano" },
  { value: "gpt-4o", label: "GPT-4o" }, { value: "gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "gpt-4-turbo", label: "GPT-4 Turbo" },
];

const ANTHROPIC_MODELS = [
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-5-sonnet-latest", label: "Claude 3.5 Sonnet" },
  { value: "claude-3-5-haiku-latest", label: "Claude 3.5 Haiku" },
  { value: "claude-3-opus-latest", label: "Claude 3 Opus" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
];

const EMBEDDING_PROVIDERS = [
  { value: "openai", label: "OpenAI", desc: "text-embedding-3-small, 3-large, ada-002" },
  { value: "custom", label: "Custom Endpoint", desc: "Any OpenAI-compatible embeddings API" },
];

const EMBEDDING_MODELS = [
  { value: "text-embedding-3-small", label: "3-small (1536d)" },
  { value: "text-embedding-3-large", label: "3-large (3072d)" },
  { value: "text-embedding-ada-002", label: "ada-002 (legacy)" },
];

// ── Reusable fields ──────────────────────────────────────────────────────

function RadioCards({ options, value, onChange }: {
  options: { value: string; label: string; desc: string }[];
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="grid gap-2">
      {options.map((o) => (
        <motion.label key={o.value} whileHover={{ scale: 1.01 }}
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            value === o.value ? "border-primary bg-primary/5" : "hover:bg-accent"
          }`}>
          <input type="radio" name={options[0].value} value={o.value}
            checked={value === o.value} onChange={() => onChange(o.value)} className="mt-1" />
          <div><p className="text-sm font-medium">{o.label}</p><p className="text-xs text-muted-foreground">{o.desc}</p></div>
        </motion.label>
      ))}
    </div>
  );
}

function KeyField({ label, value, savedMasked, touched, onChange, onFocus, placeholder }: {
  label: string; value: string; savedMasked?: string; touched: boolean;
  onChange: (v: string) => void; onFocus: () => void; placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input type="password" value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        placeholder={!touched && savedMasked ? `Using key: ${savedMasked}` : placeholder} />
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function SettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState("llm");

  // LLM state
  const [llmProvider, setLlmProvider] = useState("openai");
  const [llmCustomProtocol, setLlmCustomProtocol] = useState("openai");
  const [llmCustomBaseUrl, setLlmCustomBaseUrl] = useState("");
  const [llmCustomKey, setLlmCustomKey] = useState(""); const [llmCustomKeyTouched, setLlmCustomKeyTouched] = useState(false);
  const [llmCustomModel, setLlmCustomModel] = useState("");
  const [openaiKey, setOpenaiKey] = useState(""); const [openaiKeyTouched, setOpenaiKeyTouched] = useState(false);
  const [openaiModel, setOpenaiModel] = useState("gpt-4.1-mini");
  const [anthropicKey, setAnthropicKey] = useState(""); const [anthropicKeyTouched, setAnthropicKeyTouched] = useState(false);
  const [anthropicModel, setAnthropicModel] = useState("claude-sonnet-4-20250514");

  // Embedding state
  const [embeddingProvider, setEmbeddingProvider] = useState("openai");
  const [embeddingCustomBaseUrl, setEmbeddingCustomBaseUrl] = useState("");
  const [embeddingCustomKey, setEmbeddingCustomKey] = useState(""); const [embeddingCustomKeyTouched, setEmbeddingCustomKeyTouched] = useState(false);
  const [embeddingCustomModel, setEmbeddingCustomModel] = useState("");
  const [openaiEmbeddingModel, setOpenaiEmbeddingModel] = useState("text-embedding-3-small");

  // General state
  const [mockAi, setMockAi] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(50);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load");
      const d: Settings = await res.json();
      setSettings(d);
      // LLM
      setLlmProvider(d.llm_provider); setLlmCustomProtocol(d.llm_custom_protocol);
      setLlmCustomBaseUrl(d.llm_custom_base_url); setLlmCustomKey(d.llm_custom_api_key); setLlmCustomModel(d.llm_custom_model);
      setOpenaiKey(d.openai_api_key); setOpenaiModel(d.openai_model);
      setAnthropicKey(d.anthropic_api_key); setAnthropicModel(d.anthropic_model);
      // Embedding
      setEmbeddingProvider(d.embedding_provider);
      setEmbeddingCustomBaseUrl(d.embedding_custom_base_url); setEmbeddingCustomKey(d.embedding_custom_api_key); setEmbeddingCustomModel(d.embedding_custom_model);
      setOpenaiEmbeddingModel(d.openai_embedding_model);
      // General
      setMockAi(d.use_mock_ai); setMaxUploadMb(d.max_upload_mb);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load settings");
    } finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        llm_provider: llmProvider,
        llm_custom_protocol: llmCustomProtocol,
        llm_custom_base_url: llmCustomBaseUrl,
        llm_custom_model: llmCustomModel,
        openai_model: openaiModel,
        anthropic_model: anthropicModel,
        embedding_provider: embeddingProvider,
        embedding_custom_base_url: embeddingCustomBaseUrl,
        embedding_custom_model: embeddingCustomModel,
        openai_embedding_model: openaiEmbeddingModel,
        use_mock_ai: mockAi,
        max_upload_mb: maxUploadMb,
      };
      if (llmCustomKeyTouched) body.llm_custom_api_key = llmCustomKey;
      if (openaiKeyTouched) body.openai_api_key = openaiKey;
      if (anthropicKeyTouched) body.anthropic_api_key = anthropicKey;
      if (embeddingCustomKeyTouched) body.embedding_custom_api_key = embeddingCustomKey;

      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      const d: Settings = await res.json();
      setSettings(d);
      setLlmCustomKey(d.llm_custom_api_key); setLlmCustomKeyTouched(false);
      setOpenaiKey(d.openai_api_key); setOpenaiKeyTouched(false);
      setAnthropicKey(d.anthropic_api_key); setAnthropicKeyTouched(false);
      setEmbeddingCustomKey(d.embedding_custom_api_key); setEmbeddingCustomKeyTouched(false);
      toast.success("Settings saved — changes take effect on the next request.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="max-w-3xl mx-auto space-y-4"><Skeleton className="h-8 w-48"/><Skeleton className="h-96 w-full"/></div>;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <FadeIn>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Stored in <code className="bg-muted px-1 rounded text-xs">{settings?.env_path || ".env"}</code>
        </p>
      </FadeIn>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="llm" className="gap-1.5 flex-1"><Brain className="h-4 w-4"/>LLM</TabsTrigger>
          <TabsTrigger value="embeddings" className="gap-1.5 flex-1"><Cpu className="h-4 w-4"/>Embeddings</TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5 flex-1"><Settings2 className="h-4 w-4"/>General</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {/* ── LLM Tab ─────────────────────────────────────────── */}
          {tab === "llm" && (
            <motion.div key="llm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="llm" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>LLM Provider</CardTitle>
                    <CardDescription>Choose the language model for extraction, Q&A, and skills.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RadioCards options={LLM_PROVIDERS} value={llmProvider} onChange={setLlmProvider} />

                    {/* OpenAI fields */}
                    <AnimatePresence>
                      {llmProvider === "openai" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-primary/30 space-y-3 overflow-hidden">
                          <KeyField label="OpenAI API Key" value={openaiKey} savedMasked={settings?.openai_api_key}
                            touched={openaiKeyTouched} onChange={(v) => { setOpenaiKey(v); setOpenaiKeyTouched(true); }}
                            onFocus={() => { if (!openaiKeyTouched) setOpenaiKey(""); }} placeholder="sk-..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={openaiModel} onValueChange={setOpenaiModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{OPENAI_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Anthropic fields */}
                    <AnimatePresence>
                      {llmProvider === "anthropic" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-orange-400/30 space-y-3 overflow-hidden">
                          <KeyField label="Anthropic API Key" value={anthropicKey} savedMasked={settings?.anthropic_api_key}
                            touched={anthropicKeyTouched} onChange={(v) => { setAnthropicKey(v); setAnthropicKeyTouched(true); }}
                            onFocus={() => { if (!anthropicKeyTouched) setAnthropicKey(""); }} placeholder="sk-ant-..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={anthropicModel} onValueChange={setAnthropicModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{ANTHROPIC_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Custom fields */}
                    <AnimatePresence>
                      {llmProvider === "custom" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-purple-400/30 space-y-3 overflow-hidden">
                          <div className="space-y-1.5"><Label>Protocol</Label>
                            <Select value={llmCustomProtocol} onValueChange={setLlmCustomProtocol}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="openai">OpenAI-compatible</SelectItem>
                                <SelectItem value="anthropic">Anthropic-compatible</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>API Base URL</Label>
                            <Input value={llmCustomBaseUrl} onChange={(e) => setLlmCustomBaseUrl(e.target.value)}
                              placeholder="http://localhost:11434/v1" />
                          </div>
                          <KeyField label="API Key" value={llmCustomKey} savedMasked={settings?.llm_custom_api_key}
                            touched={llmCustomKeyTouched} onChange={(v) => { setLlmCustomKey(v); setLlmCustomKeyTouched(true); }}
                            onFocus={() => { if (!llmCustomKeyTouched) setLlmCustomKey(""); }} placeholder="ollama or your-key" />
                          <div className="space-y-1.5"><Label>Model Name</Label>
                            <Input value={llmCustomModel} onChange={(e) => setLlmCustomModel(e.target.value)}
                              placeholder="llama3.1:8b" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* ── Embeddings Tab ───────────────────────────────────── */}
          {tab === "embeddings" && (
            <motion.div key="embeddings" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="embeddings" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Embedding Provider</CardTitle>
                    <CardDescription>Choose the embedding model for semantic search.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RadioCards options={EMBEDDING_PROVIDERS} value={embeddingProvider} onChange={setEmbeddingProvider} />

                    <AnimatePresence>
                      {embeddingProvider === "openai" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-primary/30 space-y-3 overflow-hidden">
                          <div className="space-y-1.5">
                            <Label>Embedding Model</Label>
                            <Select value={openaiEmbeddingModel} onValueChange={setOpenaiEmbeddingModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{EMBEDDING_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Uses the same OpenAI API key configured in the LLM tab.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <AnimatePresence>
                      {embeddingProvider === "custom" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-purple-400/30 space-y-3 overflow-hidden">
                          <div className="space-y-1.5"><Label>API Base URL</Label>
                            <Input value={embeddingCustomBaseUrl} onChange={(e) => setEmbeddingCustomBaseUrl(e.target.value)}
                              placeholder="http://localhost:11434/v1" />
                          </div>
                          <KeyField label="API Key" value={embeddingCustomKey} savedMasked={settings?.embedding_custom_api_key}
                            touched={embeddingCustomKeyTouched} onChange={(v) => { setEmbeddingCustomKey(v); setEmbeddingCustomKeyTouched(true); }}
                            onFocus={() => { if (!embeddingCustomKeyTouched) setEmbeddingCustomKey(""); }} placeholder="ollama or your-key" />
                          <div className="space-y-1.5"><Label>Model Name</Label>
                            <Input value={embeddingCustomModel} onChange={(e) => setEmbeddingCustomModel(e.target.value)}
                              placeholder="nomic-embed-text" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* ── General Tab ──────────────────────────────────────── */}
          {tab === "general" && (
            <motion.div key="general" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="general" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle>Behaviour</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between">
                      <div><p className="text-sm font-medium">Mock AI Mode</p><p className="text-xs text-muted-foreground">Offline regex extraction — no API key needed.</p></div>
                      <Switch checked={mockAi} onCheckedChange={setMockAi}/>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Limits</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <Label>Max Upload Size (MB)</Label>
                      <Input type="number" value={maxUploadMb} onChange={(e) => setMaxUploadMb(Number(e.target.value))} min={1} max={500} className="w-32"/>
                    </div>
                  </CardContent>
                </Card>

                {/* Server info */}
                <Card>
                  <CardHeader><CardTitle className="text-muted-foreground flex items-center gap-2"><Server className="h-4 w-4"/>Server</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <span>Host</span><code className="text-xs">{settings?.host||"—"}</code>
                      <span>Port</span><code className="text-xs">{settings?.port||"—"}</code>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>

      {/* Save */}
      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="h-4 w-4"/>{saving?"Saving...":"Save Settings"}</Button>
        <Button variant="outline" onClick={loadSettings} className="gap-2"><RotateCcw className="h-4 w-4"/>Reset</Button>
      </div>
    </div>
  );
}
