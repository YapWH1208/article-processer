import assert from "node:assert/strict";
import test from "node:test";

import {
  applyGraphNodeDrag,
  createGraphViewportState,
  resolveGraphCanvasSize,
  resolveGraphCanvasTheme,
  tickGraphSimulation,
} from "./graphCanvasState.mjs";

test("stable graph viewport state reflects pan and cursor-centered zoom updates", () => {
  const viewport = createGraphViewportState({ x: 0, y: 0, scale: 1 });
  const drawFrame = () => viewport.getTransform();

  viewport.zoomAt({ x: 100, y: 80 }, 2);
  assert.deepEqual(drawFrame(), { x: -100, y: -80, scale: 2 });

  viewport.panBy(25, -10);
  assert.deepEqual(drawFrame(), { x: -75, y: -90, scale: 2 });
});

test("graph canvas uses the measured card width instead of a fixed maximum width", () => {
  assert.deepEqual(
    resolveGraphCanvasSize({ containerWidth: 1440, viewportHeight: 900 }),
    { width: 1440, height: 620 }
  );
});

test("graph canvas resolves theme variables before drawing tooltip text", () => {
  const style = {
    getPropertyValue(name) {
      return {
        "--foreground": "240 10% 3.9%",
        "--background": "0 0% 100%",
        "--card": "0 0% 100%",
        "--card-foreground": "240 10% 3.9%",
        "--border": "240 5.9% 90%",
      }[name] || "";
    },
  };

  const theme = resolveGraphCanvasTheme(style);

  assert.deepEqual(theme, {
    foreground: "hsl(240 10% 3.9%)",
    background: "hsl(0 0% 100%)",
    card: "hsl(0 0% 100%)",
    cardForeground: "hsl(240 10% 3.9%)",
    border: "hsl(240 5.9% 90%)",
  });
  assert.equal(Object.values(theme).some((color) => color.includes("var(")), false);
});

test("dragging a graph node gives each directly connected node momentum once", () => {
  const nodes = [
    { id: 1, x: 100, y: 100, vx: 4, vy: -3 },
    { id: 2, x: 160, y: 100, vx: 0, vy: 0 },
    { id: 3, x: 80, y: 160, vx: 0, vy: 0 },
    { id: 4, x: 220, y: 220, vx: 0, vy: 0 },
  ];
  const edges = [
    { source: 1, target: 2 },
    { source: 2, target: 1 },
    { source: 3, target: 1 },
  ];

  const moved = applyGraphNodeDrag(nodes, edges, 1, { x: 120, y: 112 });

  assert.equal(moved, true);
  assert.deepEqual(
    nodes.map(({ id, x, y, vx, vy }) => ({ id, x, y, vx, vy })),
    [
      { id: 1, x: 120, y: 112, vx: 0, vy: 0 },
      { id: 2, x: 160, y: 100, vx: 9, vy: 5.4 },
      { id: 3, x: 80, y: 160, vx: 9, vy: 5.4 },
      { id: 4, x: 220, y: 220, vx: 0, vy: 0 },
    ]
  );
});

test("graph simulation spring pulls linked nodes toward a pinned dragged node", () => {
  const nodes = [
    { id: 1, x: 180, y: 100, vx: 0, vy: 0, radius: 8 },
    { id: 2, x: 20, y: 100, vx: 0, vy: 0, radius: 8 },
    { id: 3, x: 20, y: 220, vx: 0, vy: 0, radius: 8 },
  ];
  const edges = [{ source: 1, target: 2 }];

  const energy = tickGraphSimulation(nodes, edges, 400, 300, {
    pinnedNodeId: 1,
    repulsion: 0,
    centerGravity: 0,
    linkDistance: 80,
    linkStrength: 0.04,
    damping: 1,
  });

  assert.equal(nodes[0].x, 180);
  assert.equal(nodes[0].y, 100);
  assert.equal(nodes[1].x > 20, true);
  assert.equal(nodes[2].x, 20);
  assert.equal(energy > 0, true);
});
