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

