import { bakeGraphics } from './rendering/bake-graphics';
import Phaser from 'phaser';
import { decorationsConfig as config } from '../config/decorations';
import type { DecorationPlacement } from './generators/decoration-layout';

/** Static ground and contact shadows, constructed once with the scenery. */
export class DecorationGround extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, items: readonly DecorationPlacement[]) {
    super(scene);
    if (!config.ground.enabled) return;
    const settings = config.ground;
    const color = (value: string) => Phaser.Display.Color.RGBStringToColor(value).color;
    const random = new Phaser.Math.RandomDataGenerator([String(config.seed), 'ground']);
    let index = 0;
    for (const item of items) {
      const scarecrow = item.type === config.types.scarecrow;
      const earthy = scarecrow || item.type === config.types.tree || item.type === config.types.tombstone || item.type === config.types.well;
      const small = item.type === config.types.lantern || item.type === config.types.candle;
      if (!earthy && !small) continue;
      const size = item.type.size;
      const graphics = new Phaser.GameObjects.Graphics(scene);
      const x = 0;
      const baseY = item.y + size * (scarecrow ? 0.44 : settings.baseOffsetY);
      const y = 0;
      if (earthy) {
        const width = size * settings.widthScale * (scarecrow ? 0.45 : 1);
        const height = size * settings.heightScale * (scarecrow ? 0.55 : 1);
        const outline = Array.from({ length: 16 }, (_, index) => {
          const angle = index * Math.PI / 8;
          const irregularity = random.realInRange(0.86, 1.06);
          return new Phaser.Math.Vector2(Math.cos(angle) * width / 2 * irregularity,
            Math.sin(angle) * height / 2 * irregularity);
        });
        // Broad translucent edges blend into the painted mist instead of a hard platform rim.
        for (let ring = 4; ring >= 1; ring--) {
          const expansion = 1 + ring * 0.12;
          graphics.fillStyle(color(settings.edge), 0.10);
          graphics.fillPoints(outline.map(p => new Phaser.Math.Vector2(x + p.x * expansion, y + p.y * expansion)), true);
        }
        graphics.fillStyle(color(settings.soil), 0.92);
        graphics.fillPoints(outline.map(p => new Phaser.Math.Vector2(x + p.x, y + p.y)), true);
        for (let stone = 0; stone < 7; stone++) {
          const angle = random.realInRange(0, Math.PI * 2);
          const px = x + Math.cos(angle) * width * random.realInRange(0.3, 0.43);
          const py = y + Math.sin(angle) * height * random.realInRange(0.25, 0.42);
          const radius = random.realInRange(2, 4);
          graphics.fillStyle(color(settings.edge), 0.8).fillEllipse(px, py + 2, radius * 2.7, radius * 1.4);
          graphics.fillStyle(color(settings.stone), 0.7).fillPoints([
            new Phaser.Math.Vector2(px - radius, py + 1),
            new Phaser.Math.Vector2(px - radius * 0.5, py - radius * 0.6),
            new Phaser.Math.Vector2(px + radius * 0.6, py - radius * 0.4),
            new Phaser.Math.Vector2(px + radius, py + 1),
          ], true);
          if (stone % 2 === 0) {
            graphics.lineStyle(1.5, color(settings.moss), 0.65);
            graphics.lineBetween(px + 5, py, px + 3, py - 5);
            graphics.lineBetween(px + 5, py, px + 7, py - 4);
          }
        }
      }
      // Flattened shadows sit directly beneath roots and prop bases.
      for (let ring = 3; ring >= 1; ring--) {
        graphics.fillStyle(color(settings.shadow), 0.18);
        graphics.fillEllipse(x, y, size * (0.5 + ring * 0.1), size * (0.08 + ring * 0.035));
      }
      const bounds = { x: -size, y: -size * .32, width: size * 2, height: size * .64 };
      const key = `decoration-ground-${item.type.textureKey}-${index++}`;
      bakeGraphics(scene, graphics, key, bounds, 2);
      graphics.destroy();
      this.add(scene.add.image(item.x + bounds.x, baseY + bounds.y, key)
        .setOrigin(0).setDisplaySize(bounds.width, bounds.height));
    }
  }
}


