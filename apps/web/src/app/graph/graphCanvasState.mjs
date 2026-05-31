export const MIN_GRAPH_SCALE = 0.15;
export const MAX_GRAPH_SCALE = 4;

function clampScale(scale) {
  return Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, scale));
}

export function zoomTransformAt(transform, point, nextScale) {
  const scale = clampScale(nextScale);
  const ratio = scale / transform.scale;

  return {
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
    scale,
  };
}

export function resolveGraphCanvasSize({ containerWidth, viewportHeight }) {
  return {
    width: Math.max(320, Math.round(containerWidth)),
    height: Math.max(360, Math.round(viewportHeight - 280)),
  };
}

function resolveCssHslColor(style, propertyName, fallback) {
  const rawValue = typeof style?.getPropertyValue === "function"
    ? style.getPropertyValue(propertyName).trim()
    : "";

  if (!rawValue) return fallback;
  if (rawValue.startsWith("#") || rawValue.startsWith("rgb(") || rawValue.startsWith("rgba(") || rawValue.startsWith("hsl(") || rawValue.startsWith("hsla(")) {
    return rawValue;
  }

  return `hsl(${rawValue})`;
}

export function resolveGraphCanvasTheme(style) {
  return {
    foreground: resolveCssHslColor(style, "--foreground", "#111827"),
    background: resolveCssHslColor(style, "--background", "#ffffff"),
    card: resolveCssHslColor(style, "--card", "#ffffff"),
    cardForeground: resolveCssHslColor(style, "--card-foreground", "#111827"),
    border: resolveCssHslColor(style, "--border", "#e5e7eb"),
  };
}

export function applyGraphNodeDrag(
  nodes,
  edges,
  draggedNodeId,
  nextPosition,
  { connectedTraction = 0.45 } = {}
) {
  const draggedNode = nodes.find((node) => node.id === draggedNodeId);
  if (!draggedNode) return false;

  const dx = nextPosition.x - draggedNode.x;
  const dy = nextPosition.y - draggedNode.y;
  const connectedNodeIds = new Set();

  for (const edge of edges) {
    if (edge.source === draggedNodeId) connectedNodeIds.add(edge.target);
    if (edge.target === draggedNodeId) connectedNodeIds.add(edge.source);
  }

  draggedNode.x = nextPosition.x;
  draggedNode.y = nextPosition.y;
  draggedNode.vx = 0;
  draggedNode.vy = 0;

  for (const node of nodes) {
    if (!connectedNodeIds.has(node.id)) continue;
    node.vx = dx * connectedTraction;
    node.vy = dy * connectedTraction;
  }

  return true;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * @param {{ id: number, x: number, y: number, vx: number, vy: number, radius?: number }[]} nodes
 * @param {{ source: number, target: number }[]} edges
 * @param {number} width
 * @param {number} height
 * @param {{
 *   pinnedNodeId?: number | null,
 *   repulsion?: number,
 *   linkStrength?: number,
 *   linkDistance?: number,
 *   damping?: number,
 *   centerGravity?: number,
 *   maxVelocity?: number,
 *   minDistance?: number,
 * }} [options]
 * @returns {number}
 */
export function tickGraphSimulation(
  nodes,
  edges,
  width,
  height,
  {
    pinnedNodeId = null,
    repulsion = 2600,
    linkStrength = 0.014,
    linkDistance = 92,
    damping = 0.86,
    centerGravity = 0.0012,
    maxVelocity = 12,
    minDistance = 28,
  } = {}
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));

  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i];
      const b = nodes[j];
      let dx = a.x - b.x;
      let dy = a.y - b.y;
      if (dx === 0 && dy === 0) {
        dx = 0.01;
        dy = 0.01;
      }
      const dist = Math.max(minDistance, Math.sqrt(dx * dx + dy * dy));
      const force = repulsion / (dist * dist);
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;

      if (a.id !== pinnedNodeId) {
        a.vx += fx;
        a.vy += fy;
      }
      if (b.id !== pinnedNodeId) {
        b.vx -= fx;
        b.vy -= fy;
      }
    }
  }

  for (const edge of edges) {
    const source = nodeById.get(edge.source);
    const target = nodeById.get(edge.target);
    if (!source || !target) continue;

    let dx = target.x - source.x;
    let dy = target.y - source.y;
    if (dx === 0 && dy === 0) {
      dx = 0.01;
      dy = 0.01;
    }
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const force = (dist - linkDistance) * linkStrength;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    if (source.id !== pinnedNodeId) {
      source.vx += fx;
      source.vy += fy;
    }
    if (target.id !== pinnedNodeId) {
      target.vx -= fx;
      target.vy -= fy;
    }
  }

  const cx = width / 2;
  const cy = height / 2;
  let maxSpeedSeen = 0;

  for (const node of nodes) {
    if (node.id === pinnedNodeId) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }

    node.vx += (cx - node.x) * centerGravity;
    node.vy += (cy - node.y) * centerGravity;
    node.vx = clamp(node.vx * damping, -maxVelocity, maxVelocity);
    node.vy = clamp(node.vy * damping, -maxVelocity, maxVelocity);
    node.x += node.vx;
    node.y += node.vy;
    node.x = clamp(node.x, node.radius ?? 0, width - (node.radius ?? 0));
    node.y = clamp(node.y, node.radius ?? 0, height - (node.radius ?? 0));

    maxSpeedSeen = Math.max(maxSpeedSeen, Math.sqrt(node.vx * node.vx + node.vy * node.vy));
  }

  return maxSpeedSeen;
}

export function createGraphViewportState(initialTransform = { x: 0, y: 0, scale: 1 }) {
  let transform = {
    x: initialTransform.x,
    y: initialTransform.y,
    scale: clampScale(initialTransform.scale),
  };

  return {
    getTransform() {
      return { ...transform };
    },
    setTransform(nextTransform) {
      transform = {
        x: nextTransform.x,
        y: nextTransform.y,
        scale: clampScale(nextTransform.scale),
      };
      return { ...transform };
    },
    panBy(dx, dy) {
      transform = {
        ...transform,
        x: transform.x + dx,
        y: transform.y + dy,
      };
      return { ...transform };
    },
    zoomAt(point, nextScale) {
      transform = zoomTransformAt(transform, point, nextScale);
      return { ...transform };
    },
    reset() {
      transform = { x: 0, y: 0, scale: 1 };
      return { ...transform };
    },
  };
}
