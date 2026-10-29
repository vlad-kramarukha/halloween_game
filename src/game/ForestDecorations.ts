import { GroundLayer } from './rendering/GroundLayer';
import { addAssetFrame } from './rendering/asset-frame';
import type { SceneryBounds } from './generators/scenery-layout';
import Phaser from 'phaser';
import { forestConfig as config } from '../config/forest';
import type { DecorationPlacement } from './generators/decoration-layout';
import { createForestLayout } from './generators/forest-layout';

export class ForestDecorations extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, cells: readonly {x: number; y: number}[], tile: {width: number; height: number; depth: number}, decorations: readonly DecorationPlacement[], extraOccupied: readonly SceneryBounds[] = []) {
    super(scene);
    if (!config.enabled) return;
    const occupied = decorations.map(p => ({x: p.x - p.type.size / 2, y: p.y - p.type.size / 2, width: p.type.size, height: p.type.size * 1.05}));
    occupied.push(...extraOccupied);
    const groups = createForestLayout<(typeof config.types)[keyof typeof config.types]>(cells, tile, occupied, config);
    const color = (value: string) => Phaser.Display.Color.RGBStringToColor(value).color;
    const ground = new GroundLayer(scene);
    this.add(ground);
    for (const group of groups) {
      // One shared patch ties each log, mushroom and plant cluster to the ground.
      for (let ring = 4; ring >= 0; ring--) {
        ground.fillStyle(color(config.soil), ring === 0 ? 0.65 : 0.08);
        ground.fillEllipse(group.x, group.y + 9, (group.groundWidth ?? 155) + ring * (group.groundWidth ? 2 : 8), (group.groundHeight ?? 38) + ring * (group.groundHeight ? 1 : 5));
      }
      for (const item of group.items) {
        ground.fillStyle(color(config.shadow), 0.35);
        ground.fillEllipse(item.x, item.y - 2, item.type.width * 0.85, item.type.height * 0.2);
      }
    }
    for (const item of groups.flatMap(group => group.items).sort((a, b) => a.y - b.y)) {
      const frame = item.type.frame;
      addAssetFrame(scene, item.type.textureKey, 'prop', frame, item.type.url);
      this.add(scene.add.image(item.x, item.y, item.type.textureKey, 'prop')
        .setOrigin(0.5, 1).setDisplaySize(item.type.width, item.type.height)
        .setFlipX(item.flip).setTint(color(config.tint)));
    }
  }
}


