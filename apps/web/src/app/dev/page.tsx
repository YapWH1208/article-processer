"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Code2, SlidersHorizontal, MessageSquare, FileCode,
  Save, RotateCcw, Loader2, Thermometer, Gauge, Hash, Sparkles, Wand2,
  Plus, Trash2, Brain, CheckCircle2, Server,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { FadeIn } from "@/components/ui/animated";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────

interface SystemMessageItem {
  content: string;
}

interface InputTemplateItem {
  template: string;
  description: string;
}

interface ProviderEntry {
  id: string;
  name: string;
  type: string;
  api_key: string;
  base_url: string;
  model: string;
  protocol: string;
}

interface DevConfig {
  temperature: number;
  top_p: number;
  max_tokens: number;
  frequency_penalty: number;
  presence_penalty: number;
  system_messages: Record<string, SystemMessageItem>;
  input_templates: Record<string, InputTemplateItem>;
  providers?: ProviderEntry[];
  active_provider_id?: string | null;
}

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4.1-mini", defaultBase: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-20250514", defaultBase: "" },
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat", defaultBase: "https://api.deepseek.com/v1" },
  { value: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4.1-mini", defaultBase: "https://openrouter.ai/api/v1" },
  { value: "glm", label: "GLM (Zhipu)", defaultModel: "glm-4-plus", defaultBase: "https://open.bigmodel.cn/api/paas/v4" },
  { value: "minimax", label: "MiniMax", defaultModel: "MiniMax-Text-01", defaultBase: "https://api.minimax.chat/v1" },
  { value: "kimi", label: "Kimi (Moonshot)", defaultModel: "moonshot-v1-8k", defaultBase: "https://api.moonshot.cn/v1" },
  { value: "custom", label: "Custom OpenAI-Compatible", defaultModel: "llama3.1:8b", defaultBase: "http://localhost:11434/v1" },
];

// ── Slider field ─────────────────────────────────────────────────────────

