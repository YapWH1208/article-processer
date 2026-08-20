"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings2, Server, Download, Upload, Loader2, FileCode,
  Save, RotateCcw, Thermometer, Gauge, Hash, Sparkles,
  Plus, Trash2, Pencil, Brain, CheckCircle2, MessageSquare,
  ArrowLeft, ArrowRight,
  SlidersHorizontal, SwitchCamera, Maximize2, Database,
  KeyRound,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { FadeIn } from "@/components/ui/animated";
import { listParsers, installParser, uninstallParser, apiRawFetch } from "@/lib/api";
import type { ParserInfo } from "@/lib/types";
import {
  buildProviderUpdatePayload,
  canContinueProviderAddStep,
  createProviderEditDraft,
  getProviderAddWizardSteps,
} from "./providerSettingsState.mjs";
import { buildOpenReviewSettingsPayload } from "./openreviewSettingsState.mjs";

// ── Types ────────────────────────────────────────────────────────────────

interface SettingsData {
  host: string; port: number; env_path: string;
  use_mock_ai: boolean; max_upload_mb: number; parser_priority: string;
  mineru_api_enabled: boolean; mineru_api_mode: string;
  mineru_api_key: string; mineru_api_base_url: string;
  mineru_api_model: string;
  mineru_api_enable_formula: boolean; mineru_api_is_ocr: boolean;
  mineru_api_language: string;
  api_base_url: string;
  openreview_username: string;
  openreview_password_configured: boolean;
  openreview_access_token_configured: boolean;
}

interface SystemMessageItem { content: string; }

interface InputTemplateItem { template: string; description: string; }

interface ProviderEntry {
  id: string; name: string; type: string;
  api_key: string; base_url: string; model: string; protocol: string;
}

interface DevConfig {
  temperature: number; top_p: number; max_tokens: number;
  frequency_penalty: number; presence_penalty: number;
  system_messages: Record<string, SystemMessageItem>;
  input_templates: Record<string, InputTemplateItem>;
  providers?: ProviderEntry[]; active_provider_id?: string | null;
}

const PROVIDER_TYPES = [
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4.1-mini", defaultBase: "https://api.openai.com/v1" },
  { value: "anthropic", label: "Anthropic", defaultModel: "claude-sonnet-4-20250514", defaultBase: "" },
  { value: "deepseek", label: "DeepSeek", defaultModel: "deepseek-chat", defaultBase: "https://api.deepseek.com/v1" },
  { value: "openrouter", label: "OpenRouter", defaultModel: "openai/gpt-4.1-mini", defaultBase: "https://openrouter.ai/api/v1" },
  { value: "glm", label: "GLM (Zhipu)", defaultModel: "glm-4-plus", defaultBase: "https://open.bigmodel.cn/api/paas/v4" },
  { value: "minimax", label: "MiniMax", defaultModel: "MiniMax-Text-01", defaultBase: "https://api.minimax.chat/v1" },
  { value: "kimi", label: "Kimi (Moonshot)", defaultModel: "moonshot-v1-8k", defaultBase: "https://api.moonshot.cn/v1" },
  { value: "custom", label: "Custom Endpoint", defaultModel: "llama3.1:8b", defaultBase: "http://localhost:11434/v1" },
];

const PROTOCOL_OPTIONS = [
  { value: "openai", label: "OpenAI-compatible" },
  { value: "anthropic", label: "Anthropic-compatible" },
];

const EMPTY_PROVIDER_DRAFT = {
  name: "", type: "openai", api_key: "", base_url: "", model: "", protocol: "openai",
};

