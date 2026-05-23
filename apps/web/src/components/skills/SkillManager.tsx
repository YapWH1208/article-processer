"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wand2, Plus, Trash2, Edit3, Download, Upload, X, Save, Loader2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface SkillDef {
  name: string; purpose: string; description: string;
  input_schema: Record<string, unknown>; output_schema: Record<string, unknown>;
  prompt_instructions?: string;
}

interface SkillManagerProps {
  skills: SkillDef[];
  onSkillsChanged: () => void;
}

export default function SkillManager({ skills, onSkillsChanged }: SkillManagerProps) {
  const [editingSkill, setEditingSkill] = useState<SkillDef | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingName, setDeletingName] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  // Form state
  const [formName, setFormName] = useState("");
  const [formPurpose, setFormPurpose] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formPrompt, setFormPrompt] = useState("");
  const [formOutputSchema, setFormOutputSchema] = useState("{}");

  const resetForm = () => {
    setFormName(""); setFormPurpose(""); setFormDesc(""); setFormPrompt(""); setFormOutputSchema("{}");
    setEditingSkill(null); setCreating(false);
  };

  const openEdit = (s: SkillDef) => {
    setEditingSkill(s); setCreating(false);
    setFormName(s.name); setFormPurpose(s.purpose); setFormDesc(s.description);
    setFormPrompt(s.prompt_instructions || "");
    setFormOutputSchema(JSON.stringify(s.output_schema, null, 2));
  };

  const openCreate = () => {
    resetForm(); setCreating(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      let outputSchema: Record<string, unknown> = {};
      try { outputSchema = JSON.parse(formOutputSchema); } catch { toast.error("Invalid JSON in output schema"); setSaving(false); return; }

      const body = {
        name: formName.trim(),
        purpose: formPurpose.trim(),
        description: formDesc.trim(),
        input_schema: { type: "object", properties: { article_id: { type: "integer" } }, required: ["article_id"] },
        output_schema: outputSchema,
        prompt_instructions: formPrompt.trim(),
      };

      const url = editingSkill
        ? `${API_BASE}/skills/${encodeURIComponent(editingSkill.name)}`
        : `${API_BASE}/skills`;
      const method = editingSkill ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Save failed");

      toast.success(editingSkill ? `Skill "${formName}" updated` : `Skill "${formName}" created`);
      resetForm();
      onSkillsChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally { setSaving(false); }
  };

  const handleDelete = async (name: string) => {
    setDeletingName(name);
    try {
      const res = await fetch(`${API_BASE}/skills/${encodeURIComponent(name)}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).detail || "Delete failed");
      toast.success(`Skill "${name}" deleted`);
      onSkillsChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally { setDeletingName(null); }
  };

  const handleExport = async () => {
    try {
      const res = await fetch(`${API_BASE}/skills/export`);
      if (!res.ok) throw new Error("Export failed");
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data.skills, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = "skills-export.json"; a.click();
      URL.revokeObjectURL(url);
      toast.success("Skills exported");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const handleImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const skills = JSON.parse(importText);
      const res = await fetch(`${API_BASE}/skills/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skills, overwrite: true }),
      });
      if (!res.ok) throw new Error((await res.json()).detail || "Import failed");
      const result = await res.json();
      toast.success(`Imported ${result.imported} skills${result.skipped ? `, ${result.skipped} skipped` : ""}`);
      setImportText(""); setImportOpen(false);
      onSkillsChanged();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Invalid JSON or import failed");
    } finally { setImporting(false); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm">Manage Skills</h3>
          <p className="text-xs text-muted-foreground">{skills.length} skills available</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5"/> New
          </Button>
          <Button size="sm" variant="outline" className="gap-1" onClick={handleExport}>
            <Download className="h-3.5 w-3.5"/> Export
          </Button>
          <Dialog open={importOpen} onOpenChange={setImportOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1"><Upload className="h-3.5 w-3.5"/> Import</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Import Skills</DialogTitle>
                <DialogDescription>Paste a JSON array of skill definitions.</DialogDescription>
              </DialogHeader>
              <Textarea
                value={importText} onChange={(e) => setImportText(e.target.value)}
                placeholder='[{"name": "my_skill", "purpose": "...", ...}]'
                className="min-h-[200px] font-mono text-xs"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                <Button onClick={handleImport} disabled={importing || !importText.trim()}>
                  {importing ? "Importing..." : "Import"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Create/Edit form */}
      <AnimatePresence>
        {(creating || editingSkill) && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
            <Card className="border-primary/20 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{creating ? "Create Skill" : `Edit: ${editingSkill?.name}`}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Name</Label>
                    <Input value={formName} onChange={(e) => setFormName(e.target.value)}
                      placeholder="my_custom_skill" className="h-8 text-xs" disabled={!!editingSkill} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Purpose (short label)</Label>
                    <Input value={formPurpose} onChange={(e) => setFormPurpose(e.target.value)}
                      placeholder="Extract custom info" className="h-8 text-xs" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Description</Label>
                  <Input value={formDesc} onChange={(e) => setFormDesc(e.target.value)}
                    placeholder="What this skill does..." className="h-8 text-xs" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Prompt Instructions</Label>
                  <Textarea value={formPrompt} onChange={(e) => setFormPrompt(e.target.value)}
                    placeholder="1. Extract X...&#10;2. List Y..." className="min-h-[100px] text-xs font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Output Schema (JSON)</Label>
                  <Textarea value={formOutputSchema} onChange={(e) => setFormOutputSchema(e.target.value)}
                    className="min-h-[80px] text-xs font-mono" />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Save className="h-3.5 w-3.5"/>}
                    {saving ? "Saving..." : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={resetForm}><X className="h-3.5 w-3.5"/> Cancel</Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Skill list */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2">
          {skills.map((s) => (
            <div key={s.name} className="flex items-start justify-between gap-2 p-3 rounded-md border bg-muted/30 hover:bg-muted/50 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{s.purpose}</span>
                  <Badge variant="secondary" className="text-[10px] font-mono">{s.name}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.description}</p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}>
                  <Edit3 className="h-3.5 w-3.5"/>
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                  disabled={deletingName === s.name}
                  onClick={() => handleDelete(s.name)}>
                  {deletingName === s.name ? <Loader2 className="h-3.5 w-3.5 animate-spin"/> : <Trash2 className="h-3.5 w-3.5"/>}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