function SliderField({
  label, value, min, max, step, onChange, icon: Icon, unit, hint,
}: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void; icon: React.ElementType; unit?: string; hint?: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-1.5 text-sm">
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
          {label}
        </Label>
        <span className="text-sm font-mono tabular-nums text-muted-foreground">
          {value.toFixed(step < 1 ? 2 : 0)}{unit || ""}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
        style={{
          background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)`,
        }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────

export default function DevPage() {
  const [config, setConfig] = useState<DevConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("providers");

  // System messages
  const [systemMessages, setSystemMessages] = useState<Record<string, string>>({});
  const [editingSm, setEditingSm] = useState<string | null>(null);
  const [editSmContent, setEditSmContent] = useState("");
  const [smSaving, setSmSaving] = useState(false);

  // Input templates
  const [inputTemplates, setInputTemplates] = useState<Record<string, InputTemplateItem>>({});
  const [editingIt, setEditingIt] = useState<string | null>(null);
  const [editItTemplate, setEditItTemplate] = useState("");
  const [itSaving, setItSaving] = useState(false);

  // Model params
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(2048);
  const [freqPenalty, setFreqPenalty] = useState(0.0);
  const [presPenalty, setPresPenalty] = useState(0.0);
  const [mpDirty, setMpDirty] = useState(false);
  const [mpSaving, setMpSaving] = useState(false);

  // Providers
  const [providers, setProviders] = useState<ProviderEntry[]>([]);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: "", type: "openai", api_key: "", base_url: "", model: "", protocol: "openai",
  });
  const [provSaving, setProvSaving] = useState(false);

  useEffect(() => { loadConfig(); }, []);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/dev`);
      if (!res.ok) throw new Error("Failed to load");
      const d: DevConfig = await res.json();
      setConfig(d);
      setProviders(d.providers || []);
      setActiveProviderId(d.active_provider_id || null);
      const sm: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.system_messages)) {
        sm[k] = v.content;
      }
      setSystemMessages(sm);
      setInputTemplates(d.input_templates);
      setTemperature(d.temperature);
      setTopP(d.top_p);
      setMaxTokens(d.max_tokens);
      setFreqPenalty(d.frequency_penalty);
      setPresPenalty(d.presence_penalty);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load dev config");
    } finally { setLoading(false); }
  };

  // ── System message save ──────────────────────────────────────────────
  const saveSystemMessage = async (name: string) => {
    setSmSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dev/system-messages/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editSmContent }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setSystemMessages((prev) => ({ ...prev, [name]: editSmContent }));
      setEditingSm(null);
      toast.success(`System message "${name}" saved`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSmSaving(false); }
  };

  // ── Input template save ──────────────────────────────────────────────
  const saveInputTemplate = async (name: string) => {
    setItSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dev/input-templates/${name}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: editItTemplate }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setInputTemplates((prev) => ({
        ...prev,
        [name]: { ...prev[name], template: editItTemplate },
      }));
      setEditingIt(null);
      toast.success(`Input template "${name}" saved`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setItSaving(false); }
  };

  // ── Model params save ────────────────────────────────────────────────
  const saveModelParams = async () => {
    setMpSaving(true);
    try {
      const res = await fetch(`${API_BASE}/dev/model-params`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          temperature, top_p: topP, max_tokens: maxTokens,
          frequency_penalty: freqPenalty, presence_penalty: presPenalty,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setMpDirty(false);
      toast.success("Model parameters saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setMpSaving(false); }
  };

  const applyPreset = (preset: "precise" | "balanced" | "creative") => {
    const presets = {
      precise: { temperature: 0.2, top_p: 0.8, freq_penalty: 0.0, pres_penalty: 0.0 },
      balanced: { temperature: 0.7, top_p: 0.95, freq_penalty: 0.0, pres_penalty: 0.0 },
      creative: { temperature: 1.2, top_p: 0.98, freq_penalty: 0.3, pres_penalty: 0.2 },
    };
    const p = presets[preset];
    setTemperature(p.temperature);
    setTopP(p.top_p);
    setFreqPenalty(p.freq_penalty);
    setPresPenalty(p.pres_penalty);
    setMpDirty(true);
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto space-y-4"><Skeleton className="h-8 w-48"/><Skeleton className="h-96 w-full"/></div>;
  }

  const taskLabels: Record<string, string> = {
    extraction: "Extraction",
    chat: "Chat Q&A",
    skill_default: "Skills (Default)",
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <FadeIn>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Code2 className="h-5 w-5 text-amber-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Developer Console</h1>
            <p className="text-sm text-muted-foreground">
              Configure system messages, input templates, and model parameters.
            </p>
          </div>
        </div>
      </FadeIn>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="providers" className="gap-1.5 flex-1">
            <Server className="h-4 w-4" /> Providers
          </TabsTrigger>
          <TabsTrigger value="system-messages" className="gap-1.5 flex-1">
            <MessageSquare className="h-4 w-4" /> System Msgs
          </TabsTrigger>
          <TabsTrigger value="input-templates" className="gap-1.5 flex-1">
            <FileCode className="h-4 w-4" /> Templates
          </TabsTrigger>
          <TabsTrigger value="model-params" className="gap-1.5 flex-1">
            <SlidersHorizontal className="h-4 w-4" /> Params
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {/* ── Providers Tab ──────────────────────────────── */}
          {tab === "providers" && (
            <motion.div key="prov" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>LLM Providers</CardTitle>
                  <CardDescription>
                    Add multiple LLM providers and select which one to use. Each provider has its own API key, base URL, and model.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {providers.map((p) => (
                    <div key={p.id}
                      className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                        activeProviderId === p.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                          activeProviderId === p.id ? "bg-primary/20" : "bg-muted"
                        }`}>
                          <Brain className={`h-4 w-4 ${activeProviderId === p.id ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold">{p.name}</span>
                            {activeProviderId === p.id && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {p.type} · {p.model || "default"} {p.base_url ? `· ${p.base_url}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {activeProviderId !== p.id && (
                          <Button variant="outline" size="sm" className="h-8 text-xs"
                            onClick={async () => {
                              try {
                                const res = await fetch(`${API_BASE}/dev/providers/active`, {
                                  method: "PUT", headers: {"Content-Type":"application/json"},
                                  body: JSON.stringify({provider_id: p.id}),
                                });
                                if (!res.ok) throw new Error("Failed");
                                setActiveProviderId(p.id);
                                toast.success(`Active provider: ${p.name}`);
                              } catch { toast.error("Failed to set active provider"); }
                            }}>
                            Set Active
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={async () => {
                            if (!confirm(`Delete provider "${p.name}"?`)) return;
                            try {
                              const res = await fetch(`${API_BASE}/dev/providers/${p.id}`, { method: "DELETE" });
                              if (!res.ok) throw new Error("Failed");
                              setProviders((prev) => prev.filter((x) => x.id !== p.id));
                              if (activeProviderId === p.id) setActiveProviderId(null);
                              toast.success(`Deleted ${p.name}`);
                            } catch { toast.error("Failed to delete"); }
                          }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                  {providers.length === 0 && (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      <Server className="h-8 w-8 mx-auto mb-2 opacity-20" />
                      No providers configured. Add one to start using AI features.
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Add form */}
              {showAddForm ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Add Provider</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input value={newProvider.name} onChange={(e) => setNewProvider((p) => ({...p, name: e.target.value}))}
                          placeholder="My OpenAI" className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Provider Type</Label>
                        <select value={newProvider.type} onChange={(e) => {
                          const t = PROVIDER_TYPES.find((x) => x.value === e.target.value);
                          setNewProvider((p) => ({
                            ...p, type: e.target.value, base_url: t?.defaultBase || "",
                            model: t?.defaultModel || "", protocol: e.target.value === "anthropic" ? "anthropic" : "openai",
                          }));
                        }} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                          {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">API Key</Label>
                      <Input value={newProvider.api_key} onChange={(e) => setNewProvider((p) => ({...p, api_key: e.target.value}))}
                        placeholder={newProvider.type === "custom" ? "ollama or your-key" : "sk-..."}
                        type="password" className="h-9 font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Base URL</Label>
                      <Input value={newProvider.base_url} onChange={(e) => setNewProvider((p) => ({...p, base_url: e.target.value}))}
                        placeholder="https://api.openai.com/v1" className="h-9 font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Model</Label>
                      <Input value={newProvider.model} onChange={(e) => setNewProvider((p) => ({...p, model: e.target.value}))}
                        placeholder="gpt-4.1-mini" className="h-9" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>Cancel</Button>
                      <Button size="sm" onClick={async () => {
                        if (!newProvider.name.trim()) { toast.error("Name is required"); return; }
                        setProvSaving(true);
                        try {
                          const res = await fetch(`${API_BASE}/dev/providers`, {
                            method: "POST", headers: {"Content-Type":"application/json"},
                            body: JSON.stringify(newProvider),
                          });
                          if (!res.ok) throw new Error((await res.json()).detail || "Failed");
                          const created: ProviderEntry = await res.json();
                          setProviders((prev) => [...prev, created]);
                          if (!activeProviderId) { setActiveProviderId(created.id); }
                          setShowAddForm(false);
                          setNewProvider({ name: "", type: "openai", api_key: "", base_url: "", model: "", protocol: "openai" });
                          toast.success(`Added ${created.name}`);
                        } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
                        finally { setProvSaving(false); }
                      }} disabled={provSaving}>
                        {provSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Plus className="h-3.5 w-3.5 mr-1"/>}
                        Add
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Button variant="outline" className="w-full gap-2 h-10" onClick={() => setShowAddForm(true)}>
                  <Plus className="h-4 w-4" /> Add Provider
                </Button>
              )}
            </motion.div>
          )}

          {/* ── System Messages Tab ──────────────────────────── */}
          {tab === "system-messages" && (
            <motion.div key="sm" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>System Messages</CardTitle>
                  <CardDescription>
                    Per-task system prompts that define the AI&apos;s persona and behavior rules.
                    These are the authoritative source — input templates only inject data.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {Object.entries(systemMessages).map(([name, content]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold capitalize">
                          {taskLabels[name] || name.replace(/_/g, " ")}
                        </h3>
                        {editingSm !== name && (
                          <Button variant="outline" size="sm"
                            onClick={() => { setEditingSm(name); setEditSmContent(content); }}>
                            Edit
                          </Button>
                        )}
                      </div>
                      {editingSm === name ? (
                        <div className="space-y-2">
                          <Textarea value={editSmContent} onChange={(e) => setEditSmContent(e.target.value)}
                            rows={8} className="font-mono text-xs resize-y" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingSm(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => saveSystemMessage(name)} disabled={smSaving}>
                              {smSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-28 overflow-y-auto border">
                          {content}
                        </pre>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Input Templates Tab ─────────────────────────── */}
          {tab === "input-templates" && (
            <motion.div key="it" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Input Templates</CardTitle>
                  <CardDescription>
                    Pure data-injection wrappers. Use <code className="bg-muted px-1 rounded text-xs">{"{document}"}</code>,{" "}
                    <code className="bg-muted px-1 rounded text-xs">{"{question}"}</code>,{" "}
                    <code className="bg-muted px-1 rounded text-xs">{"{title}"}</code> as placeholders.
                    No behavioral instructions here — those belong in System Messages.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {Object.entries(inputTemplates).map(([name, item]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold capitalize">
                          {taskLabels[name] || name.replace(/_/g, " ")}
                        </h3>
                        {editingIt !== name && (
                          <Button variant="outline" size="sm"
                            onClick={() => { setEditingIt(name); setEditItTemplate(item.template); }}>
                            Edit
                          </Button>
                        )}
                      </div>
                      {editingIt === name ? (
                        <div className="space-y-2">
                          <Textarea value={editItTemplate} onChange={(e) => setEditItTemplate(e.target.value)}
                            rows={5} className="font-mono text-xs resize-y" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingIt(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => saveInputTemplate(name)} disabled={itSaving}>
                              {itSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>}
                              Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-24 overflow-y-auto border">
                          {item.template}
                        </pre>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Model Params Tab ─────────────────────────────── */}
          {tab === "model-params" && (
            <motion.div key="mp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Model Parameters</CardTitle>
                  <CardDescription>Control LLM output behavior. Changes take effect on the next request.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex gap-2">
                    <span className="text-xs text-muted-foreground self-center mr-1">Presets:</span>
                    {(["precise", "balanced", "creative"] as const).map((p) => (
                      <Button key={p} variant="outline" size="sm" onClick={() => applyPreset(p)} className="text-xs capitalize h-7">{p}</Button>
                    ))}
                  </div>
                  <SliderField label="Temperature" value={temperature} min={0} max={2} step={0.05}
                    onChange={(v) => { setTemperature(v); setMpDirty(true); }} icon={Thermometer}
                    hint="Lower = more deterministic. Higher = more creative/random." />
                  <SliderField label="Top P (Nucleus Sampling)" value={topP} min={0} max={1} step={0.01}
                    onChange={(v) => { setTopP(v); setMpDirty(true); }} icon={Gauge}
                    hint="Cumulative probability threshold for token selection." />
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5 text-sm"><Hash className="h-3.5 w-3.5 text-muted-foreground"/>Max Tokens</Label>
                    <Input type="number" min={1} max={32768} value={maxTokens}
                      onChange={(e) => { setMaxTokens(parseInt(e.target.value) || 2048); setMpDirty(true); }} className="w-36 font-mono" />
                  </div>
                  <SliderField label="Frequency Penalty" value={freqPenalty} min={-2} max={2} step={0.05}
                    onChange={(v) => { setFreqPenalty(v); setMpDirty(true); }} icon={Sparkles}
                    hint="Positive values discourage word repetition." />
                  <SliderField label="Presence Penalty" value={presPenalty} min={-2} max={2} step={0.05}
                    onChange={(v) => { setPresPenalty(v); setMpDirty(true); }} icon={Sparkles}
                    hint="Positive values encourage topic diversity." />
                  <div className="flex gap-2 justify-end pt-2">
                    {mpDirty && (
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (config) { setTemperature(config.temperature); setTopP(config.top_p); setMaxTokens(config.max_tokens); setFreqPenalty(config.frequency_penalty); setPresPenalty(config.presence_penalty); setMpDirty(false); }
                      }}><RotateCcw className="h-3.5 w-3.5 mr-1"/> Reset</Button>
                    )}
                    <Button size="sm" onClick={saveModelParams} disabled={!mpDirty || mpSaving}>
                      {mpSaving ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Save className="h-4 w-4 mr-1"/>} Save
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </Tabs>
    </div>
  );
}
