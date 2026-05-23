"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Save, RotateCcw, Brain, Cpu, Settings2, Server, Download, Upload, Wifi, Loader2, FileCode, CheckCircle2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/animated";
import { listParsers, listSkills } from "@/lib/api";
import SkillManager from "@/components/skills/SkillManager";
import { Wand2 } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────

interface Settings {
  llm_provider: string; llm_custom_protocol: string;
  llm_custom_base_url: string; llm_custom_api_key: string; llm_custom_model: string;
  openai_api_key: string; openai_model: string;
  anthropic_api_key: string; anthropic_model: string;
  deepseek_api_key?: string; deepseek_model?: string; deepseek_coding_model?: string;
  openrouter_api_key?: string; openrouter_model?: string; openrouter_coding_model?: string;
  glm_api_key?: string; glm_model?: string; glm_coding_model?: string;
  minimax_api_key?: string; minimax_model?: string; minimax_coding_model?: string;
  mimo_api_key?: string; mimo_model?: string; mimo_coding_model?: string;
  kimi_api_key?: string; kimi_model?: string; kimi_coding_model?: string;
  embedding_provider: string;
  embedding_custom_base_url: string; embedding_custom_api_key: string; embedding_custom_model: string;
  openai_embedding_model: string;
  use_mock_ai: boolean; max_upload_mb: number;
  parser_priority?: string;
  host: string; port: number; env_path: string;
}

// ── Constants ────────────────────────────────────────────────────────────

