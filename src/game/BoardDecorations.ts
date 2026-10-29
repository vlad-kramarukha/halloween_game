import { addAssetFrame } from './rendering/asset-frame';
import { SceneryDecorations } from './SceneryDecorations';
import Phaser from 'phaser';
import { decorationsConfig as config } from '../config/decorations';
import { createDecorationLayout } from './generators/decoration-layout';
import { DecorationGround } from './DecorationGround';
import { ForestDecorations } from './ForestDecorations';

const glowTextureKey = 'decoration-flame-glow';

export class BoardDecorations extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, cells: readonly { x: number; y: number }[], tile: { width: number; height: number; depth: number }) {
    super(scene);
    if (!config.enabled) return;
    const layout = createDecorationLayout(cells, tile, config);
    const scenery = new SceneryDecorations(scene, cells, tile, layout);
    this.add(new ForestDecorations(scene, cells, tile, layout, scenery.occupied));
    this.add(scenery);
    this.add(new DecorationGround(scene, layout));
    const tint = Phaser.Display.Color.RGBStringToColor(config.tint).color;
    const lights: { glow: Phaser.GameObjects.Image; sprite: Phaser.GameObjects.Image; phase: number; speed: number }[] = [];
    // Keep all halos together so they share a texture and can be batched.
    const glowLayer = scene.add.container();
    this.add(glowLayer);
    if (config.lights.enabled) this.createGlowTexture(scene);
    const lightColor = Phaser.Display.Color.RGBStringToColor(config.lights.color).color;
    for (const item of layout) {
      const frame = item.type.frame;
      if (frame) {
        addAssetFrame(scene, item.type.textureKey, 'prop', frame, item.type.url);
      }
      const sprite = scene.add.image(item.x, item.y, item.type.textureKey, frame ? 'prop' : undefined)
        .setDisplaySize(frame ? item.type.size * frame.width / frame.height : item.type.size, item.type.size)
        .setFlipX(item.flip);
      if (item.type === config.types.tree || item.type === config.types.tombstone) sprite.setTint(tint);
      this.add(sprite);
      const settings = item.type === config.types.lantern ? config.lights.lantern
        : item.type === config.types.candle ? config.lights.candle : undefined;
      if (config.lights.enabled && settings) {
        const glow = scene.add.image(item.x, item.y + item.type.size * settings.offsetY, glowTextureKey)
          .setDisplaySize(settings.diameter, settings.diameter)
          .setTint(lightColor)
          .setAlpha(config.lights.opacity);
        glowLayer.add(glow);
        lights.push({ glow, sprite, phase: lights.length * 2.39996, speed: 1.7 + (lights.length % 5) * 0.19 });
      }
    }
    if (lights.length > 0) {
      let elapsed = 0;
      const interval = 1000 / config.lights.updatesPerSecond;
      // One low-frequency timer; no per-light tweens, particles or dynamic lights.
      const timer = scene.time.addEvent({
        delay: interval,
        loop: true,
        callback: () => {
          elapsed += interval / 1000;
          if (!this.visible || this.alpha === 0) return;
          for (const light of lights) {
            const t = elapsed * light.speed + light.phase;
            const flicker = Math.sin(t) * 0.65 + Math.sin(t * 2.73 + light.phase) * 0.35;
            light.glow.setAlpha(config.lights.opacity * (1 + flicker * config.lights.flickerAmount));
            light.sprite.setAlpha(0.96 + flicker * 0.04);
          }
        },
      });
      this.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove(false));
    }
  }

  private createGlowTexture(scene: Phaser.Scene): void {
    if (scene.textures.exists(glowTextureKey)) return;
    const size = config.lights.textureSize;
    const texture = scene.textures.createCanvas(glowTextureKey, size, size);
    if (!texture) return;
    const context = texture.context;
    const radius = size / 2;
    const gradient = context.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.18, 'rgba(255, 255, 255, 0.65)');
    gradient.addColorStop(0.45, 'rgba(255, 255, 255, 0.22)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
    texture.refresh();
  }
}



