import Phaser from 'phaser';
import { backgroundConfig as config } from '../config/background';

/** Shared star texture and one low-frequency flicker timer for the entire background. */
export class SpaceBackground extends Phaser.GameObjects.Container {
  constructor(scene: Phaser.Scene, bounds: Phaser.Geom.Rectangle) {
    super(scene, bounds.x, bounds.y);
    this.add(scene.add.image(0, 0, config.image.textureKey)
      .setOrigin(0).setDisplaySize(bounds.width, bounds.height));
    const key = 'background-star';
    if (!scene.textures.exists(key)) {
      const texture = scene.textures.createCanvas(key, 96, 96)!;
      const context = texture.context;
      for (const [radius, opacity] of [[48, .025], [28.8, .08], [16, .25], [7.2, .9]]) {
        context.fillStyle = `rgba(255,255,255,${opacity})`;
        context.beginPath(); context.arc(48, 48, radius, 0, Math.PI * 2); context.fill();
      }
      texture.refresh();
    }
    const random = new Phaser.Math.RandomDataGenerator([config.stars.seed]);
    const color = Phaser.Display.Color.RGBStringToColor(config.stars.color).color;
    const stars: { image: Phaser.GameObjects.Image; phase: number; speed: number }[] = [];
    for (let i = 0; i < config.stars.count; i++) {
      const radius = random.realInRange(config.stars.minRadius, config.stars.maxRadius);
      const image = scene.add.image(random.realInRange(0, bounds.width), random.realInRange(0, bounds.height), key)
        .setDisplaySize(radius * 6, radius * 6).setTint(color);
      const phase = random.realInRange(0, Math.PI * 2);
      const speed = Math.PI / random.between(config.stars.minDuration, config.stars.maxDuration);
      image.setAlpha(config.stars.minOpacity + (Math.sin(phase) + 1) / 2 * (config.stars.maxOpacity - config.stars.minOpacity));
      this.add(image); stars.push({ image, phase, speed });
    }
    let elapsed = 0;
    const timer = scene.time.addEvent({
      delay: 50, loop: true,
      callback: () => {
        elapsed += 50;
        for (const star of stars) if (star.image.visible) {
          star.image.setAlpha(config.stars.minOpacity + (Math.sin(elapsed * star.speed + star.phase) + 1) / 2 * (config.stars.maxOpacity - config.stars.minOpacity));
        }
      },
    });
    this.once(Phaser.GameObjects.Events.DESTROY, () => timer.remove(false));
    scene.add.existing(this);
  }
}
