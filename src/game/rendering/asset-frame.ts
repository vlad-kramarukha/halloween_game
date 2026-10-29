import type Phaser from 'phaser';
import assetScales from '../../generated/asset-scales.json';

const scales: Record<string, { x: number; y: number }> = assetScales;
/** Config crops remain in source pixels; adapt them to the prepared texture. */
export function addAssetFrame(scene: Phaser.Scene, key: string, name: string, frame: { x: number; y: number; width: number; height: number }, assetUrl: string): void {
  const texture = scene.textures.get(key);
  if (texture.has(name)) return;
  const source = texture.getSourceImage() as HTMLImageElement;
  // Phaser's XHR loader replaces image.src with a blob URL. Use the imported
  // asset URL instead so both XHR and HTMLImageElement loading use the same crop.
  const scale = scales[new URL(assetUrl, 'http://assets.local').pathname] ?? { x: 1, y: 1 };
  const x = Math.round(frame.x * scale.x);
  const y = Math.round(frame.y * scale.y);
  const right = Math.min(source.width, Math.round((frame.x + frame.width) * scale.x));
  const bottom = Math.min(source.height, Math.round((frame.y + frame.height) * scale.y));
  texture.add(name, 0, x, y, Math.max(1, right - x), Math.max(1, bottom - y));
}