const LLM_PROVIDERS = [
  { value: "openai", label: "OpenAI", desc: "GPT-4.1, GPT-4o, GPT-4 Turbo" },
  { value: "anthropic", label: "Anthropic", desc: "Claude Sonnet, Haiku, Opus" },
  { value: "deepseek", label: "DeepSeek", desc: "DeepSeek-Chat, DeepSeek-Coder, DeepSeek-Reasoner" },
  { value: "openrouter", label: "OpenRouter", desc: "Unified API for 200+ models" },
  { value: "glm", label: "GLM (Zhipu)", desc: "GLM-4 Plus, Flash, Long, Air" },
  { value: "minimax", label: "MiniMax", desc: "MiniMax-Text-01, abab6.5s" },
  { value: "mimo", label: "Mimo (MiniMax-M1)", desc: "MiniMax-M1, MiniMax-M1-8k" },
  { value: "kimi", label: "Kimi (Moonshot)", desc: "moonshot-v1-8k, 32k, 128k" },
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

const DEEPSEEK_MODELS = [
  { value: "deepseek-chat", label: "DeepSeek-Chat (V3)" },
  { value: "deepseek-coder", label: "DeepSeek-Coder" },
  { value: "deepseek-reasoner", label: "DeepSeek-Reasoner (R1)" },
];

const OPENROUTER_MODELS = [
  { value: "openai/gpt-4.1-mini", label: "GPT-4.1 Mini" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "google/gemini-2.5-pro-preview", label: "Gemini 2.5 Pro" },
  { value: "deepseek/deepseek-chat", label: "DeepSeek V3" },
  { value: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick" },
];

const GLM_MODELS = [
  { value: "glm-4-plus", label: "GLM-4 Plus" },
  { value: "glm-4-flash", label: "GLM-4 Flash" },
  { value: "glm-4-long", label: "GLM-4 Long (1M ctx)" },
  { value: "glm-4-air", label: "GLM-4 Air" },
];

const MINIMAX_MODELS = [
  { value: "MiniMax-Text-01", label: "MiniMax-Text-01" },
  { value: "abab6.5s-chat", label: "abab6.5s-chat" },
];

const MIMO_MODELS = [
  { value: "MiniMax-M1", label: "MiniMax-M1" },
  { value: "MiniMax-M1-8k", label: "MiniMax-M1-8k" },
];

const KIMI_MODELS = [
  { value: "moonshot-v1-8k", label: "Moonshot v1 8K" },
  { value: "moonshot-v1-32k", label: "Moonshot v1 32K" },
  { value: "moonshot-v1-128k", label: "Moonshot v1 128K" },
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
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ all_ok: boolean; results: Record<string, { ok: boolean; message: string }> } | null>(null);
  const [tab, setTab] = useState("llm");
  const [parsers, setParsers] = useState<{ key: string; name: string; installed: boolean; version: string | null; description: string; install_cmd: string | null }[]>([]);
  const [parserPriority, setParserPriority] = useState("mineru_first");
  const [skillDefs, setSkillDefs] = useState<{ name: string; purpose: string; description: string; input_schema: Record<string, unknown>; output_schema: Record<string, unknown>; prompt_instructions?: string }[]>([]);

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

  // New provider state
  const [deepseekKey, setDeepseekKey] = useState(""); const [deepseekKeyTouched, setDeepseekKeyTouched] = useState(false);
  const [deepseekModel, setDeepseekModel] = useState("deepseek-chat");
  const [deepseekCodingModel, setDeepseekCodingModel] = useState("");
  const [openrouterKey, setOpenrouterKey] = useState(""); const [openrouterKeyTouched, setOpenrouterKeyTouched] = useState(false);
  const [openrouterModel, setOpenrouterModel] = useState("openai/gpt-4.1-mini");
  const [openrouterCodingModel, setOpenrouterCodingModel] = useState("");
  const [glmKey, setGlmKey] = useState(""); const [glmKeyTouched, setGlmKeyTouched] = useState(false);
  const [glmModel, setGlmModel] = useState("glm-4-plus");
  const [glmCodingModel, setGlmCodingModel] = useState("");
  const [minimaxKey, setMinimaxKey] = useState(""); const [minimaxKeyTouched, setMinimaxKeyTouched] = useState(false);
  const [minimaxModel, setMinimaxModel] = useState("MiniMax-Text-01");
  const [minimaxCodingModel, setMinimaxCodingModel] = useState("");
  const [mimoKey, setMimoKey] = useState(""); const [mimoKeyTouched, setMimoKeyTouched] = useState(false);
  const [mimoModel, setMimoModel] = useState("MiniMax-M1");
  const [mimoCodingModel, setMimoCodingModel] = useState("");
  const [kimiKey, setKimiKey] = useState(""); const [kimiKeyTouched, setKimiKeyTouched] = useState(false);
  const [kimiModel, setKimiModel] = useState("moonshot-v1-8k");
  const [kimiCodingModel, setKimiCodingModel] = useState("");

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

  // ── Export/Import ─────────────────────────────────────────────────────

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/settings/export`);
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "article-processor-settings.json";
      a.click(); URL.revokeObjectURL(url);
      toast.success("Settings exported");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${API_BASE}/settings/import`, { method: "POST", body: formData });
      if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
      toast.success("Settings imported — reloading...");
      await loadSettings();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load");
      const d: Settings = await res.json();
      setSettings(d);
      setParserPriority(d.parser_priority || "docling_first");
      // LLM
      setLlmProvider(d.llm_provider); setLlmCustomProtocol(d.llm_custom_protocol);
      setLlmCustomBaseUrl(d.llm_custom_base_url); setLlmCustomKey(d.llm_custom_api_key); setLlmCustomModel(d.llm_custom_model);
      setOpenaiKey(d.openai_api_key); setOpenaiModel(d.openai_model);
      setAnthropicKey(d.anthropic_api_key); setAnthropicModel(d.anthropic_model);
      // New providers
      setDeepseekKey(d.deepseek_api_key || ""); setDeepseekModel(d.deepseek_model || "deepseek-chat"); setDeepseekCodingModel(d.deepseek_coding_model || "");
      setOpenrouterKey(d.openrouter_api_key || ""); setOpenrouterModel(d.openrouter_model || "openai/gpt-4.1-mini"); setOpenrouterCodingModel(d.openrouter_coding_model || "");
      setGlmKey(d.glm_api_key || ""); setGlmModel(d.glm_model || "glm-4-plus"); setGlmCodingModel(d.glm_coding_model || "");
      setMinimaxKey(d.minimax_api_key || ""); setMinimaxModel(d.minimax_model || "MiniMax-Text-01"); setMinimaxCodingModel(d.minimax_coding_model || "");
      setMimoKey(d.mimo_api_key || ""); setMimoModel(d.mimo_model || "MiniMax-M1"); setMimoCodingModel(d.mimo_coding_model || "");
      setKimiKey(d.kimi_api_key || ""); setKimiModel(d.kimi_model || "moonshot-v1-8k"); setKimiCodingModel(d.kimi_coding_model || "");
      // Embedding
      setEmbeddingProvider(d.embedding_provider);
      setEmbeddingCustomBaseUrl(d.embedding_custom_base_url); setEmbeddingCustomKey(d.embedding_custom_api_key); setEmbeddingCustomModel(d.embedding_custom_model);
      setOpenaiEmbeddingModel(d.openai_embedding_model);
      // General
      setMockAi(d.use_mock_ai); setMaxUploadMb(d.max_upload_mb);

      // Skills
      try { const s = await listSkills(); setSkillDefs(s.skills || []); } catch { /* keep existing */ }
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
        parser_priority: parserPriority,
      };
      if (llmCustomKeyTouched) body.llm_custom_api_key = llmCustomKey;
      if (openaiKeyTouched) body.openai_api_key = openaiKey;
      if (anthropicKeyTouched) body.anthropic_api_key = anthropicKey;
      // New providers
      body.deepseek_model = deepseekModel; body.deepseek_coding_model = deepseekCodingModel;
      if (deepseekKeyTouched) body.deepseek_api_key = deepseekKey;
      body.openrouter_model = openrouterModel; body.openrouter_coding_model = openrouterCodingModel;
      if (openrouterKeyTouched) body.openrouter_api_key = openrouterKey;
      body.glm_model = glmModel; body.glm_coding_model = glmCodingModel;
      if (glmKeyTouched) body.glm_api_key = glmKey;
      body.minimax_model = minimaxModel; body.minimax_coding_model = minimaxCodingModel;
      if (minimaxKeyTouched) body.minimax_api_key = minimaxKey;
      body.mimo_model = mimoModel; body.mimo_coding_model = mimoCodingModel;
      if (mimoKeyTouched) body.mimo_api_key = mimoKey;
      body.kimi_model = kimiModel; body.kimi_coding_model = kimiCodingModel;
      if (kimiKeyTouched) body.kimi_api_key = kimiKey;
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
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="llm" className="gap-1.5 flex-1"><Brain className="h-4 w-4"/>LLM</TabsTrigger>
          <TabsTrigger value="embeddings" className="gap-1.5 flex-1"><Cpu className="h-4 w-4"/>Embeddings</TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5 flex-1"><Settings2 className="h-4 w-4"/>General</TabsTrigger>
          <TabsTrigger value="parsers" className="gap-1.5 flex-1" onClick={() => { listParsers().then(setParsers).catch(() => {}); }}><FileCode className="h-4 w-4"/>Parsers</TabsTrigger>
          <TabsTrigger value="skills" className="gap-1.5 flex-1"><Wand2 className="h-4 w-4"/>Skills</TabsTrigger>
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

                    {/* DeepSeek fields */}
                    <AnimatePresence>
                      {llmProvider === "deepseek" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-blue-400/30 space-y-3 overflow-hidden">
                          <KeyField label="DeepSeek API Key" value={deepseekKey} savedMasked={settings?.deepseek_api_key}
                            touched={deepseekKeyTouched} onChange={(v) => { setDeepseekKey(v); setDeepseekKeyTouched(true); }}
                            onFocus={() => { if (!deepseekKeyTouched) setDeepseekKey(""); }} placeholder="sk-..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={deepseekModel} onValueChange={setDeepseekModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{DEEPSEEK_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional, for plan/reasoning)</Label>
                            <Input value={deepseekCodingModel} onChange={(e) => setDeepseekCodingModel(e.target.value)} placeholder="deepseek-coder" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* OpenRouter fields */}
                    <AnimatePresence>
                      {llmProvider === "openrouter" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-indigo-400/30 space-y-3 overflow-hidden">
                          <KeyField label="OpenRouter API Key" value={openrouterKey} savedMasked={settings?.openrouter_api_key}
                            touched={openrouterKeyTouched} onChange={(v) => { setOpenrouterKey(v); setOpenrouterKeyTouched(true); }}
                            onFocus={() => { if (!openrouterKeyTouched) setOpenrouterKey(""); }} placeholder="sk-or-..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={openrouterModel} onValueChange={setOpenrouterModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{OPENROUTER_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional)</Label>
                            <Input value={openrouterCodingModel} onChange={(e) => setOpenrouterCodingModel(e.target.value)} placeholder="anthropic/claude-sonnet-4-20250514" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* GLM fields */}
                    <AnimatePresence>
                      {llmProvider === "glm" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-teal-400/30 space-y-3 overflow-hidden">
                          <KeyField label="GLM API Key (ZhipuAI)" value={glmKey} savedMasked={settings?.glm_api_key}
                            touched={glmKeyTouched} onChange={(v) => { setGlmKey(v); setGlmKeyTouched(true); }}
                            onFocus={() => { if (!glmKeyTouched) setGlmKey(""); }} placeholder="..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={glmModel} onValueChange={setGlmModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{GLM_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional)</Label>
                            <Input value={glmCodingModel} onChange={(e) => setGlmCodingModel(e.target.value)} placeholder="glm-4-plus" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* MiniMax fields */}
                    <AnimatePresence>
                      {llmProvider === "minimax" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-rose-400/30 space-y-3 overflow-hidden">
                          <KeyField label="MiniMax API Key" value={minimaxKey} savedMasked={settings?.minimax_api_key}
                            touched={minimaxKeyTouched} onChange={(v) => { setMinimaxKey(v); setMinimaxKeyTouched(true); }}
                            onFocus={() => { if (!minimaxKeyTouched) setMinimaxKey(""); }} placeholder="..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={minimaxModel} onValueChange={setMinimaxModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{MINIMAX_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional)</Label>
                            <Input value={minimaxCodingModel} onChange={(e) => setMinimaxCodingModel(e.target.value)} placeholder="MiniMax-Text-01" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Mimo fields */}
                    <AnimatePresence>
                      {llmProvider === "mimo" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-violet-400/30 space-y-3 overflow-hidden">
                          <KeyField label="Mimo (MiniMax-M1) API Key" value={mimoKey} savedMasked={settings?.mimo_api_key}
                            touched={mimoKeyTouched} onChange={(v) => { setMimoKey(v); setMimoKeyTouched(true); }}
                            onFocus={() => { if (!mimoKeyTouched) setMimoKey(""); }} placeholder="..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={mimoModel} onValueChange={setMimoModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{MIMO_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional)</Label>
                            <Input value={mimoCodingModel} onChange={(e) => setMimoCodingModel(e.target.value)} placeholder="MiniMax-M1" />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Kimi fields */}
                    <AnimatePresence>
                      {llmProvider === "kimi" && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                          className="pl-4 border-l-2 border-sky-400/30 space-y-3 overflow-hidden">
                          <KeyField label="Kimi (Moonshot) API Key" value={kimiKey} savedMasked={settings?.kimi_api_key}
                            touched={kimiKeyTouched} onChange={(v) => { setKimiKey(v); setKimiKeyTouched(true); }}
                            onFocus={() => { if (!kimiKeyTouched) setKimiKey(""); }} placeholder="sk-..." />
                          <div className="space-y-1.5"><Label>Model</Label>
                            <Select value={kimiModel} onValueChange={setKimiModel}>
                              <SelectTrigger><SelectValue/></SelectTrigger>
                              <SelectContent>{KIMI_MODELS.map(m=><SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1.5"><Label>Coding Model (optional)</Label>
                            <Input value={kimiCodingModel} onChange={(e) => setKimiCodingModel(e.target.value)} placeholder="moonshot-v1-8k" />
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

          {/* ── Parsers Tab ─────────────────────────────────────── */}
          {tab === "parsers" && (
            <motion.div key="parsers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="parsers" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle>PDF Parser Priority</CardTitle><CardDescription>Choose which parser to use for PDF documents. The pipeline auto-detects installed parsers.</CardDescription></CardHeader>
                  <CardContent>
                    <Select value={parserPriority} onValueChange={setParserPriority}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mineru_first">MinerU (best quality, fallback to Docling → pypdf)</SelectItem>
                        <SelectItem value="docling">Docling only (layout-aware, table extraction)</SelectItem>
                        <SelectItem value="pypdf">pypdf only (built-in, no extra deps)</SelectItem>
                        <SelectItem value="ocr">OCR-enhanced (pypdf + Tesseract)</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Installed Parsers</CardTitle><CardDescription>Detection is automatic — install the Python package to enable each parser.</CardDescription></CardHeader>
                  <CardContent>
                    {parsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Loading parser info...</p>
                    ) : (
                      <div className="space-y-3">
                        {parsers.map((p) => (
                          <div key={p.key} className={`flex items-start gap-3 p-3 rounded-md border text-sm ${p.installed ? "bg-success/5 border-success/20" : "bg-muted/30 border-border"}`}>
                            {p.installed ? <CheckCircle2 className="h-5 w-5 text-success shrink-0 mt-0.5" /> : <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium">{p.name}</span>
                                {p.version && <code className="text-[10px] bg-muted px-1 rounded">{p.version}</code>}
                                <Badge variant={p.installed ? "default" : "secondary"} className="text-[10px]">{p.installed ? "Installed" : "Not installed"}</Badge>
                              </div>
                              <p className="text-muted-foreground mt-0.5">{p.description}</p>
                              {!p.installed && p.install_cmd && (
                                <div className="mt-2">
                                  <code className="block text-[11px] bg-muted p-2 rounded whitespace-pre-wrap break-all">{p.install_cmd}</code>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}

          {/* ── Skills Tab ─────────────────────────────────────── */}
          {tab === "skills" && (
            <motion.div key="skills" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="skills" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>AI Skills Management</CardTitle>
                    <CardDescription>Create, edit, delete, import, and export analysis skills. Skills define focused AI-powered extraction workflows.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <SkillManager
                      skills={skillDefs}
                      onSkillsChanged={() => { listSkills().then((s) => setSkillDefs(s.skills || [])).catch(() => {}); }}
                    />
                  </CardContent>
                </Card>
              </TabsContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap items-center">
        <Button onClick={handleSave} disabled={saving} className="gap-2"><Save className="h-4 w-4"/>{saving?"Saving...":"Save Settings"}</Button>
        <Button variant="outline" onClick={loadSettings} className="gap-2"><RotateCcw className="h-4 w-4"/>Reset</Button>
        <Button variant="outline" onClick={handleExport} className="gap-2"><Download className="h-4 w-4"/>Export All</Button>
        <label>
          <Button variant="outline" className="gap-2 cursor-pointer" asChild><span><Upload className="h-4 w-4"/>Import All</span></Button>
          <input type="file" accept=".json" className="hidden" onChange={handleImport}/>
        </label>
        <div className="w-full border-t my-1" />
        <Button
          variant="secondary"
          onClick={async () => {
            setTesting(true); setTestResult(null);
            try {
              const body: Record<string, unknown> = {
                llm_provider: llmProvider, llm_custom_protocol: llmCustomProtocol,
                llm_custom_base_url: llmCustomBaseUrl, llm_custom_model: llmCustomModel,
                openai_model: openaiModel, anthropic_model: anthropicModel,
                embedding_provider: embeddingProvider,
                embedding_custom_base_url: embeddingCustomBaseUrl, embedding_custom_model: embeddingCustomModel,
                openai_embedding_model: openaiEmbeddingModel,
                use_mock_ai: mockAi,
              };
              if (llmCustomKeyTouched) body.llm_custom_api_key = llmCustomKey;
              if (openaiKeyTouched) body.openai_api_key = openaiKey;
              if (anthropicKeyTouched) body.anthropic_api_key = anthropicKey;
              if (deepseekKeyTouched) body.deepseek_api_key = deepseekKey;
              if (openrouterKeyTouched) body.openrouter_api_key = openrouterKey;
              if (glmKeyTouched) body.glm_api_key = glmKey;
              if (minimaxKeyTouched) body.minimax_api_key = minimaxKey;
              if (mimoKeyTouched) body.mimo_api_key = mimoKey;
              if (kimiKeyTouched) body.kimi_api_key = kimiKey;
              if (embeddingCustomKeyTouched) body.embedding_custom_api_key = embeddingCustomKey;
              const res = await fetch(`${API_BASE}/settings/test`, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
              });
              const data = await res.json();
              setTestResult(data);
              if (data.all_ok) toast.success("All connections OK");
              else toast.error("Some connections failed — see details below");
            } catch (e: unknown) {
              toast.error(e instanceof Error ? e.message : "Test failed");
            } finally { setTesting(false); }
          }}
          disabled={testing}
          className="gap-2">
          {testing ? <Loader2 className="h-4 w-4 animate-spin"/> : <Wifi className="h-4 w-4"/>}
          {testing ? "Testing..." : "Test Connection"}
        </Button>
      </div>

      {/* Test result */}
      <AnimatePresence>
        {testResult && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className={`p-4 rounded-lg border text-sm ${testResult.all_ok ? "bg-green-500/5 border-green-500/20" : "bg-destructive/5 border-destructive/20"}`}>
            <p className={`font-semibold mb-2 ${testResult.all_ok ? "text-green-600" : "text-destructive"}`}>
              {testResult.all_ok ? "✓ All connections successful" : "⚠ Some connections failed"}
            </p>
            {Object.entries(testResult.results).map(([name, r]) => (
              <div key={name} className="flex items-start gap-2 py-1">
                <span className={r.ok ? "text-green-500" : "text-destructive"}>{r.ok ? "✓" : "✗"}</span>
                <div>
                  <span className="font-medium capitalize">{name}</span>
                  <span className="text-muted-foreground ml-2">{r.message}</span>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
