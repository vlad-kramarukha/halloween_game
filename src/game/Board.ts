import { createBoardPortalLayout } from '../../shared/board-portals';
import type { EventPickupId } from '../../shared/events';
import { createBoardPickupLayout, type PickupId } from '../../shared/board-pickups';
import { gameTextFont } from '../ui/game-fonts';
import { bakeGraphics } from './rendering/bake-graphics';
import Phaser from 'phaser';
import { boardConfig as config } from '../config/board';
import { eventsConfig } from '../config/events';
import { pickupsConfig } from '../config/pickups';
import { candiesConfig } from '../config/candies';
import { decorationsConfig } from '../config/decorations';

import { createEventLayout } from './generators/event-layout';
import { backgroundConfig } from '../config/background';
import { SpaceBackground } from './SpaceBackground';
import { BoardDecorations } from './BoardDecorations';
import { FloatingPickups } from './FloatingPickups';
import { createBoardPath } from './generators/board-path';

// Phaser Graphics expects numeric colors; keep the editable palette in RGB.
const colors = Object.fromEntries(
  Object.entries(config.colors).map(([name, rgb]) => [name, Phaser.Display.Color.RGBStringToColor(rgb).color]),
) as Record<keyof typeof config.colors, number>;

interface PickupSprite {
  sprite: Phaser.GameObjects.Image;
  x: number; y: number; scaleX: number; scaleY: number; angle: number; floating: boolean;
  effect?: Phaser.GameObjects.Graphics;
}

export class Board extends Phaser.GameObjects.Container {
  readonly eventCells = createEventLayout(config.cellCount, eventsConfig);
  readonly pickupCells = new Map<number, (typeof pickupsConfig.types)[number] | (typeof candiesConfig.types)[number]>();
  readonly portalCellIndices: ReadonlySet<number>;
  private readonly floatingPickups: FloatingPickups;
  private readonly pickupSprites = new Map<number, PickupSprite>();
  private collectedPickups = new Set<number>();
  private readonly pickupImages = new Map<EventPickupId, string>();
  private cellPositions: { x: number; y: number }[] = [];
  private readonly navigationBounds = new Phaser.Geom.Rectangle();
  private readonly environmentBounds = new Phaser.Geom.Rectangle();
  constructor(scene: Phaser.Scene) {
    super(scene);
    this.floatingPickups = new FloatingPickups(scene);
    this.once(Phaser.GameObjects.Events.DESTROY, () => this.floatingPickups.destroy());
    const visuals = new Map<PickupId, (typeof pickupsConfig.types)[number] | (typeof candiesConfig.types)[number]>(
      [...pickupsConfig.types, ...candiesConfig.types].map(type => [type.id, type]));
    for (const [cell, id] of createBoardPickupLayout(config.cellCount, new Set(this.eventCells.keys()))) {
      this.pickupCells.set(cell, visuals.get(id)!);
    }
    this.portalCellIndices = createBoardPortalLayout(config.cellCount, new Set(this.eventCells.keys()), this.pickupCells);
    this.drawBoard();
    scene.add.existing(this);
  }

  /** Reuse the loaded board frame, including the cropped pumpkin sprite-sheet frame. */
  getPickupImage(id: EventPickupId): string | undefined {
    const cached = this.pickupImages.get(id);
    if (cached) return cached;
    const visual = id === 'portal' ? decorationsConfig.types.portal : [...pickupsConfig.types, ...candiesConfig.types].find(type => type.id === id);
    if (!visual) return undefined;
    const image = this.scene.textures.getBase64(visual.textureKey, 'frame' in visual ? visual.frame : undefined);
    if (!image) return undefined;
    this.pickupImages.set(id, image);
    return image;
  }

