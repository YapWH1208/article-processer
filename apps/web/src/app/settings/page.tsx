"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Save, Settings2, Server, Download, Upload, Loader2, FileCode, Code2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FadeIn } from "@/components/ui/animated";
import { listParsers } from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

// ── Types ────────────────────────────────────────────────────────────────

interface SettingsData {
  host: string; port: number; env_path: string;
  use_mock_ai: boolean; max_upload_mb: number; parser_priority: string;
}

interface ParserInfo { key: string; name: string; installed: boolean; version?: string; description: string; install_cmd?: string; }

// ── Page ─────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const [tab, setTab] = useState("general");
  const [settings, setSettings] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [mockAi, setMockAi] = useState(true);
  const [maxUploadMb, setMaxUploadMb] = useState(50);
  const [parserPriority, setParserPriority] = useState("mineru_first");
  const [parsers, setParsers] = useState<ParserInfo[]>([]);

  useEffect(() => { loadSettings(); }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/settings`);
      if (!res.ok) throw new Error("Failed to load");
      const d = await res.json();
      setSettings(d);
      setMockAi(d.use_mock_ai);
      setMaxUploadMb(d.max_upload_mb);
      setParserPriority(d.parser_priority);
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Load failed"); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = { use_mock_ai: mockAi, max_upload_mb: maxUploadMb, parser_priority: parserPriority };
      const res = await fetch(`${API_BASE}/settings`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");
      toast.success("Settings saved");
    } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Save failed"); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="max-w-2xl mx-auto"><FadeIn><Card className="p-8"><div className="animate-pulse space-y-3"><div className="h-4 w-48 bg-muted rounded"/><div className="h-8 w-full bg-muted rounded"/></div></Card></FadeIn></div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <FadeIn>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/10 flex items-center justify-center">
            <Settings2 className="h-5 w-5 text-indigo-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Stored in <code className="bg-muted px-1 rounded text-xs">{settings?.env_path || ".env"}</code>
            </p>
          </div>
        </div>
      </FadeIn>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full">
          <TabsTrigger value="general" className="gap-1.5 flex-1"><Settings2 className="h-4 w-4"/>General</TabsTrigger>
          <TabsTrigger value="parsers" className="gap-1.5 flex-1" onClick={() => { listParsers().then(setParsers).catch(() => {}); }}>
            <FileCode className="h-4 w-4"/>Parsers
          </TabsTrigger>
        </TabsList>

        <AnimatePresence mode="wait">
          {tab === "general" && (
            <motion.div key="general" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="general" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2"><Code2 className="h-5 w-5"/>LLM Providers</CardTitle>
                    <CardDescription>
                      Configure one or more LLM providers in the Developer Console.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button variant="default" className="gap-2" onClick={() => window.location.href = "/dev"}>
                      <Code2 className="h-4 w-4"/> Open /dev — Providers
                    </Button>
                  </CardContent>
                </Card>

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
                  <Button size="sm" onClick={handleSave} disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1"/> : <Save className="h-4 w-4 mr-1"/>} Save
                  </Button>
                </div>
              </TabsContent>
            </motion.div>
          )}

          {tab === "parsers" && (
            <motion.div key="parsers" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
              <TabsContent value="parsers" forceMount className="mt-4 space-y-4">
                <Card>
                  <CardHeader><CardTitle>PDF Parser Priority</CardTitle><CardDescription>Choose which parser to use for PDF documents.</CardDescription></CardHeader>
                  <CardContent>
                    <Select value={parserPriority} onValueChange={setParserPriority}>
                      <SelectTrigger><SelectValue/></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mineru_first">MinerU first (fallback: Docling → pypdf)</SelectItem>
                        <SelectItem value="docling">Docling</SelectItem>
                        <SelectItem value="pypdf">pypdf (built-in)</SelectItem>
                        <SelectItem value="ocr">OCR (Tesseract)</SelectItem>
                      </SelectContent>
                    </Select>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader><CardTitle>Installed Parsers</CardTitle></CardHeader>
                  <CardContent>
                    {parsers.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Click the Parsers tab to load…</p>
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
        </AnimatePresence>
      </Tabs>

      {/* Data Export/Import */}
      <Card>
        <CardHeader><CardTitle>Data</CardTitle><CardDescription>Export or import settings + articles.</CardDescription></CardHeader>
        <CardContent className="flex gap-3">
          <Button variant="outline" className="gap-2" onClick={async () => {
            const res = await fetch(`${API_BASE}/settings/export`);
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
                const res = await fetch(`${API_BASE}/settings/import`, { method: "POST", body: form });
                if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
                toast.success("Settings imported"); loadSettings();
              } catch (e: unknown) { toast.error(e instanceof Error ? e.message : "Import failed"); }
            };
            input.click();
          }}><Upload className="h-4 w-4"/> Import</Button>
        </CardContent>
      </Card>
    </div>
  );
}
