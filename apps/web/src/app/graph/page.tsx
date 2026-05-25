"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  GitBranch, Loader2, ZoomIn, ZoomOut, Maximize2, Filter, Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getGlobalGraph } from "@/lib/api";
import type { GlobalGraphData } from "@/lib/types";
import { FadeIn } from "@/components/ui/animated";
import { createGraphViewportState, resolveGraphCanvasSize } from "./graphCanvasState.mjs";

// ── Entity type colors ─────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  Article: "#3b82f6",
  Author: "#22c55e",
  Institution: "#a855f7",
  Method: "#f59e0b",
  Dataset: "#ec4899",
  Experiment: "#14b8a6",
  Metric: "#f97316",
  Result: "#6366f1",
  Claim: "#84cc16",
  Task: "#06b6d4",
  Domain: "#8b5cf6",
  Tool: "#ef4444",
  Model: "#e11d48",
  Citation: "#64748b",
  Keyword: "#0ea5e9",
};
const DEFAULT_COLOR = "#6b7280";

// ── Types ──────────────────────────────────────────────────────────
interface GraphNode {
  id: number;
  label: string;
  type: string;
  articleId: number;
  articleTitle: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

interface GraphEdge {
  source: number;
  target: number;
  type: string;
}

// ── Force-directed layout engine (lightweight, no dependencies) ───

function simulate(nodes: GraphNode[], edges: GraphEdge[], width: number, height: number, iterations = 120) {
  const repulsion = 3000;
  const attraction = 0.005;
  const damping = 0.85;
  const centerGravity = 0.001;
  const maxVelocity = 8;
  const minDistance = 30;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between all node pairs
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const dx = nodes[i].x - nodes[j].x;
        const dy = nodes[i].y - nodes[j].y;
        const dist = Math.max(minDistance, Math.sqrt(dx * dx + dy * dy));
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        nodes[i].vx += fx;
        nodes[i].vy += fy;
        nodes[j].vx -= fx;
        nodes[j].vy -= fy;
      }
    }

    // Attraction along edges
    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.source);
      const t = nodes.find((n) => n.id === edge.target);
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const force = dist * attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      s.vx += fx;
      s.vy += fy;
      t.vx -= fx;
      t.vy -= fy;
    }

    // Center gravity + velocity update
    const cx = width / 2;
    const cy = height / 2;
    for (const node of nodes) {
      node.vx += (cx - node.x) * centerGravity;
      node.vy += (cy - node.y) * centerGravity;
      node.vx = Math.max(-maxVelocity, Math.min(maxVelocity, node.vx * damping));
      node.vy = Math.max(-maxVelocity, Math.min(maxVelocity, node.vy * damping));
      node.x += node.vx;
      node.y += node.vy;
      // Clamp to bounds
      node.x = Math.max(node.radius, Math.min(width - node.radius, node.x));
      node.y = Math.max(node.radius, Math.min(height - node.radius, node.y));
    }
  }
}

// ── Canvas Graph Component ─────────────────────────────────────────

