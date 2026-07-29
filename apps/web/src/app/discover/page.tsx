"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ExternalLink, FileSearch, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/components/LanguageProvider";
import {
  importConferenceCatalogPaper,
  importFromUrl,
  listConferenceCollections,
  searchArxivPapers,
  searchConferencePapers,
} from "@/lib/api";
import type { ArxivProvenance, ConferenceCollection, DiscoveryCandidate, DiscoveryPage, DiscoverySearchScope } from "@/lib/types";
import { translateUiText } from "@/lib/languageState.mjs";
import {
  DISCOVER_PAGE_SIZE,
  REQUIRED_CONFERENCE_COLLECTIONS,
  canAnalyseCandidate,
  createArxivProvenance,
  createDiscoverRequest,
  getDiscoverEmptyState,
} from "./discoverState.mjs";

type DiscoverMode = "arxiv" | "collection";

function sourceLabel(candidate: DiscoveryCandidate) {
  return candidate.source_provider === "arxiv" ? "arXiv" : candidate.collection?.toUpperCase().replace("_", " ") || "Conference";
}

function CandidateCard({ candidate, onPreview, onAnalyse, importing, copy }: {
  candidate: DiscoveryCandidate;
  onPreview: (candidate: DiscoveryCandidate) => void;
  onAnalyse: (candidate: DiscoveryCandidate) => void;
  importing: boolean;
  copy: (value: string) => string;
}) {
  const available = canAnalyseCandidate(candidate);
  const authors = candidate.authors.length ? candidate.authors.join(", ") : copy("Authors unavailable");

  return (
    <Card className="h-full">
      <CardHeader className="gap-3 p-5">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">{sourceLabel(candidate)}</Badge>
          {candidate.venue && <Badge variant="outline">{candidate.venue}</Badge>}
          {candidate.published_date && <span className="text-xs text-muted-foreground">{candidate.published_date}</span>}
        </div>
        <CardTitle className="text-lg leading-6">{candidate.title}</CardTitle>
        <CardDescription>{authors}</CardDescription>
      </CardHeader>
      <CardContent className="flex h-[calc(100%-9rem)] flex-col gap-4 p-5 pt-0">
        {candidate.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {candidate.keywords.slice(0, 5).map((keyword) => <Badge key={keyword} variant="outline">{keyword}</Badge>)}
          </div>
        )}
        <p className="line-clamp-4 flex-1 text-sm leading-6 text-muted-foreground">
          {candidate.abstract || copy("No abstract is available for this paper.")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onPreview(candidate)}>{copy("Preview")}</Button>
          {candidate.landing_url && (
            <Button asChild variant="ghost" size="sm">
              <a href={candidate.landing_url} target="_blank" rel="noreferrer">{copy("Open source")} <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
            </Button>
          )}
          {candidate.pdf_url && (
            <Button asChild variant="ghost" size="sm">
              <a href={candidate.pdf_url} target="_blank" rel="noreferrer">{copy("Open PDF")} <ExternalLink className="ml-1 h-3.5 w-3.5" /></a>
            </Button>
          )}
        </div>
        <Button className="w-full" disabled={!available || importing} onClick={() => onAnalyse(candidate)}>
          {importing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{available ? copy("Analyse and read") : copy("No PDF available")}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function DiscoverPage() {
  const router = useRouter();
  const { language } = useLanguage();
  const [mode, setMode] = useState<DiscoverMode>("arxiv");
  const [collection, setCollection] = useState(REQUIRED_CONFERENCE_COLLECTIONS[0].key);
  const [collections, setCollections] = useState<ConferenceCollection[]>(REQUIRED_CONFERENCE_COLLECTIONS);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<DiscoverySearchScope>("title");
  const [page, setPage] = useState(1);
  const [results, setResults] = useState<DiscoveryPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<DiscoveryCandidate | null>(null);
  const [importing, setImporting] = useState<string | null>(null);
  const requestCounter = useRef(0);
  const copy = useCallback((value: string) => translateUiText(value, language), [language]);

  const activeCollection = useMemo(
    () => collections.find((item) => item.key === collection) || REQUIRED_CONFERENCE_COLLECTIONS.find((item) => item.key === collection),
    [collection, collections],
  );
  const request = useMemo(() => createDiscoverRequest({ query, scope, page }), [query, scope, page]);
  const canSearch = mode === "collection" || request.query.length > 0;
  const emptyState = getDiscoverEmptyState({ mode, query: request.query });

  useEffect(() => {
    listConferenceCollections()
      .then((available) => {
        const byKey = new Map(available.map((item) => [item.key, item]));
        setCollections(REQUIRED_CONFERENCE_COLLECTIONS.map((fallback) => byKey.get(fallback.key) || fallback));
      })
      .catch(() => { /* Fallback cards remain usable when the API is offline. */ });
  }, []);

  const loadResults = useCallback(async () => {
    if (!canSearch) {
      requestCounter.current += 1;
      setResults(null);
      setError("");
      setLoading(false);
      return;
    }
    const requestId = ++requestCounter.current;
    setLoading(true);
    setError("");
    try {
      const searchParams = {
        query: request.query,
        scope: request.scope as DiscoverySearchScope,
        offset: request.offset,
        limit: request.limit,
      };
      const response = mode === "arxiv"
        ? await searchArxivPapers(searchParams)
        : await searchConferencePapers(collection, searchParams);
      if (requestId === requestCounter.current) setResults(response);
    } catch (caught) {
      if (requestId === requestCounter.current) {
        setResults(null);
        setError(caught instanceof Error ? caught.message : "Unable to load papers.");
      }
    } finally {
      if (requestId === requestCounter.current) setLoading(false);
    }
  }, [canSearch, collection, mode, request]);

  useEffect(() => { void loadResults(); }, [loadResults]);

  const selectMode = (nextMode: DiscoverMode, nextCollection?: string) => {
    setMode(nextMode);
    if (nextCollection) setCollection(nextCollection);
    setPage(1);
  };

  const analyse = async (candidate: DiscoveryCandidate) => {
    if (!canAnalyseCandidate(candidate) || importing) return;
    setImporting(candidate.source_external_id);
    try {
      const response = candidate.source_provider === "arxiv"
        ? await importFromUrl(
          candidate.landing_url!,
          true,
          language,
          (createArxivProvenance(candidate) as ArxivProvenance | null) || undefined,
        )
        : await importConferenceCatalogPaper(candidate.id!, true, language);
      toast.success(copy("Paper added to your library. Analysis has started."));
      router.push(`/articles/${response.article_id}`);
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : copy("Could not import this paper."));
    } finally {
      setImporting(null);
    }
  };

  const totalPages = results ? Math.max(1, Math.ceil(results.total / DISCOVER_PAGE_SIZE)) : 1;

  return (
    <div className="space-y-8">
      <section className="space-y-2">
        <p className="text-sm font-medium text-primary">{copy("Research inbox")}</p>
        <h1 className="text-3xl font-bold tracking-tight">{copy("Discover Papers")}</h1>
        <p className="max-w-3xl text-muted-foreground">{copy("Search arXiv or browse local conference snapshots, then explicitly choose the papers to analyse in your library.")}</p>
      </section>

      <section className="space-y-3" aria-label={copy("Paper source")}>
        <div className="flex items-center gap-2"><FileSearch className="h-5 w-5 text-primary" /><h2 className="text-xl font-semibold">{copy("Paper source")}</h2></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="group" aria-label={copy("Paper source")}>
          <button
            type="button"
            onClick={() => selectMode("arxiv")}
            aria-pressed={mode === "arxiv"}
            className={`rounded-lg border p-4 text-left transition-colors ${mode === "arxiv" ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"}`}
          >
            <p className="font-semibold">{copy("Search arXiv")}</p>
            <p className="mt-1 text-sm text-muted-foreground">{copy("Live public metadata search. Nothing is imported until you select a paper.")}</p>
          </button>
          {collections.map((item) => (
            <button
              key={item.key}
            type="button"
            onClick={() => selectMode("collection", item.key)}
            aria-pressed={mode === "collection" && collection === item.key}
              className={`rounded-lg border p-4 text-left transition-colors ${mode === "collection" && collection === item.key ? "border-primary bg-primary/5 ring-1 ring-primary" : "hover:bg-accent"}`}
            >
              <p className="font-semibold">{item.label}</p>
              <p className="mt-1 text-sm text-muted-foreground">{copy("Local imported catalogue snapshot")}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-xl border bg-card p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1fr_12rem_auto]">
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{copy("Search papers")}</span>
            <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder={mode === "arxiv" ? copy("Search arXiv…") : copy("Search conference papers…")} className="pl-9" /></div>
          </label>
          <label className="space-y-1.5">
            <span className="text-sm font-medium">{copy("Search in")}</span>
            <Select value={scope} onValueChange={(value) => { setScope(value as DiscoverySearchScope); setPage(1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="title">{copy("Title")}</SelectItem><SelectItem value="abstract">{copy("Abstract")}</SelectItem><SelectItem value="keywords">{copy("Keywords")}</SelectItem></SelectContent>
            </Select>
          </label>
          <Button className="self-end" onClick={() => void loadResults()} disabled={!canSearch || loading}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}{copy("Search")}</Button>
        </div>
        {mode === "collection" && <p className="mt-3 text-xs text-muted-foreground">{copy("Conference results are local-only. Import a snapshot with the maintainer command before this collection will contain papers.")}</p>}
      </section>

      <section aria-live="polite" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h2 className="text-xl font-semibold">{mode === "arxiv" ? copy("arXiv results") : activeCollection?.label || copy("Conference papers")}</h2>{results && <p className="text-sm text-muted-foreground">{results.total} {copy(results.total === 1 ? "paper found" : "papers found")}</p>}</div>
          {results && results.total > 0 && <span className="text-sm text-muted-foreground">{copy("Page")} {page} {copy("of")} {totalPages}</span>}
        </div>
        {loading && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} className="h-80" />)}</div>}
        {!loading && error && <Card><CardContent className="space-y-3 p-6"><p className="font-medium">{copy("Unable to load papers")}</p><p className="text-sm text-muted-foreground">{error}</p><Button variant="outline" onClick={() => void loadResults()}>{copy("Retry")}</Button></CardContent></Card>}
        {!loading && !error && !results && <Card><CardContent className="p-8 text-center"><p className="font-medium">{copy(emptyState.title)}</p><p className="mt-2 text-sm text-muted-foreground">{copy(emptyState.detail)}</p></CardContent></Card>}
        {!loading && !error && results?.items.length === 0 && <Card><CardContent className="p-8 text-center"><p className="font-medium">{copy("No papers found")}</p><p className="mt-2 text-sm text-muted-foreground">{copy("Try another query or search scope.")}</p></CardContent></Card>}
        {!loading && !error && results?.items.length ? <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{results.items.map((candidate) => <CandidateCard key={`${candidate.source_provider}-${candidate.id || candidate.source_external_id}`} candidate={candidate} onPreview={setPreview} onAnalyse={analyse} importing={importing === candidate.source_external_id} copy={copy} />)}</div> : null}
        {!loading && !error && results && results.total > DISCOVER_PAGE_SIZE && <div className="flex justify-center gap-3"><Button variant="outline" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>{copy("Previous")}</Button><Button variant="outline" disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>{copy("Next")}</Button></div>}
      </section>

      <Dialog open={Boolean(preview)} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          {preview && <><DialogHeader><DialogTitle>{preview.title}</DialogTitle><DialogDescription>{preview.authors.join(", ") || copy("Authors unavailable")}</DialogDescription></DialogHeader><div className="space-y-4 text-sm"><div className="flex flex-wrap gap-2"><Badge variant="secondary">{sourceLabel(preview)}</Badge>{preview.venue && <Badge variant="outline">{preview.venue}</Badge>}</div><p className="leading-6 text-muted-foreground">{preview.abstract || copy("No abstract is available for this paper.")}</p></div><DialogFooter><Button variant="outline" onClick={() => setPreview(null)}>{copy("Close")}</Button><Button disabled={!canAnalyseCandidate(preview) || importing === preview.source_external_id} onClick={() => void analyse(preview)}>{importing === preview.source_external_id && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{canAnalyseCandidate(preview) ? copy("Analyse and read") : copy("No PDF available")}</Button></DialogFooter></>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