  setCollectedPickups(cells: readonly number[], animate = true): void {
    const next = new Set(cells);
    for (const [cell, item] of this.pickupSprites) {
      if (next.has(cell)) {
        if (!animate) this.hidePickup(item);
        else if (!this.collectedPickups.has(cell)) this.animatePickup(cell, item);
      } else if (this.collectedPickups.has(cell)) this.restorePickup(item, cell);
    }
    this.collectedPickups = next;
  }
  private clearPickupEffect(item: PickupSprite): void {
    if (item.effect) { this.scene.tweens.killTweensOf(item.effect); item.effect.destroy(); item.effect = undefined; }
  }
  private hidePickup(item: PickupSprite): void {
    this.floatingPickups.remove(item.sprite); this.scene.tweens.killTweensOf(item.sprite); this.clearPickupEffect(item);
    item.sprite.setAlpha(0).setVisible(false).setData('pickupCollected', true).setData('pickupCollecting', false);
  }
  private restorePickup(item: PickupSprite, cell: number): void {
    this.scene.tweens.killTweensOf(item.sprite); this.clearPickupEffect(item); this.floatingPickups.remove(item.sprite);
    item.sprite.setPosition(item.x, item.y).setScale(item.scaleX, item.scaleY).setAngle(item.angle).setAlpha(1)
      .setData('pickupCollected', false).setData('pickupCollecting', false).setVisible(!item.sprite.getData('boardCulled'));
    if (item.floating) this.floatingPickups.add(item.sprite, cell);
  }
  private animatePickup(cell: number, item: PickupSprite): void {
    this.floatingPickups.remove(item.sprite);
    item.sprite.setData('pickupCollecting', true).setAlpha(1);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const config = pickupsConfig.collection;
    if (reduced) {
      this.scene.tweens.add({ targets: item.sprite, alpha: 0, duration: 160, onComplete: () => this.hidePickup(item) });
      return;
    }
    const color = Phaser.Display.Color.RGBStringToColor(config.color).color;
    const highlight = Phaser.Display.Color.RGBStringToColor(config.highlight).color;
    const ring = this.scene.add.graphics().setPosition(item.x, item.y + 16)
      .fillStyle(color, .2).fillEllipse(0, 0, 54, 22).lineStyle(2, highlight, .9).strokeEllipse(0, 0, 54, 22);
    item.effect = ring; this.add(ring);
    this.scene.tweens.add({ targets: ring, scaleX: 1.7, scaleY: 1.7, alpha: 0, duration: config.popDuration + config.fadeDuration,
      onComplete: () => { if (item.effect === ring) { ring.destroy(); item.effect = undefined; } } });
    this.scene.tweens.add({ targets: item.sprite, scaleX: item.scaleX * config.popScale, scaleY: item.scaleY * config.popScale,
      duration: config.popDuration, ease: 'Sine.Out', onComplete: () => {
        if (!this.collectedPickups.has(cell)) return;
        this.scene.tweens.add({ targets: item.sprite, y: item.sprite.y - config.lift,
          scaleX: item.scaleX * config.endScale, scaleY: item.scaleY * config.endScale,
          angle: item.sprite.angle + config.turn, alpha: 0, duration: config.fadeDuration, ease: 'Cubic.In',
          onComplete: () => this.hidePickup(item) });
      } });
  }

  getCellPosition(index: number): { x: number; y: number } {
    return this.cellPositions[Math.max(0, Math.min(this.cellPositions.length - 1, index))];
  }

  getNavigationBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.navigationBounds);
  }

  getEnvironmentBounds(): Phaser.Geom.Rectangle {
    return Phaser.Geom.Rectangle.Clone(this.environmentBounds);
  }

  private drawBoard(): void {
    const { tile, shadow, glow, viewport } = config;
    const projected = createBoardPath(config.cellCount, config.path).map(cell => ({
      ...cell,
      x: (cell.column - cell.row) * (tile.width + tile.gap) / 2,
      y: (cell.column + cell.row) * (tile.height + tile.gap / 2) / 2,
    }));
    const raised = projected.map(cell => ({ ...cell, y: cell.y - tile.elevation }));
    const sideDepth = tile.depth + tile.elevation;
    this.cellPositions = raised;
    const occupied = new Set(projected.map(cell => cell.column + ',' + cell.row));
    const halfW = tile.width / 2;
    const halfH = tile.height / 2;
    const minX = Math.min(...projected.map(cell => cell.x)) - halfW;
    const maxX = Math.max(...projected.map(cell => cell.x)) + halfW;
    const minY = Math.min(...projected.map(cell => cell.y)) - halfH - tile.elevation;
    const maxY = Math.max(...projected.map(cell => cell.y)) + halfH + tile.depth + 20;
    const scale = Math.min(viewport.width / (maxX - minX), viewport.height / (maxY - minY), viewport.maxScale) * tile.scale;
    this.setPosition(
      viewport.x + viewport.width / 2 - (minX + maxX) / 2 * scale,
      viewport.y + viewport.height / 2 - (minY + maxY) / 2 * scale,
    ).setScale(scale);

    this.navigationBounds.setTo(
      this.x + minX * scale, this.y + minY * scale,
      (maxX - minX) * scale, (maxY - minY) * scale,
    );


    const decorations = new BoardDecorations(this.scene, projected, tile);
    this.add(decorations);
    if (decorations.length > 0) {
      Phaser.Geom.Rectangle.Union(this.navigationBounds, decorations.getBounds(), this.navigationBounds);
    }

    // Cover the complete route and decorations while keeping the original image ratio.
    const aspect = backgroundConfig.width / backgroundConfig.height;
    const requiredWidth = this.navigationBounds.width / scale + backgroundConfig.padding * 2;
    const requiredHeight = this.navigationBounds.height / scale + backgroundConfig.padding * 2;
    const backgroundWidth = Math.max(backgroundConfig.width, requiredWidth, requiredHeight * aspect);
    const backgroundHeight = backgroundWidth / aspect;
    const backgroundBounds = new Phaser.Geom.Rectangle(
      (this.navigationBounds.centerX - this.x) / scale - backgroundWidth / 2,
      (this.navigationBounds.centerY - this.y) / scale - backgroundHeight / 2,
      backgroundWidth, backgroundHeight,
    );
    this.addAt(new SpaceBackground(this.scene, backgroundBounds), 0);
    this.environmentBounds.setTo(
      this.x + backgroundBounds.x * scale, this.y + backgroundBounds.y * scale,
      backgroundWidth * scale, backgroundHeight * scale,
    );

    const shadowKey = 'board-shadow';
    const shadowBounds = { x: -halfW - 2, y: -halfH - 2, width: tile.width + 4, height: tile.height + 4 };
    if (!this.scene.textures.exists(shadowKey)) {
      const shape = new Phaser.GameObjects.Graphics(this.scene);
      shape.fillStyle(colors.shadow, shadow.opacity);
      shape.fillPoints(new Phaser.Geom.Polygon([0, -halfH, halfW, 0, 0, halfH, -halfW, 0]).points, true);
      bakeGraphics(this.scene, shape, shadowKey, shadowBounds);
      shape.destroy();
    }
    for (const cell of projected) {
      this.add(this.scene.add.image(cell.x + shadow.offsetX + shadowBounds.x,
        cell.y + tile.depth + shadow.offsetY + shadowBounds.y, shadowKey)
        .setOrigin(0).setDisplaySize(shadowBounds.width, shadowBounds.height));
    }
    if (glow.enabled) {
      const glowKey = 'board-tile-glow';
      const glowW = halfW + glow.spread + 2;
      const glowH = halfH + glow.spread * tile.height / tile.width + 2;
      const bounds = { x: -glowW, y: -glowH, width: glowW * 2, height: glowH * 2 };
      if (!this.scene.textures.exists(glowKey)) {
        const light = new Phaser.GameObjects.Graphics(this.scene);
        for (let layer = glow.layers; layer >= 1; layer--) {
          const fraction = layer / glow.layers;
          const width = halfW + glow.spread * fraction;
          const height = halfH + glow.spread * fraction * tile.height / tile.width;
          light.fillStyle(colors.glow, glow.opacity * (1 - fraction * .85));
          light.fillPoints(new Phaser.Geom.Polygon([0, -height, width, 0, 0, height, -width, 0]).points, true);
        }
        bakeGraphics(this.scene, light, glowKey, bounds);
        light.destroy();
      }
      for (const cell of projected) {
        this.add(this.scene.add.image(cell.x + bounds.x, cell.y + tile.depth + glow.offsetY + bounds.y, glowKey)
          .setOrigin(0).setDisplaySize(bounds.width, bounds.height));
      }
    }
    for (const cell of [...raised].sort((a, b) => a.y - b.y || a.x - b.x)) {
      const start = cell.index === 0;
      const finish = cell.index === projected.length - 1;
      const event = this.eventCells.get(cell.index);
      const eventColor = event ? Phaser.Display.Color.RGBStringToColor(eventsConfig.hiddenColor) : null;
      const shade = (factor: number) => eventColor ? Phaser.Display.Color.GetColor(
        Math.round(eventColor.red * factor), Math.round(eventColor.green * factor), Math.round(eventColor.blue * factor),
      ) : 0;
      const top = start ? colors.start : finish ? colors.finish : eventColor ? eventColor.color : cell.index % 2 ? colors.topAlternate : colors.top;
      const left = start ? colors.startLeft : finish ? colors.finishLeft : eventColor ? shade(0.5) : colors.left;
      const right = start ? colors.startRight : finish ? colors.finishRight : eventColor ? shade(0.65) : colors.right;
      const textureKey = `board-tile-${top}-${left}-${right}`;
      const bounds = { x: -halfW - 3, y: -halfH - 3, width: tile.width + 6, height: tile.height + sideDepth + 6 };
      if (!this.scene.textures.exists(textureKey)) {
        const shape = new Phaser.GameObjects.Graphics(this.scene);
        shape.fillStyle(left);
        shape.fillPoints(new Phaser.Geom.Polygon([
          -halfW, 0, 0, halfH, 0, halfH + sideDepth, -halfW, sideDepth,
        ]).points, true);
        shape.fillStyle(right);
        shape.fillPoints(new Phaser.Geom.Polygon([
          0, halfH, halfW, 0, halfW, sideDepth, 0, halfH + sideDepth,
        ]).points, true);
        const polygon = new Phaser.Geom.Polygon([0, -halfH, halfW, 0, 0, halfH, -halfW, 0]);
        shape.fillStyle(top);
        shape.fillPoints(polygon.points, true);
        shape.lineStyle(tile.edgeWidth, start || finish || event ? colors.endpointEdge : colors.edge, tile.edgeOpacity);
        shape.strokePoints(polygon.points, true);
        // Light on the upper bevel and warm reflected light along the lower faces.
        shape.lineStyle(tile.highlightWidth, colors.highlight, tile.highlightOpacity);
        shape.beginPath();
        shape.moveTo(-halfW, 0);
        shape.lineTo(0, -halfH);
        shape.lineTo(halfW, 0);
        shape.strokePath();
        if (glow.enabled) {
          shape.lineStyle(1.5, colors.glow, tile.baseLightOpacity);
          shape.beginPath();
          shape.moveTo(-halfW, sideDepth);
          shape.lineTo(0, halfH + sideDepth);
          shape.lineTo(halfW, sideDepth);
          shape.strokePath();
        }
        bakeGraphics(this.scene, shape, textureKey, bounds);
        shape.destroy();
      }
      this.add(this.scene.add.image(cell.x + bounds.x, cell.y + bounds.y, textureKey)
        .setOrigin(0).setDisplaySize(bounds.width, bounds.height));
      const pickup = this.pickupCells.get(cell.index);
      if (config.numbering.enabled) {
        // Prefer the side that is not covered by the next tile on the grid.
        const side = occupied.has(cell.column + ',' + (cell.row + 1)) ? 1 : -1;
        const label = this.scene.add.text(
          cell.x + side * halfW / 2,
          cell.y + halfH / 2 + sideDepth / 2,
          String(cell.index + 1),
          {
            fontFamily: gameTextFont,
            fontSize: config.numbering.fontSize,
            fontStyle: 'bold',
            color: config.numbering.color,
          },
        ).setOrigin(0.5).setResolution(2)
          .setRotation(-side * Math.atan2(halfH, halfW)).setScale(1, 0.85);
        this.add(label);
      }
      if (this.portalCellIndices.has(cell.index)) {
        const portal = decorationsConfig.types.portal;
        this.add(this.scene.add.image(cell.x, cell.y + decorationsConfig.portal.offsetY, portal.textureKey)
          .setOrigin(0.5, 0.87)
          .setDisplaySize(portal.size, portal.size)
          .setData({ cellIndex: cell.index, decorationType: 'portal' }));
      }
      if (pickup) {
        const sprite = this.scene.add.image(cell.x, cell.y + pickupsConfig.offsetY, pickup.textureKey, 'frame' in pickup ? pickup.frame : undefined)
          .setOrigin(0.5, 0.75)
          .setDisplaySize(pickup.size, pickup.size)
          .setData({ cellIndex: cell.index, pickupType: pickup.id });
        this.add(sprite);
        const floating = pickup.id === 'coin' || pickup.id === 'ghost' || pickup.id === 'broom' || pickup.id === 'potion' || pickup.id.startsWith('candy-');
        this.pickupSprites.set(cell.index, { sprite, x: sprite.x, y: sprite.y, scaleX: sprite.scaleX, scaleY: sprite.scaleY, angle: sprite.angle, floating });
        if (floating) {
          this.floatingPickups.add(sprite, cell.index);
        }
      }
    }
  }
}

















