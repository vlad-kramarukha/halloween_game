import { GroundLayer } from './rendering/GroundLayer';
import { addAssetFrame } from './rendering/asset-frame';
import Phaser from 'phaser';
import { sceneryConfig as config } from '../config/scenery';
import { createSceneryLayout, type SceneryBounds, type SceneryProp } from './generators/scenery-layout';
import type { DecorationPlacement } from './generators/decoration-layout';

export class SceneryDecorations extends Phaser.GameObjects.Container {
  readonly occupied: SceneryBounds[] = [];

  constructor(scene: Phaser.Scene, cells: readonly { x: number; y: number }[], tile: { width: number; height: number; depth: number }, decorations: readonly DecorationPlacement[]) {
    super(scene);
    if (!config.enabled) return;
    const occupied = decorations.map(item => ({
      x: item.x - item.type.size * .65, y: item.y - item.type.size / 2,
      width: item.type.size * 1.3, height: item.type.size * 1.12,
    }));
    const { groups, bounds } = createSceneryLayout<SceneryProp>(cells, tile, occupied, config);
    this.occupied.push(...bounds);
    const color = (rgb: string) => Phaser.Display.Color.RGBStringToColor(rgb).color;
    const ground = new GroundLayer(scene);
    this.add(ground);
    for (const group of groups) {
      const patch = group.ground;
      for (let ring = 4; ring >= 0; ring--) {
        ground.fillStyle(color(ring ? config.edge : config.soil), ring ? .1 : .8);
        ground.fillEllipse(patch.x + patch.width / 2, patch.y + patch.height / 2,
          patch.width - 8 + ring * 3, patch.height - 6 + ring * 2);
      }
      // Small pebbles tie the compositions to the same ground as the existing props.
      for (let pebble = 0; pebble < 9; pebble++) {
        const angle = pebble * 2.39996;
        const px = patch.x + patch.width / 2 + Math.cos(angle) * patch.width * .41;
        const py = patch.y + patch.height / 2 + Math.sin(angle) * patch.height * .37;
        ground.fillStyle(0x62516d, .35).fillEllipse(px, py, 4 + pebble % 3, 2 + pebble % 2);
      }
      for (const item of group.items) {
        ground.fillStyle(color(config.shadow), .5);
        ground.fillEllipse(item.x, item.y - 2, item.type.width * .83, Math.max(8, item.type.width * .18));
        if (item.type.glow) {
          for (let ring = 4; ring >= 1; ring--) {
            ground.fillStyle(color(item.type.glow), .035);
            ground.fillEllipse(item.x, item.y - 2, item.type.width + ring * 10, 15 + ring * 6);
          }
        }
      }
    }
    for (const item of groups.flatMap(group => group.items).sort((a, b) => a.y - b.y)) {
      const frame = item.type.frame;
      const frameName = `scenery-${frame.x}-${frame.y}-${frame.width}-${frame.height}`;
      addAssetFrame(scene, item.type.textureKey, frameName, frame, item.type.url);
      const image = scene.add.image(item.x, item.y, item.type.textureKey, frameName)
        .setOrigin(.5, 1).setDisplaySize(item.type.width, item.type.height).setFlipX(item.flip);
      if (!item.type.glow) image.setTint(color(config.tint));
      this.add(image);
    }
  }
}
