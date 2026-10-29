import Phaser from 'phaser';
import { Board } from './Board';
import { boardConfig } from '../config/board';
import { eventPresentation as config } from '../config/event-presentation';
import { gameTextFont } from '../ui/game-fonts';

/** A short-lived landing cue: a tile flash, two diamond waves and a few sparks. */
export class OrangeCellEffect {
  private readonly layer: Phaser.GameObjects.Container;
  private cleanup: Phaser.Time.TimerEvent | null = null;
  constructor(private readonly scene: Phaser.Scene, private readonly board: Board) {
    this.layer = scene.add.container(); board.add(this.layer);
  }
  play(index: number): void {
    this.clear();
    const { x, y } = this.board.getCellPosition(index);
    this.layer.setPosition(x, y);
    const color = Phaser.Display.Color.RGBStringToColor(config.color).color;
    const highlight = Phaser.Display.Color.RGBStringToColor(config.highlight).color;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const halfW = boardConfig.tile.width / 2, halfH = boardConfig.tile.height / 2;
    const diamond = [{ x: 0, y: -halfH }, { x: halfW, y: 0 }, { x: 0, y: halfH }, { x: -halfW, y: 0 }].map(point => new Phaser.Math.Vector2(point.x, point.y));
    const flash = this.scene.add.graphics().fillStyle(highlight, .45).fillPoints(diamond, true);
    this.layer.add(flash);
    this.scene.tweens.add({ targets: flash, alpha: 0, duration: reduced ? 200 : 500 });
    if (!reduced) {
      for (let wave = 0; wave < 2; wave++) {
        const ring = this.scene.add.graphics().lineStyle(3 - wave, wave ? color : highlight, .9).strokePoints(diamond, true);
        this.layer.add(ring);
        this.scene.tweens.add({ targets: ring, scaleX: 1.8 + wave * .2, scaleY: 1.8 + wave * .2, alpha: 0,
          delay: wave * 130, duration: 600, ease: 'Sine.Out' });
      }
      for (let i = 0; i < config.sparks; i++) {
        const angle = i * Math.PI * 2 / config.sparks;
        const spark = this.scene.add.graphics().fillStyle(i % 2 ? color : highlight, 1)
          .fillPoints([{ x: 0, y: -4 }, { x: 3, y: 0 }, { x: 0, y: 4 }, { x: -3, y: 0 }].map(point => new Phaser.Math.Vector2(point.x, point.y)), true)
          .setPosition(Math.cos(angle) * 18, Math.sin(angle) * 8);
        this.layer.add(spark);
        this.scene.tweens.add({ targets: spark, x: Math.cos(angle) * (65 + i % 3 * 9),
          y: Math.sin(angle) * 30 - 28 - i % 3 * 10, alpha: 0, scaleX: .3, scaleY: .3,
          duration: 500 + i % 4 * 60, ease: 'Cubic.Out' });
      }
      const label = this.scene.add.text(0, -48, 'Событие!', { fontFamily: gameTextFont, fontSize: '20px',
        color: config.highlight, stroke: 'rgb(74, 31, 33)', strokeThickness: 4 }).setOrigin(.5).setResolution(2);
      this.layer.add(label);
      this.scene.tweens.add({ targets: label, y: -80, alpha: 0, duration: config.burstDuration, ease: 'Sine.Out' });
    }
    this.cleanup = this.scene.time.delayedCall(config.burstDuration + 50, () => this.clear());
  }
  clear(): void {
    this.cleanup?.remove(false); this.cleanup = null;
    this.scene.tweens.killTweensOf([...this.layer.list]); this.layer.removeAll(true);
  }
  destroy(): void { this.clear(); this.layer.destroy(); }
}