function GraphCanvas({
  nodes,
  edges,
  width,
  height,
  onNodeClick,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  onNodeClick: (node: GraphNode) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);
  const viewportRef = useRef<ReturnType<typeof createGraphViewportState> | null>(null);
  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const dragRef = useRef<{ x: number; y: number; node: GraphNode | null; pan: boolean }>({
    x: 0, y: 0, node: null, pan: false,
  });

  if (!viewportRef.current) {
    viewportRef.current = createGraphViewportState(transform);
  }

  // Run simulation on mount
  useEffect(() => {
    simulate(nodes, edges, width, height, 150);
    render();
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, width, height]);

  const worldToScreen = useCallback(
    (wx: number, wy: number) => {
      const currentTransform = viewportRef.current!.getTransform();
      return {
        x: wx * currentTransform.scale + currentTransform.x,
        y: wy * currentTransform.scale + currentTransform.y,
      };
    },
    []
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const currentTransform = viewportRef.current!.getTransform();
      return {
        x: (sx - currentTransform.x) / currentTransform.scale,
        y: (sy - currentTransform.y) / currentTransform.scale,
      };
    },
    []
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    const currentTransform = viewportRef.current!.getTransform();
    const currentHoveredNode = hoveredNodeRef.current;
    const activeNodeId = currentHoveredNode?.id ?? null;

    ctx.save();
    ctx.translate(currentTransform.x, currentTransform.y);
    ctx.scale(currentTransform.scale, currentTransform.scale);

    // Edges
    for (const edge of edges) {
      const s = nodes.find((n) => n.id === edge.source);
      const t = nodes.find((n) => n.id === edge.target);
      if (!s || !t) continue;
      const activeEdge = activeNodeId != null && (edge.source === activeNodeId || edge.target === activeNodeId);
      ctx.globalAlpha = activeNodeId == null ? 0.6 : activeEdge ? 0.9 : 0.12;
      ctx.strokeStyle = activeEdge ? "hsl(var(--foreground))" : "hsl(var(--border))";
      ctx.lineWidth = (activeEdge ? 1.6 : 0.8) / currentTransform.scale;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Nodes
    for (const node of nodes) {
      const color = TYPE_COLORS[node.type] || DEFAULT_COLOR;
      const isHovered = currentHoveredNode?.id === node.id;
      const isRelated =
        activeNodeId == null ||
        node.id === activeNodeId ||
        edges.some(
          (edge) =>
            (edge.source === activeNodeId && edge.target === node.id) ||
            (edge.target === activeNodeId && edge.source === node.id)
        );

      ctx.globalAlpha = activeNodeId != null && !isRelated ? 0.22 : 1;

      // Glow for hovered
      if (isHovered) {
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius + 6, 0, Math.PI * 2);
        ctx.fillStyle = color + "30";
        ctx.fill();
      }

      // Node circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = isHovered ? "#fff" : "hsl(var(--background))";
      ctx.lineWidth = isHovered ? 2 / currentTransform.scale : 1.5 / currentTransform.scale;
      ctx.stroke();

      // Label (only when zoomed in enough)
      if (currentTransform.scale > 0.5 || isHovered) {
        const fontSize = Math.max(9, 11 / currentTransform.scale);
        ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
        ctx.fillStyle = "hsl(var(--foreground))";
        ctx.textAlign = "center";
        const label = node.label.length > 20 ? node.label.slice(0, 20) + "…" : node.label;
        ctx.fillText(label, node.x, node.y - node.radius - 4);
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // Hover tooltip (screen space)
    if (currentHoveredNode) {
      const { x, y } = worldToScreen(currentHoveredNode.x, currentHoveredNode.y);
      const tooltipText = `${currentHoveredNode.label}\n${currentHoveredNode.type} · ${currentHoveredNode.articleTitle}`;
      const lines = tooltipText.split("\n");
      const fontSize = 11;
      ctx.font = `${fontSize}px Inter, system-ui, sans-serif`;
      const maxWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const tooltipW = maxWidth + 16;
      const tooltipH = lines.length * 16 + 12;
      const tx = Math.min(width - tooltipW, Math.max(0, x - tooltipW / 2));
      const ty = y - currentHoveredNode.radius - tooltipH - 10;

      ctx.fillStyle = "hsl(var(--card))";
      ctx.strokeStyle = "hsl(var(--border))";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(tx, ty, tooltipW, tooltipH, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "hsl(var(--card-foreground))";
      ctx.textAlign = "left";
      lines.forEach((line, i) => {
        ctx.fillText(line, tx + 8, ty + 14 + i * 16);
      });
    }

  }, [nodes, edges, width, height, worldToScreen]);

  const requestRender = useCallback(() => {
    cancelAnimationFrame(animRef.current);
    animRef.current = requestAnimationFrame(render);
  }, [render]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      if (dragRef.current.pan) {
        const nextTransform = viewportRef.current!.panBy(sx - dragRef.current.x, sy - dragRef.current.y);
        setTransform(nextTransform);
        requestRender();
        dragRef.current.x = sx;
        dragRef.current.y = sy;
        return;
      }

      if (dragRef.current.node) {
        const { x, y } = screenToWorld(sx, sy);
        const node = nodes.find((n) => n.id === dragRef.current.node!.id);
        if (node) {
          node.x = x;
          node.y = y;
          node.vx = 0;
          node.vy = 0;
          requestRender();
        }
        return;
      }

      // Hover detection
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      let found: GraphNode | null = null;
      for (const node of nodes) {
        const dx = node.x - wx;
        const dy = node.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius + 4) {
          found = node;
          break;
        }
      }
      hoveredNodeRef.current = found;
      requestRender();
      if (canvasRef.current) {
        canvasRef.current.style.cursor = found ? "pointer" : dragRef.current.pan ? "grabbing" : "grab";
      }
    },
    [nodes, screenToWorld, requestRender]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { x: wx, y: wy } = screenToWorld(sx, sy);

      // Check if clicking on a node
      let clicked: GraphNode | null = null;
      for (const node of nodes) {
        const dx = node.x - wx;
        const dy = node.y - wy;
        if (Math.sqrt(dx * dx + dy * dy) < node.radius + 4) {
          clicked = node;
          break;
        }
      }

      if (clicked) {
        dragRef.current = { x: sx, y: sy, node: clicked, pan: false };
      } else {
        dragRef.current = { x: sx, y: sy, node: null, pan: true };
        if (canvasRef.current) canvasRef.current.style.cursor = "grabbing";
      }
    },
    [nodes, screenToWorld]
  );

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (dragRef.current.node && !dragRef.current.pan) {
        const dx = Math.abs(e.clientX - dragRef.current.x - (canvasRef.current?.getBoundingClientRect().left || 0));
        const dy = Math.abs(e.clientY - dragRef.current.y - (canvasRef.current?.getBoundingClientRect().top || 0));
        if (dx < 3 && dy < 3) {
          onNodeClick(dragRef.current.node);
        }
      }
      dragRef.current = { x: 0, y: 0, node: null, pan: false };
      if (canvasRef.current) canvasRef.current.style.cursor = "grab";
    },
    [onNodeClick]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const currentTransform = viewportRef.current!.getTransform();
      const nextTransform = viewportRef.current!.zoomAt({ x: mx, y: my }, currentTransform.scale * delta);
      setTransform(nextTransform);
      requestRender();
    },
    [requestRender]
  );

  const zoomIn = () => {
    const currentTransform = viewportRef.current!.getTransform();
    const nextTransform = viewportRef.current!.zoomAt(
      { x: width / 2, y: height / 2 },
      currentTransform.scale * 1.3
    );
    setTransform(nextTransform);
    requestRender();
  };
  const zoomOut = () => {
    const currentTransform = viewportRef.current!.getTransform();
    const nextTransform = viewportRef.current!.zoomAt(
      { x: width / 2, y: height / 2 },
      currentTransform.scale * 0.7
    );
    setTransform(nextTransform);
    requestRender();
  };
  const resetView = () => {
    setTransform(viewportRef.current!.reset());
    requestRender();
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        data-testid="knowledge-graph-canvas"
        data-scale={transform.scale.toFixed(3)}
        data-offset-x={Math.round(transform.x)}
        data-offset-y={Math.round(transform.y)}
        width={width}
        height={height}
        style={{ width, height, cursor: "grab" }}
        onMouseMove={handleMouseMove}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseLeave={() => {
          hoveredNodeRef.current = null;
          requestRender();
        }}
        onWheel={handleWheel}
      />
      {/* Zoom controls */}
      <div className="absolute bottom-3 right-3 flex gap-1">
        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg shadow" onClick={zoomIn} title="Zoom in">
          <ZoomIn className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg shadow" onClick={zoomOut} title="Zoom out">
          <ZoomOut className="h-3.5 w-3.5" />
        </Button>
        <Button variant="secondary" size="icon" className="h-8 w-8 rounded-lg shadow" onClick={resetView} title="Reset view">
          <Maximize2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Page Component ─────────────────────────────────────────────────

export default function GraphPage() {
  const router = useRouter();
  const [data, setData] = useState<GlobalGraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const graphContainerRef = useRef<HTMLDivElement>(null);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    getGlobalGraph(300)
      .then((d) => {
        setData(d);
        // Collect all types
        const types = new Set<string>();
        d.entities.forEach((e) => types.add(e.type));
        setSelectedTypes(types);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const updateGraphSize = () => {
      const containerWidth = graphContainerRef.current?.clientWidth || 0;
      if (containerWidth <= 0) return;
      setGraphSize(
        resolveGraphCanvasSize({
          containerWidth,
          viewportHeight: window.innerHeight,
        })
      );
    };

    updateGraphSize();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateGraphSize) : null;
    if (observer && graphContainerRef.current) {
      observer.observe(graphContainerRef.current);
    }
    window.addEventListener("resize", updateGraphSize);

    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", updateGraphSize);
    };
  }, []);

  const toggleType = (t: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  };

  const toggleAll = () => {
    if (!data) return;
    if (selectedTypes.size === 0) {
      setSelectedTypes(new Set(data.entities.map((e) => e.type)));
    } else {
      setSelectedTypes(new Set());
    }
  };

  // Build graph
  const filteredEntities = data?.entities.filter((e) => selectedTypes.has(e.type)) || [];
  const filteredEntityIds = new Set(filteredEntities.map((e) => e.id));
  const filteredRelationships = (data?.relationships || []).filter(
    (r) => filteredEntityIds.has(r.source_entity_id) && filteredEntityIds.has(r.target_entity_id)
  );

  const nodes: GraphNode[] = filteredEntities.map((e) => ({
    id: e.id,
    label: e.canonical_name || e.name,
    type: e.type,
    articleId: e.article_id,
    articleTitle: e.article_title,
    x: Math.random() * 800 + 100,
    y: Math.random() * 600 + 50,
    vx: 0,
    vy: 0,
    radius: 6 + Math.min(10, e.confidence * 10),
  }));

  const edges: GraphEdge[] = filteredRelationships.map((r) => ({
    source: r.source_entity_id,
    target: r.target_entity_id,
    type: r.type,
  }));

  const allTypes = data ? [...new Set(data.entities.map((e) => e.type))].sort() : [];

  return (
    <div className="space-y-4">
      <FadeIn>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Knowledge Graph</h1>
            <p className="text-muted-foreground mt-1">
              {data ? `${data.entities.length} entities · ${data.relationships.length} relationships` : "Loading..."}
            </p>
          </div>
        </div>
      </FadeIn>

      {/* Type filter */}
      {!loading && data && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Button variant="ghost" size="sm" className="text-xs gap-1" onClick={toggleAll}>
            <Filter className="h-3 w-3" />
            {selectedTypes.size === allTypes.length ? "Clear all" : "Select all"}
          </Button>
          {allTypes.map((t) => {
            const color = TYPE_COLORS[t] || DEFAULT_COLOR;
            const active = selectedTypes.has(t);
            return (
              <button
                key={t}
                onClick={() => toggleType(t)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  active
                    ? "bg-secondary text-foreground ring-1 ring-border"
                    : "opacity-40 hover:opacity-70"
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                {t}
              </button>
            );
          })}
        </div>
      )}

      {/* Graph canvas */}
      <FadeIn delay={0.1}>
        <Card>
          <CardContent className="p-0 overflow-hidden rounded-lg">
            <div ref={graphContainerRef} className="w-full" style={{ height: graphSize.height || "70vh" }}>
              {loading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : error ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-2">
                  <GitBranch className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Failed to load graph: {error}</p>
                </div>
              ) : nodes.length === 0 && (data?.entities?.length || 0) === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-3">
                  <GitBranch className="h-16 w-16 opacity-20" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium">No graph data yet</p>
                    <p className="text-xs text-muted-foreground/70 max-w-xs">
                      Process articles with AI extraction enabled to populate the knowledge graph with entities and relationships.
                    </p>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => router.push("/upload")} className="mt-2 gap-1.5">
                    <Upload className="h-3.5 w-3.5" />
                    Upload Articles
                  </Button>
                  <p className="text-[11px] text-muted-foreground/50 mt-2">
                    Tip: Drag to pan · Scroll to zoom · Click node to open article
                  </p>
                </div>
              ) : nodes.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-muted-foreground gap-3">
                  <GitBranch className="h-12 w-12 opacity-30" />
                  <p className="text-sm font-medium">No nodes match the selected filters</p>
                  <p className="text-xs text-muted-foreground/70">Try enabling more entity types to see results.</p>
                  <Button variant="outline" size="sm" onClick={() => setSelectedTypes(new Set(allTypes))} className="mt-2 gap-1.5">
                    Reset Filters
                  </Button>
                </div>
              ) : graphSize.width > 0 && graphSize.height > 0 ? (
                <GraphCanvas
                  nodes={nodes}
                  edges={edges}
                  width={graphSize.width}
                  height={graphSize.height}
                  onNodeClick={(node) => router.push(`/articles/${node.articleId}`)}
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </FadeIn>

      {/* Legend */}
      {!loading && data && (
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Entity types:</span>
          {allTypes.map((t) => (
            <span key={t} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: TYPE_COLORS[t] || DEFAULT_COLOR }} />
              {t}
            </span>
          ))}
          <span className="text-muted-foreground ml-2">| Drag to pan · Scroll to zoom · Click node to open article</span>
        </div>
      )}
    </div>
  );
}
