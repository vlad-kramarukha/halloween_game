import Phaser from 'phaser';
import { Board } from '../Board';

/** Cache static world bounds; recheck visibility only when the camera moves. */
export class BoardVisibility {
  private readonly entries: { object: Phaser.GameObjects.Image | Phaser.GameObjects.Text; bounds: Phaser.Geom.Rectangle }[] = [];
  private lastView = '';
  private elapsed = 100;

  constructor(private readonly scene: Phaser.Scene, board: Board) {
    const visit = (container: Phaser.GameObjects.Container) => {
      for (const object of container.list) {
        if (object instanceof Phaser.GameObjects.Container) visit(object);
        else if (object instanceof Phaser.GameObjects.Image || object instanceof Phaser.GameObjects.Text) {
          const bounds = object.getBounds();
          Phaser.Geom.Rectangle.Inflate(bounds, 60, 60); // Floating objects and soft glows.
          this.entries.push({ object, bounds });
        }
      }
    };
    visit(board);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.update, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private update(_time: number, delta: number): void {
    this.elapsed += delta;
    if (this.elapsed < 80) return;
    this.elapsed = 0;
    const camera = this.scene.cameras.main;
    const key = `${camera.scrollX}:${camera.scrollY}:${camera.zoom}:${camera.width}:${camera.height}`;
    if (key === this.lastView) return;
    this.lastView = key;
    const halfWidth = camera.width / (2 * camera.zoom) + 100;
    const halfHeight = camera.height / (2 * camera.zoom) + 100;
    const cx = camera.scrollX + camera.width / 2;
    const cy = camera.scrollY + camera.height / 2;
    for (const { object, bounds } of this.entries) {
      const inside = bounds.right >= cx - halfWidth && bounds.left <= cx + halfWidth
        && bounds.bottom >= cy - halfHeight && bounds.top <= cy + halfHeight;
      const pickup = object.getData('pickupType');
      if (pickup) object.setData('boardCulled', !inside);
      object.setVisible(inside && !(pickup && object.getData('pickupCollected')));
    }
  }

  destroy(): void {
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.update, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
    this.entries.length = 0;
  }
}
