export const renderConfig = {
  width: window.innerWidth,
  height: window.innerHeight,
  // 2 renders twice as many pixels per axis for smoother diagonal edges.
  resolutionScale: 1,
  frameRate: 60,
  entryFrameRate: 30,
  maxParallelDownloads: 4,
  geometryResolution: 3,
} as const;