const taskLabels: Record<string, string> = {
  extraction: "Extraction", chat: "Chat Q&A", skill_default: "Skills (Default)",
};

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
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />{label}
        </Label>
        <span className="text-sm font-mono tabular-nums text-muted-foreground">
          {value.toFixed(step < 1 ? 2 : 0)}{unit || ""}
        </span>
      </div>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 rounded-full bg-muted appearance-none cursor-pointer
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
          [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background"
        style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${pct}%, hsl(var(--muted)) ${pct}%)` }}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  // ── Tab ──────────────────────────────────────────────────────────────
  const [tab, setTab] = useState("providers");

  // ── General settings ─────────────────────────────────────────────────
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mockAi, setMockAi] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(50);
  const [parserPriority, setParserPriority] = useState("mineru_only");
  const [mineruApiEnabled, setMineruApiEnabled] = useState(false);
  const [mineruApiMode, setMineruApiMode] = useState("cloud");
  const [mineruApiKey, setMineruApiKey] = useState("");
  const [mineruApiKeyConfigured, setMineruApiKeyConfigured] = useState(false);
  const [clearMineruApiKey, setClearMineruApiKey] = useState(false);
  const [mineruApiBaseUrl, setMineruApiBaseUrl] = useState("https://mineru.net");
  const [mineruApiModel, setMineruApiModel] = useState("pipeline");
  const [mineruApiEnableFormula, setMineruApiEnableFormula] = useState(true);
  const [mineruApiIsOcr, setMineruApiIsOcr] = useState(false);
  const [mineruApiLanguage, setMineruApiLanguage] = useState("en");
  const [apiBaseUrl, setApiBaseUrl] = useState("http://localhost:8000");
  const [openReviewUsername, setOpenReviewUsername] = useState("");
  const [openReviewPassword, setOpenReviewPassword] = useState("");
  const [openReviewAccessToken, setOpenReviewAccessToken] = useState("");
  const [openReviewPasswordConfigured, setOpenReviewPasswordConfigured] = useState(false);
  const [openReviewAccessTokenConfigured, setOpenReviewAccessTokenConfigured] = useState(false);
  const [clearOpenReviewPassword, setClearOpenReviewPassword] = useState(false);
  const [clearOpenReviewAccessToken, setClearOpenReviewAccessToken] = useState(false);
  const [parsers, setParsers] = useState<ParserInfo[]>([]);
  const [parserBusy, setParserBusy] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Dev config ───────────────────────────────────────────────────────
  const [config, setConfig] = useState<DevConfig | null>(null);

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
  const [addProviderStepIndex, setAddProviderStepIndex] = useState(0);
  const [deleteProviderId, setDeleteProviderId] = useState<string | null>(null);
  const [editProviderId, setEditProviderId] = useState<string | null>(null);
  const [newProvider, setNewProvider] = useState(EMPTY_PROVIDER_DRAFT);
  const [editProvider, setEditProvider] = useState(EMPTY_PROVIDER_DRAFT);
  const [provSaving, setProvSaving] = useState(false);

  // Enlarged view dialog
  const [enlarged, setEnlarged] = useState<{ title: string; name: string; content: string; kind: "system-message" | "input-template" } | null>(null);
  const [enlargedEditing, setEnlargedEditing] = useState(false);
  const [enlargedContent, setEnlargedContent] = useState("");
  const [enlargedSaving, setEnlargedSaving] = useState(false);

  useEffect(() => {
    Promise.all([loadSettings(), loadDevConfig()]).finally(() => setLoading(false));
  }, []);

  // ── Loaders ───────────────────────────────────────────────────────────

  const loadSettings = async () => {
    try {
      const res = await apiRawFetch("/settings");
      if (!res.ok) throw new Error("Failed");
      const d = await res.json();
      setSettings(d);
      setMockAi(d.use_mock_ai);
      setMaxUploadMb(d.max_upload_mb);
      setParserPriority(d.parser_priority);
      setMineruApiEnabled(Boolean(d.mineru_api_enabled));
      setMineruApiMode(d.mineru_api_mode || "cloud");
      setMineruApiKeyConfigured(Boolean(d.mineru_api_key));
      setMineruApiBaseUrl(d.mineru_api_base_url || "https://mineru.net");
      setMineruApiModel(d.mineru_api_model || "pipeline");
      setMineruApiEnableFormula(Boolean(d.mineru_api_enable_formula));
      setMineruApiIsOcr(Boolean(d.mineru_api_is_ocr));
      setMineruApiLanguage(d.mineru_api_language || "en");
      setApiBaseUrl(d.api_base_url || "http://localhost:8000");
      setOpenReviewUsername(d.openreview_username || "");
      setOpenReviewPasswordConfigured(Boolean(d.openreview_password_configured));
      setOpenReviewAccessTokenConfigured(Boolean(d.openreview_access_token_configured));
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Settings load failed"); }
  };

  const loadDevConfig = async () => {
    try {
      const res = await apiRawFetch("/dev");
      if (!res.ok) throw new Error("Failed");
      const d: DevConfig = await res.json();
      setConfig(d);
      setProviders(d.providers || []);
      setActiveProviderId(d.active_provider_id || null);
      const sm: Record<string, string> = {};
      for (const [k, v] of Object.entries(d.system_messages)) sm[k] = v.content;
      setSystemMessages(sm);
      setInputTemplates(d.input_templates);
      setTemperature(d.temperature);
      setTopP(d.top_p);
      setMaxTokens(d.max_tokens);
      setFreqPenalty(d.frequency_penalty);
      setPresPenalty(d.presence_penalty);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Dev config load failed"); }
  };

  // ── Parser install/remove handlers ───────────────────────────────────
  const refreshParsers = () => { listParsers().then(setParsers).catch(() => {}); };

  const handleInstallDocling = async () => {
    setParserBusy("docling");
    try {
      const res = await installParser("docling");
      if (res && res.installed) {
        toast.success("Docling installed — ready to use.");
      } else {
        toast.error(res && res.error ? "Docling install failed: " + res.error : "Docling install failed.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Docling install failed.");
    } finally {
      setParserBusy(null);
      refreshParsers();
    }
  };

  const handleUninstallDocling = async () => {
    setParserBusy("docling");
    try {
      const res = await uninstallParser("docling");
      if (res && !res.installed) {
        toast.success("Docling removed.");
      } else {
        toast.error("Docling could not be fully removed.");
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Docling removal failed.");
    } finally {
      setParserBusy(null);
      refreshParsers();
    }
  };

  // ── Saves ─────────────────────────────────────────────────────────────

  const handleGeneralSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        max_upload_mb: maxUploadMb,
        parser_priority: parserPriority,
        mineru_api_enabled: mineruApiEnabled,
        mineru_api_mode: mineruApiMode,
        mineru_api_base_url: mineruApiBaseUrl,
        mineru_api_model: mineruApiModel,
        mineru_api_enable_formula: mineruApiEnableFormula,
        mineru_api_is_ocr: mineruApiIsOcr,
        mineru_api_language: mineruApiLanguage,
        api_base_url: apiBaseUrl,
        ...buildOpenReviewSettingsPayload({
          username: openReviewUsername,
          password: openReviewPassword,
          accessToken: openReviewAccessToken,
          clearPassword: clearOpenReviewPassword,
          clearAccessToken: clearOpenReviewAccessToken,
        }),
      };
      if (clearMineruApiKey) {
        body.mineru_api_key = "";
      } else if (mineruApiKey.trim()) {
        body.mineru_api_key = mineruApiKey.trim();
      }
      const res = await apiRawFetch("/settings", {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      const updated: SettingsData = await res.json();
      setSettings(updated);
      setMineruApiKeyConfigured(Boolean(updated.mineru_api_key));
      setMineruApiKey("");
      setClearMineruApiKey(false);
      setOpenReviewUsername(updated.openreview_username || "");
      setOpenReviewPasswordConfigured(Boolean(updated.openreview_password_configured));
      setOpenReviewAccessTokenConfigured(Boolean(updated.openreview_access_token_configured));
      setOpenReviewPassword("");
      setOpenReviewAccessToken("");
      setClearOpenReviewPassword(false);
      setClearOpenReviewAccessToken(false);
      toast.success("General settings saved");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  const saveSystemMessage = async (name: string) => {
    setSmSaving(true);
    try {
      const res = await apiRawFetch(`/dev/system-messages/${name}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: editSmContent }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setSystemMessages((prev) => ({ ...prev, [name]: editSmContent }));
      setEditingSm(null);
      toast.success(`System message "${name}" saved`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSmSaving(false); }
  };

  const saveInputTemplate = async (name: string) => {
    setItSaving(true);
    try {
      const res = await apiRawFetch(`/dev/input-templates/${name}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template: editItTemplate }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setInputTemplates((prev) => ({ ...prev, [name]: { ...prev[name], template: editItTemplate } }));
      setEditingIt(null);
      toast.success(`Input template "${name}" saved`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setItSaving(false); }
  };

  const saveModelParams = async () => {
    setMpSaving(true);
    try {
      const res = await apiRawFetch("/dev/model-params", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperature, top_p: topP, max_tokens: maxTokens, frequency_penalty: freqPenalty, presence_penalty: presPenalty }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      setMpDirty(false);
      toast.success("Model parameters saved");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setMpSaving(false); }
  };

  const applyPreset = (preset: "precise" | "balanced" | "creative") => {
    const presets = {
      precise: { temperature: 0.2, top_p: 0.8, freq_penalty: 0.0, pres_penalty: 0.0 },
      balanced: { temperature: 0.7, top_p: 0.95, freq_penalty: 0.0, pres_penalty: 0.0 },
      creative: { temperature: 1.2, top_p: 0.98, freq_penalty: 0.3, pres_penalty: 0.2 },
    };
    const p = presets[preset];
    setTemperature(p.temperature); setTopP(p.top_p);
    setFreqPenalty(p.freq_penalty); setPresPenalty(p.pres_penalty);
    setMpDirty(true);
  };

  // ── Loading ───────────────────────────────────────────────────────────

  const addProviderSteps = getProviderAddWizardSteps(newProvider);
  const currentAddProviderStepIndex = Math.min(addProviderStepIndex, addProviderSteps.length - 1);
  const currentAddProviderStep = addProviderSteps[currentAddProviderStepIndex];
  const canAdvanceAddProvider = canContinueProviderAddStep(newProvider, currentAddProviderStep);
  const addProviderProgress = ((currentAddProviderStepIndex + 1) / addProviderSteps.length) * 100;

  const resetAddProviderDialog = () => {
    setShowAddForm(false);
    setAddProviderStepIndex(0);
    setNewProvider(EMPTY_PROVIDER_DRAFT);
  };

  const updateNewProviderType = (type: string) => {
    const preset = PROVIDER_TYPES.find((x) => x.value === type);
    setNewProvider((p) => ({
      ...p,
      type,
      base_url: preset?.defaultBase || "",
      model: preset?.defaultModel || "",
      protocol: type === "anthropic" ? "anthropic" : "openai",
    }));
  };

  const goToNextAddProviderStep = () => {
    if (!canAdvanceAddProvider) {
      toast.error(currentAddProviderStep === "model" ? "Model name is required" : "Provider name is required");
      return;
    }
    setAddProviderStepIndex((step) => Math.min(step + 1, addProviderSteps.length - 1));
  };

  const saveNewProvider = async () => {
    if (!canContinueProviderAddStep(newProvider, "name")) { toast.error("Provider name is required"); return; }
    if (!canContinueProviderAddStep(newProvider, "model")) { toast.error("Model name is required"); return; }
    setProvSaving(true);
    try {
      const res = await apiRawFetch("/dev/providers", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({
          ...newProvider,
          name: newProvider.name.trim(),
          model: newProvider.model.trim(),
        }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Failed");
      const created: ProviderEntry = await res.json();
      setProviders((prev) => [...prev, created]);
      if (!activeProviderId) setActiveProviderId(created.id);
      resetAddProviderDialog();
      toast.success(`Added ${created.name}`);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setProvSaving(false); }
  };

  if (loading) {
    return <div className="max-w-3xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48"/><Skeleton className="h-96 w-full"/>
    </div>;
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <FadeIn>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-balance">Settings</h1>
            <p className="text-sm text-muted-foreground">
              Configure AI providers, system messages, model parameters, parsers, and general preferences.
            </p>
          </div>
        </div>
      </FadeIn>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full flex-wrap">
          <TabsTrigger value="providers" className="gap-1.5"><Server className="h-4 w-4"/>Providers</TabsTrigger>
          <TabsTrigger value="system-messages" className="gap-1.5"><MessageSquare className="h-4 w-4"/>System Msgs</TabsTrigger>
          <TabsTrigger value="input-templates" className="gap-1.5"><FileCode className="h-4 w-4"/>Templates</TabsTrigger>
          <TabsTrigger value="model-params" className="gap-1.5"><SlidersHorizontal className="h-4 w-4"/>Model Params</TabsTrigger>
          <TabsTrigger value="general" className="gap-1.5"><Settings2 className="h-4 w-4"/>General</TabsTrigger>
          <TabsTrigger value="data" className="gap-1.5"><Database className="h-4 w-4"/>Data</TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">

          {/* ── Providers Tab ──────────────────────────────────────── */}
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
                    <div key={p.id} className={`flex items-center justify-between p-4 rounded-xl border transition-colors ${
                      activeProviderId === p.id ? "border-primary bg-primary/5" : "hover:bg-accent/50"
                    }`}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          activeProviderId === p.id ? "bg-primary/20" : "bg-muted"
                        }`}>
                          <Brain className={`h-4 w-4 ${activeProviderId === p.id ? "text-primary" : "text-muted-foreground"}`} />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">{p.name}</span>
                            {activeProviderId === p.id && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full flex-shrink-0">
                                <CheckCircle2 className="h-3 w-3" /> Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5 truncate">
                            {p.type}{p.protocol === "anthropic" ? " (Anthropic protocol)" : ""} · {p.model || "default"} {p.base_url ? `· ${p.base_url}` : ""}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
                        {activeProviderId !== p.id && (
                          <Button variant="outline" size="sm" className="h-8 text-xs"
                            onClick={async () => {
                              try {
                                const res = await apiRawFetch("/dev/providers/active", {
                                  method: "PUT", headers: {"Content-Type":"application/json"},
                                  body: JSON.stringify({provider_id: p.id}),
                                });
                                if (!res.ok) throw new Error("Failed");
                                setActiveProviderId(p.id);
                                toast.success(`Active provider: ${p.name}`);
                              } catch { toast.error("Failed to set active provider"); }
                            }}>Set Active</Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground"
                          title="Edit provider"
                          aria-label={`Edit ${p.name}`}
                          onClick={() => {
                            setEditProviderId(p.id);
                            setEditProvider(createProviderEditDraft(p));
                          }}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => setDeleteProviderId(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

              {/* Delete confirmation dialog */}
              <Dialog open={!!deleteProviderId} onOpenChange={(open) => { if (!open) setDeleteProviderId(null); }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Delete Provider</DialogTitle>
                    <DialogDescription>
                      Permanently delete this provider configuration? This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteProviderId(null)}>Cancel</Button>
                    <Button variant="destructive" onClick={async () => {
                      if (!deleteProviderId) return;
                      const pid = deleteProviderId;
                      setDeleteProviderId(null);
                      try {
                        const res = await apiRawFetch(`/dev/providers/${pid}`, { method: "DELETE" });
                        if (!res.ok) throw new Error("Failed");
                        setProviders((prev) => prev.filter((x) => x.id !== pid));
                        if (activeProviderId === pid) setActiveProviderId(null);
                        const deleted = providers.find((p) => p.id === pid);
                        toast.success(`Deleted ${deleted?.name || pid}`);
                      } catch { toast.error("Failed to delete"); }
                    }}>Delete Permanently</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Edit provider dialog */}
              <Dialog open={!!editProviderId} onOpenChange={(open) => {
                if (!open) {
                  setEditProviderId(null);
                  setEditProvider(EMPTY_PROVIDER_DRAFT);
                }
              }}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Provider</DialogTitle>
                    <DialogDescription>
                      Update provider details. Leave API key blank to keep the saved key.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Name</Label>
                        <Input value={editProvider.name}
                          onChange={(e) => setEditProvider((p) => ({...p, name: e.target.value}))}
                          placeholder="My Provider" className="h-9" />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Provider Type</Label>
                        <select value={editProvider.type} onChange={(e) => {
                          const t = PROVIDER_TYPES.find((x) => x.value === e.target.value);
                          setEditProvider((p) => ({
                            ...p, type: e.target.value, base_url: t?.defaultBase || "",
                            model: t?.defaultModel || "",
                            protocol: e.target.value === "anthropic" ? "anthropic" : "openai",
                          }));
                        }} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                          {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {editProvider.type === "custom" && (
                      <div className="space-y-1.5">
                        <Label className="text-xs flex items-center gap-1.5">
                          <SwitchCamera className="h-3 w-3 text-muted-foreground" /> Protocol
                        </Label>
                        <Select value={editProvider.protocol} onValueChange={(v) => setEditProvider((p) => ({...p, protocol: v}))}>
                          <SelectTrigger className="h-9"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {PROTOCOL_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-[11px] text-muted-foreground">
                          OpenAI = <code className="bg-muted px-1 rounded text-[10px]">/v1/chat/completions</code> 路 Anthropic = <code className="bg-muted px-1 rounded text-[10px]">/v1/messages</code>
                        </p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label className="text-xs">New API Key</Label>
                      <Input value={editProvider.api_key}
                        onChange={(e) => setEditProvider((p) => ({...p, api_key: e.target.value}))}
                        placeholder="Leave blank to keep current key"
                        type="password" className="h-9 font-mono" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Base URL</Label>
                      <Input value={editProvider.base_url}
                        onChange={(e) => setEditProvider((p) => ({...p, base_url: e.target.value}))}
                        placeholder="https://api.openai.com/v1" className="h-9 font-mono text-xs" />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Model</Label>
                      <Input value={editProvider.model}
                        onChange={(e) => setEditProvider((p) => ({...p, model: e.target.value}))}
                        placeholder="gpt-4.1-mini" className="h-9" />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => {
                      setEditProviderId(null);
                      setEditProvider(EMPTY_PROVIDER_DRAFT);
                    }}>Cancel</Button>
                    <Button onClick={async () => {
                      if (!editProviderId) return;
                      if (!editProvider.name.trim()) { toast.error("Name is required"); return; }
                      setProvSaving(true);
                      try {
                        const res = await apiRawFetch(`/dev/providers/${editProviderId}`, {
                          method: "PUT", headers: {"Content-Type":"application/json"},
                          body: JSON.stringify(buildProviderUpdatePayload(editProvider)),
                        });
                        if (!res.ok) throw new Error((await res.json()).detail || "Failed");
                        const updated: ProviderEntry = await res.json();
                        setProviders((prev) => prev.map((p) => p.id === updated.id ? updated : p));
                        setEditProviderId(null);
                        setEditProvider(EMPTY_PROVIDER_DRAFT);
                        toast.success(`Updated ${updated.name}`);
                      } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Failed"); }
                      finally { setProvSaving(false); }
                    }} disabled={provSaving}>
                      {provSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>} Save Changes
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Add provider dialog */}
              <Button variant="outline" className="w-full gap-2 h-10" onClick={() => {
                setShowAddForm(true);
                setAddProviderStepIndex(0);
              }}>
                <Plus className="h-4 w-4" /> Add Provider
              </Button>

              <Dialog open={showAddForm} onOpenChange={(open) => {
                if (open) setShowAddForm(true);
                else resetAddProviderDialog();
              }}>
                <DialogContent className="sm:max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Add LLM Provider</DialogTitle>
                    <DialogDescription>
                      Step {currentAddProviderStepIndex + 1} of {addProviderSteps.length}
                    </DialogDescription>
                  </DialogHeader>

                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full bg-primary transition-all" style={{ width: `${addProviderProgress}%` }} />
                  </div>

                  <div className="min-h-[220px] space-y-4 py-2">
                    {currentAddProviderStep === "name" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">What should this provider be called?</Label>
                        <Input value={newProvider.name}
                          onChange={(e) => setNewProvider((p) => ({...p, name: e.target.value}))}
                          placeholder="My Research Provider" className="h-11" autoFocus />
                      </div>
                    )}

                    {currentAddProviderStep === "type" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">Which provider type is it?</Label>
                        <select value={newProvider.type} onChange={(e) => updateNewProviderType(e.target.value)}
                          className="w-full h-11 rounded-md border bg-background px-3 text-sm">
                          {PROVIDER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    )}

                    {currentAddProviderStep === "protocol" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold flex items-center gap-2">
                          <SwitchCamera className="h-4 w-4 text-muted-foreground" /> Which protocol should it use?
                        </Label>
                        <Select value={newProvider.protocol} onValueChange={(v) => setNewProvider((p) => ({...p, protocol: v}))}>
                          <SelectTrigger className="h-11"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            {PROTOCOL_OPTIONS.map((o) => (
                              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}

                    {currentAddProviderStep === "api_key" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">What API key should it use?</Label>
                        <Input value={newProvider.api_key}
                          onChange={(e) => setNewProvider((p) => ({...p, api_key: e.target.value}))}
                          placeholder={newProvider.type === "custom" ? "ollama or your-key" : "sk-..."}
                          type="password" className="h-11 font-mono" />
                        <p className="text-xs text-muted-foreground">Leave blank for local endpoints or mock fallback.</p>
                      </div>
                    )}

                    {currentAddProviderStep === "base_url" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">What base URL should it use?</Label>
                        <Input value={newProvider.base_url}
                          onChange={(e) => setNewProvider((p) => ({...p, base_url: e.target.value}))}
                          placeholder="https://api.openai.com/v1" className="h-11 font-mono text-sm" />
                      </div>
                    )}

                    {currentAddProviderStep === "model" && (
                      <div className="space-y-3">
                        <Label className="text-base font-semibold">What model name should it use?</Label>
                        <Input value={newProvider.model}
                          onChange={(e) => setNewProvider((p) => ({...p, model: e.target.value}))}
                          placeholder="gpt-4.1-mini" className="h-11" autoFocus />
                      </div>
                    )}
                  </div>

                  <DialogFooter className="gap-2 sm:justify-between">
                    <Button variant="outline" onClick={() => setAddProviderStepIndex((step) => Math.max(0, step - 1))}
                      disabled={currentAddProviderStepIndex === 0 || provSaving}>
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
                    </Button>
                    <div className="flex gap-2">
                      <Button variant="ghost" onClick={resetAddProviderDialog} disabled={provSaving}>Cancel</Button>
                      {currentAddProviderStepIndex === addProviderSteps.length - 1 ? (
                        <Button onClick={saveNewProvider} disabled={!canAdvanceAddProvider || provSaving}>
                          {provSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Plus className="h-3.5 w-3.5 mr-1"/>} Add
                        </Button>
                      ) : (
                        <Button onClick={goToNextAddProviderStep} disabled={!canAdvanceAddProvider || provSaving}>
                          Next <ArrowRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      )}
                    </div>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

            </motion.div>
          )}

          {/* ── System Messages Tab ────────────────────────────────── */}
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
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEnlarged({ title: taskLabels[name] || name.replace(/_/g, " "), name, content, kind: "system-message" }); setEnlargedEditing(false); }}>
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {editingSm === name ? (
                        <div className="space-y-2">
                          <Textarea value={editSmContent} onChange={(e) => setEditSmContent(e.target.value)}
                            rows={8} className="font-mono text-xs resize-y" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingSm(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => saveSystemMessage(name)} disabled={smSaving}>
                              {smSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>} Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-28 overflow-y-auto border">{content}</pre>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Input Templates Tab ────────────────────────────────── */}
          {tab === "input-templates" && (
            <motion.div key="it" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4 space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Input Templates</CardTitle>
                  <CardDescription>
                    Pure data-injection wrappers. Use <code className="bg-muted px-1 rounded text-xs">{"{document}"}</code>,{" "}
                    <code className="bg-muted px-1 rounded text-xs">{"{question}"}</code>,{" "}
                    <code className="bg-muted px-1 rounded text-xs">{"{title}"}</code> as placeholders.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  {Object.entries(inputTemplates).map(([name, item]) => (
                    <div key={name}>
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold capitalize">
                          {taskLabels[name] || name.replace(/_/g, " ")}
                        </h3>
                        <Button variant="ghost" size="icon" className="h-7 w-7"
                          onClick={() => { setEnlarged({ title: taskLabels[name] || name.replace(/_/g, " "), name, content: item.template, kind: "input-template" }); setEnlargedEditing(false); }}>
                          <Maximize2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      {editingIt === name ? (
                        <div className="space-y-2">
                          <Textarea value={editItTemplate} onChange={(e) => setEditItTemplate(e.target.value)}
                            rows={5} className="font-mono text-xs resize-y" />
                          <div className="flex gap-2 justify-end">
                            <Button variant="ghost" size="sm" onClick={() => setEditingIt(null)}>Cancel</Button>
                            <Button size="sm" onClick={() => saveInputTemplate(name)} disabled={itSaving}>
                              {itSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>} Save
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 whitespace-pre-wrap break-all max-h-24 overflow-y-auto border">{item.template}</pre>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Model Params Tab ───────────────────────────────────── */}
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
                  <SliderField label="Top P" value={topP} min={0} max={1} step={0.01}
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

          {/* ── General Tab ────────────────────────────────────────── */}
          {tab === "general" && (
            <motion.div key="general" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="general" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle>Limits</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-1.5">
                      <Label>Max Upload Size (MB)</Label>
                      <Input type="number" value={maxUploadMb} onChange={(e) => setMaxUploadMb(Number(e.target.value))} min={1} max={500} className="w-32"/>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>PDF Parser Priority</CardTitle><CardDescription>Choose which parser to use for PDF documents.</CardDescription></CardHeader>
                  <CardContent>
                    <Select value={parserPriority} onValueChange={setParserPriority}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mineru_only">MinerU only (strict — error if not configured)</SelectItem>
                        <SelectItem value="mineru_first">MinerU first (fallback: Docling → pypdf)</SelectItem>
                        <SelectItem value="docling">Docling</SelectItem>
                        <SelectItem value="pypdf">pypdf (built-in)</SelectItem>
                        <SelectItem value="ocr">OCR (Tesseract)</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                {/* MinerU API */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4"/>MinerU API</CardTitle>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Enable</Label>
                        <Switch checked={mineruApiEnabled} onCheckedChange={setMineruApiEnabled}/>
                      </div>
                    </div>
                    <CardDescription>
                      Parse PDFs via a remote MinerU service — no local MinerU install needed. Cloud mode uses the hosted Precision API at mineru.net; self-hosted mode talks to your own mineru-api service.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div className="space-y-1.5">
                        <Label>Mode</Label>
                        <Select value={mineruApiMode} onValueChange={setMineruApiMode}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="cloud">Cloud (mineru.net, token)</SelectItem>
                            <SelectItem value="selfhosted">Self-hosted (mineru-api)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Model</Label>
                        <Select value={mineruApiModel} onValueChange={setMineruApiModel}>
                          <SelectTrigger><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pipeline">pipeline</SelectItem>
                            <SelectItem value="vlm">vlm</SelectItem>
                            <SelectItem value="MinerU-HTML">MinerU-HTML</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>API base URL</Label>
                      <Input
                        value={mineruApiBaseUrl}
                        onChange={(e) => setMineruApiBaseUrl(e.target.value)}
                        placeholder="https://mineru.net"
                        disabled={mineruApiMode === "cloud"}
                      />
                    </div>
                    {mineruApiMode === "cloud" && (
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Label htmlFor="mineru-api-key">API token</Label>
                          {mineruApiKeyConfigured && !clearMineruApiKey && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setClearMineruApiKey(true); setMineruApiKey(""); }}>
                              Clear saved token
                            </Button>
                          )}
                          {clearMineruApiKey && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setClearMineruApiKey(false)}>
                              <RotateCcw className="mr-1 h-3 w-3"/>Keep saved token
                            </Button>
                          )}
                        </div>
                        <Input
                          id="mineru-api-key"
                          type="password"
                          autoComplete="off"
                          value={mineruApiKey}
                          disabled={clearMineruApiKey}
                          onChange={(e) => { setMineruApiKey(e.target.value); setClearMineruApiKey(false); }}
                          placeholder={mineruApiKeyConfigured ? "Saved — leave blank to keep" : "Get a token at https://mineru.net"}
                        />
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4">
                      <div className="flex items-center gap-2">
                        <Switch checked={mineruApiEnableFormula} onCheckedChange={setMineruApiEnableFormula}/>
                        <Label className="text-sm">Formula recognition (LaTeX)</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch checked={mineruApiIsOcr} onCheckedChange={setMineruApiIsOcr}/>
                        <Label className="text-sm">Force OCR</Label>
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-sm">Language</Label>
                        <Input value={mineruApiLanguage} onChange={(e) => setMineruApiLanguage(e.target.value)} className="w-20"/>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Public API base URL (for image links)</Label>
                      <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="http://localhost:8000"/>
                      <p className="text-xs text-muted-foreground">Used to build absolute image URLs in parsed markdown. Leave the default unless the API runs on a different host or port.</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2"><KeyRound className="h-4 w-4"/>OpenReview imports</CardTitle>
                    <CardDescription>
                      OpenReview may require a verified account before it serves PDFs. Credentials stay in this app&apos;s local settings and are sent only to api2.openreview.net. An access token is preferred when configured.
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="openreview-username">Username or email</Label>
                      <Input
                        id="openreview-username"
                        autoComplete="username"
                        value={openReviewUsername}
                        onChange={(event) => setOpenReviewUsername(event.target.value)}
                        placeholder="name@example.com"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="openreview-password">Password</Label>
                        {openReviewPasswordConfigured && !clearOpenReviewPassword && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setClearOpenReviewPassword(true); setOpenReviewPassword(""); }}>
                            Clear saved password
                          </Button>
                        )}
                        {clearOpenReviewPassword && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setClearOpenReviewPassword(false)}>
                            <RotateCcw className="mr-1 h-3 w-3"/>Keep saved password
                          </Button>
                        )}
                      </div>
                      <Input
                        id="openreview-password"
                        type="password"
                        autoComplete="current-password"
                        value={openReviewPassword}
                        disabled={clearOpenReviewPassword}
                        onChange={(event) => { setOpenReviewPassword(event.target.value); setClearOpenReviewPassword(false); }}
                        placeholder={openReviewPasswordConfigured ? "Saved — leave blank to keep" : "Optional when using an access token"}
                      />
                      {clearOpenReviewPassword && <p className="text-xs text-destructive">The saved password will be cleared when you save.</p>}
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor="openreview-access-token">Access token</Label>
                        {openReviewAccessTokenConfigured && !clearOpenReviewAccessToken && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setClearOpenReviewAccessToken(true); setOpenReviewAccessToken(""); }}>
                            Clear saved token
                          </Button>
                        )}
                        {clearOpenReviewAccessToken && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setClearOpenReviewAccessToken(false)}>
                            <RotateCcw className="mr-1 h-3 w-3"/>Keep saved token
                          </Button>
                        )}
                      </div>
                      <Input
                        id="openreview-access-token"
                        type="password"
                        autoComplete="off"
                        value={openReviewAccessToken}
                        disabled={clearOpenReviewAccessToken}
                        onChange={(event) => { setOpenReviewAccessToken(event.target.value); setClearOpenReviewAccessToken(false); }}
                        placeholder={openReviewAccessTokenConfigured ? "Saved — leave blank to keep" : "Optional; preferred over password login"}
                      />
                      <p className="text-xs text-muted-foreground">Use a token for an account that requires MFA. Existing secrets are never loaded back into this page.</p>
                      {clearOpenReviewAccessToken && <p className="text-xs text-destructive">The saved access token will be cleared when you save.</p>}
                    </div>
                  </CardContent>
                </Card>

                {/* Installed Parsers */}
                <Card>
                  <CardHeader>
                    <CardTitle>Installed Parsers</CardTitle>
                    <CardDescription>
                      <Button variant="link" className="h-auto p-0 text-xs" onClick={refreshParsers}>
                        Click to refresh
                      </Button>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {parsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Click &quot;refresh&quot; to load installed parsers…</p>
                    ) : (
                      <div className="space-y-3">
                        {parsers.map((p) => (
                          <div key={p.key} className="flex items-start gap-3 p-3 rounded-lg border">
                            <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${p.installed ? "bg-green-500" : "bg-muted-foreground/30"}`}/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{p.name}</span>
                                {p.version && <span className="text-[10px] text-muted-foreground font-mono">{p.version}</span>}
                              </div>
                              <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                              {p.install_cmd && <code className="text-[10px] bg-muted px-1.5 py-0.5 rounded mt-1.5 inline-block">{p.install_cmd}</code>}
                              {p.key === "docling" && (
                                <div className="mt-2">
                                  {p.installed ? (
                                    <Button size="sm" variant="outline" onClick={handleUninstallDocling} disabled={parserBusy === "docling"}>
                                      {parserBusy === "docling" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Remove
                                    </Button>
                                  ) : (
                                    <Button size="sm" onClick={handleInstallDocling} disabled={parserBusy === "docling"}>
                                      {parserBusy === "docling" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Install Docling
                                    </Button>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle className="text-muted-foreground flex items-center gap-2"><Server className="h-4 w-4"/>Server</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                      <span>Host</span><code className="text-xs">{settings?.host||"—"}</code>
                      <span>Port</span><code className="text-xs">{settings?.port||"—"}</code>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex gap-2 justify-end">
                  <Button size="sm" onClick={handleGeneralSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Save className="h-4 w-4 mr-1"/>} Save
                  </Button>
                </div>
              </TabsContent>
            </motion.div>
          )}

          {/* ── Data Tab ──────────────────────────────────────────── */}
          {tab === "data" && (
            <motion.div key="data" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }} className="mt-4">
              <Card>
                <CardHeader>
                  <CardTitle>Data</CardTitle>
                  <CardDescription>Export or import settings + articles as JSON.</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-3">
                  <Button variant="outline" className="gap-2" onClick={async () => {
                    const res = await apiRawFetch("/settings/export");
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a"); a.href = url; a.download = "settings-export.json"; a.click();
                    URL.revokeObjectURL(url);
                  }}><Download className="h-4 w-4"/> Export</Button>
                  <Button variant="outline" className="gap-2" onClick={() => {
                    const input = document.createElement("input"); input.type = "file"; input.accept = ".json";
                    input.onchange = async (e) => {
                      const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
                      const form = new FormData(); form.append("file", file);
                      try {
                        const res = await apiRawFetch("/settings/import", { method: "POST", body: form });
                        if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
                        toast.success("Settings imported — reloading page...");
                        setTimeout(() => window.location.reload(), 800);
                      } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Import failed"); }
                    };
                    input.click();
                  }}><Upload className="h-4 w-4"/> Import</Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </Tabs>

      {/* Enlarged view dialog */}
      <Dialog open={!!enlarged} onOpenChange={(open) => { if (!open) { setEnlarged(null); setEnlargedEditing(false); } }}>
        <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{enlarged?.title || "View"}</DialogTitle>
            <DialogDescription>
              {enlargedEditing ? "Edit the content below and save." : "Full content — scroll to read. Close when done."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-2 -mt-2 mb-2">
            {!enlargedEditing ? (
              <Button variant="outline" size="sm" onClick={() => { setEnlargedEditing(true); setEnlargedContent(enlarged?.content || ""); }}>
                Edit
              </Button>
            ) : (
              <>
                <Button variant="ghost" size="sm" onClick={() => setEnlargedEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={async () => {
                  if (!enlarged) return;
                  setEnlargedSaving(true);
                  try {
                    const endpoint = enlarged.kind === "system-message"
                      ? `/dev/system-messages/${enlarged.name}`
                      : `/dev/input-templates/${enlarged.name}`;
                    const body = enlarged.kind === "system-message"
                      ? { content: enlargedContent }
                      : { template: enlargedContent };
                    const res = await apiRawFetch(endpoint, {
                      method: "PUT", headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(body),
                    });
                    if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
                    if (enlarged.kind === "system-message") {
                      setSystemMessages((prev) => ({ ...prev, [enlarged.name]: enlargedContent }));
                    } else {
                      setInputTemplates((prev) => ({ ...prev, [enlarged.name]: { ...prev[enlarged.name], template: enlargedContent } }));
                    }
                    setEnlarged({ ...enlarged, content: enlargedContent });
                    setEnlargedEditing(false);
                    toast.success(`Saved "${enlarged.title}"`);
                  } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
                  finally { setEnlargedSaving(false); }
                }} disabled={enlargedSaving}>
                  {enlargedSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1"/> : <Save className="h-3.5 w-3.5 mr-1"/>} Save
                </Button>
              </>
            )}
          </div>
          <pre
            contentEditable={enlargedEditing}
            suppressContentEditableWarning
            onInput={(e) => setEnlargedContent(e.currentTarget.textContent || "")}
            className={`flex-1 overflow-y-auto text-xs font-mono bg-muted/50 rounded-lg p-4 whitespace-pre-wrap break-all border outline-none ${
              enlargedEditing ? "ring-2 ring-ring" : ""
            }`}
          >
            {enlargedEditing ? enlargedContent : (enlarged?.content || "")}
          </pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
