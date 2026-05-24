import assert from "node:assert/strict";
import test from "node:test";

import { createGraphViewportState } from "./graphCanvasState.mjs";

test("stable graph viewport state reflects pan and cursor-centered zoom updates", () => {
  const viewport = createGraphViewportState({ x: 0, y: 0, scale: 1 });
  const drawFrame = () => viewport.getTransform();

  viewport.zoomAt({ x: 100, y: 80 }, 2);
  assert.deepEqual(drawFrame(), { x: -100, y: -80, scale: 2 });

  viewport.panBy(25, -10);
  assert.deepEqual(drawFrame(), { x: -75, y: -90, scale: 2 });
});

