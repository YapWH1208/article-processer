import assert from "node:assert/strict";
import test from "node:test";

import { createGraphViewportState, resolveGraphCanvasSize, resolveGraphCanvasTheme } from "./graphCanvasState.mjs";

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
