interface Bounds { x: number; y: number; width: number; height: number }

/** Cover the entire viewport with the background; a small margin avoids edge seams. */
export function cameraFit(viewWidth: number, viewHeight: number, worldWidth: number, worldHeight: number, maximum: number) {
  const cover = Math.max(viewWidth / Math.max(1, worldWidth), viewHeight / Math.max(1, worldHeight)) * 1.002;
  const zoom = Math.max(Number.EPSILON, cover);
  return { zoom, minimum: zoom, maximum: Math.max(maximum, zoom) };
}

export function constrainToBackground(x: number, y: number, viewWidth: number, viewHeight: number, zoom: number, bounds: Bounds) {
  const halfWidth = viewWidth / (2 * zoom);
  const halfHeight = viewHeight / (2 * zoom);
  return {
    x: Math.max(bounds.x + halfWidth, Math.min(bounds.x + bounds.width - halfWidth, x)),
    y: Math.max(bounds.y + halfHeight, Math.min(bounds.y + bounds.height - halfHeight, y)),
  };
}