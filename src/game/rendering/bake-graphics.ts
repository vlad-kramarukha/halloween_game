import { renderConfig } from '../../config/render';
import Phaser from 'phaser';

/** Bake geometry once, at a higher resolution for sharp edges when zoomed. */
export function bakeGraphics(
  scene: Phaser.Scene, graphics: Phaser.GameObjects.Graphics, key: string,
  bounds: { x: number; y: number; width: number; height: number }, resolution: number = renderConfig.geometryResolution,
): void {
  if (scene.textures.exists(key)) return;
  const baker = new Phaser.GameObjects.Graphics(scene);
  baker.scaleCanvas(resolution, resolution);
  baker.translateCanvas(-bounds.x, -bounds.y);
  for (const command of graphics.commandBuffer) baker.commandBuffer.push(command);
  baker.generateTexture(key, Math.ceil(bounds.width * resolution), Math.ceil(bounds.height * resolution));
  baker.destroy();
}
