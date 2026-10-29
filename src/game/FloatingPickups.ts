import Phaser from 'phaser';
import { pickupsConfig } from '../config/pickups';

interface FloatingItem {
  sprite: Phaser.GameObjects.Image;
  baseX: number; baseY: number; baseAngle: number;
  phase: number; speed: number; amplitude: number; sway: number; tilt: number; shimmer: number;
}

/** One shared update loop for every hovering object; no per-object timers or tweens. */
export class FloatingPickups {
  private readonly items: FloatingItem[] = [];
  private elapsed = 0;
  constructor(private readonly scene: Phaser.Scene) {
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  add(sprite: Phaser.GameObjects.Image, index: number): void {
    this.remove(sprite);
    const config = pickupsConfig.floating;
    if (!config.enabled) return;
    const type = sprite.getData('pickupType') as string;
    const magic = type === 'broom' ? config.magic.broom : type === 'potion' ? config.magic.potion : null;
    const period = config.minPeriod + (config.maxPeriod - config.minPeriod) * ((index * .618034) % 1);
    const item: FloatingItem = {
      sprite, baseX: sprite.x, baseY: sprite.y - (magic?.lift ?? config.lift), baseAngle: sprite.angle,
      phase: index * 2.39996, speed: Math.PI * 2 / period,
      amplitude: magic?.amplitude ?? config.amplitude, sway: magic?.sway ?? 0, tilt: magic?.tilt ?? 0, shimmer: magic?.shimmer ?? 0,
    };
    this.items.push(item); this.position(item);
  }
  remove(sprite: Phaser.GameObjects.Image): void {
    const index = this.items.findIndex(item => item.sprite === sprite);
    if (index >= 0) this.items.splice(index, 1);
  }
  private position(item: FloatingItem): void {
    const phase = this.elapsed * item.speed + item.phase;
    item.sprite.y = item.baseY + Math.sin(phase) * item.amplitude;
    if (item.sway) item.sprite.x = item.baseX + Math.cos(phase * .7) * item.sway;
    if (item.tilt) item.sprite.angle = item.baseAngle + Math.sin(phase * .65) * item.tilt;
    if (item.shimmer) item.sprite.alpha = 1 - item.shimmer * (.5 + Math.sin(phase * 1.2) * .5);
  }
  private update(_time: number, delta: number): void {
    this.elapsed += delta;
    for (const item of this.items) if (item.sprite.active && item.sprite.visible) this.position(item);
  }
  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.items.length = 0;
  }
}
