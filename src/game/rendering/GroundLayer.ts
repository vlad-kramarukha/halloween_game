import Phaser from 'phaser';

/** Reuses one small texture instead of tessellating every ellipse on every frame. */
export class GroundLayer extends Phaser.GameObjects.Container {
  private fillColor = 0xffffff;
  private fillAlpha = 1;

  constructor(scene: Phaser.Scene) {
    super(scene);
    const key = 'ground-unit-disc';
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.createCanvas(key, 96, 96)!;
      const context = texture.context;
      context.fillStyle = 'white';
      context.beginPath();
      context.arc(48, 48, 47, 0, Math.PI * 2);
      context.fill();
      texture.refresh();
    }
  }

  fillStyle(color: number, alpha = 1): this { this.fillColor = color; this.fillAlpha = alpha; return this; }
  fillEllipse(x: number, y: number, width: number, height: number): this {
    this.add(this.scene.add.image(x, y, 'ground-unit-disc').setDisplaySize(width * 96 / 94, height * 96 / 94)
      .setTint(this.fillColor).setAlpha(this.fillAlpha));
    return this;
  }
}
