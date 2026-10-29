import { cameraFit, constrainToBackground } from './camera-fit';
import Phaser from 'phaser';
import { cameraConfig } from '../config/camera';
import { renderConfig } from '../config/render';

/** Camera navigation in logical game units, independent of render resolution. */
export class CameraController {
  private readonly camera: Phaser.Cameras.Scene2D.Camera;
  private backgroundBounds: Phaser.Geom.Rectangle | null = null;
  private maximumZoom: number = cameraConfig.maxZoom * renderConfig.resolutionScale;
  private movementBounds: Phaser.Geom.Rectangle | null = null;
  private minimumZoom: number = cameraConfig.minZoom * renderConfig.resolutionScale;
  private dragPointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.camera = scene.cameras.main;
    this.camera.setZoom(cameraConfig.initialZoom * renderConfig.resolutionScale);
    this.camera.centerOn(renderConfig.width / 2, renderConfig.height / 2);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    scene.input.on('wheel', this.onWheel);
    scene.input.on('pointerdown', this.onPointerDown);
    scene.input.on('pointermove', this.onPointerMove);
    scene.input.on('pointerup', this.onPointerUp);
    scene.input.on('pointerupoutside', this.onPointerUp);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.stopDragging);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    scene.events.once(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }

  private readonly onResize = (): void => {
    const bounds = this.backgroundBounds;
    if (!bounds) return;
    const relativeZoom = this.camera.zoom / this.minimumZoom;
    const fit = cameraFit(this.camera.width, this.camera.height, bounds.width, bounds.height,
      cameraConfig.maxZoom * renderConfig.resolutionScale);
    this.minimumZoom = fit.minimum; this.maximumZoom = fit.maximum;
    this.camera.setZoom(Phaser.Math.Clamp(fit.zoom * relativeZoom, this.minimumZoom, this.maximumZoom));
    this.constrainPosition();
  };

  setMovementBounds(bounds: Phaser.Geom.Rectangle): void {
    this.movementBounds = Phaser.Geom.Rectangle.Clone(bounds);
    Phaser.Geom.Rectangle.Inflate(this.movementBounds, cameraConfig.boundsPadding, cameraConfig.boundsPadding);
    this.constrainPosition();
  }

  private constrainPosition(): void {
    const bounds = this.movementBounds;
    if (!bounds) return;
    const halfWidth = this.camera.width / (2 * this.camera.zoom);
    const halfHeight = this.camera.height / (2 * this.camera.zoom);
    const centerX = this.camera.scrollX + this.camera.width / 2;
    const centerY = this.camera.scrollY + this.camera.height / 2;
    // Center small maps; for large maps, prevent scrolling beyond their padded edges.
    const x = bounds.width <= halfWidth * 2 ? bounds.centerX
      : Phaser.Math.Clamp(centerX, bounds.left + halfWidth, bounds.right - halfWidth);
    const y = bounds.height <= halfHeight * 2 ? bounds.centerY
      : Phaser.Math.Clamp(centerY, bounds.top + halfHeight, bounds.bottom - halfHeight);
    const safe = this.backgroundBounds
      ? constrainToBackground(x, y, this.camera.width, this.camera.height, this.camera.zoom, this.backgroundBounds)
      : { x, y };
    this.camera.centerOn(safe.x, safe.y);
  }
  fitBounds(bounds: Phaser.Geom.Rectangle): void {
    const fit = cameraFit(this.camera.width, this.camera.height, bounds.width, bounds.height,
      cameraConfig.maxZoom * renderConfig.resolutionScale);
    this.backgroundBounds = Phaser.Geom.Rectangle.Clone(bounds);
    this.minimumZoom = fit.minimum; this.maximumZoom = fit.maximum;
    this.camera.setZoom(fit.zoom);
    this.camera.centerOn(bounds.centerX, bounds.centerY);
    this.constrainPosition();
  }

  centerOn(x: number, y: number): void {
    const safe = this.backgroundBounds
      ? constrainToBackground(x, y, this.camera.width, this.camera.height, this.camera.zoom, this.backgroundBounds)
      : { x, y };
    this.camera.centerOn(safe.x, safe.y);
  }

  private readonly onWheel = (
    pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
  ): void => {
    const oldZoom = this.camera.zoom;
    const newZoom = Phaser.Math.Clamp(
      oldZoom * Math.exp(-deltaY * cameraConfig.zoomSensitivity),
      this.minimumZoom,
      this.maximumZoom,
    );
    // Keep the world point under the cursor fixed without using a stale camera matrix.
    const offsetX = pointer.x - this.camera.x - this.camera.width * this.camera.originX;
    const offsetY = pointer.y - this.camera.y - this.camera.height * this.camera.originY;
    this.camera.scrollX += offsetX * (1 / oldZoom - 1 / newZoom);
    this.camera.scrollY += offsetY * (1 / oldZoom - 1 / newZoom);
    this.camera.setZoom(newZoom);
    this.constrainPosition();
  };

  private readonly onPointerDown = (pointer: Phaser.Input.Pointer): void => {
    if (!pointer.leftButtonDown() || this.dragPointerId !== null) return;
    this.dragPointerId = pointer.id;
    this.lastX = pointer.x;
    this.lastY = pointer.y;
    this.scene.input.setDefaultCursor('grabbing');
  };

  private readonly onPointerMove = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id !== this.dragPointerId) return;
    if (!pointer.isDown) {
      this.stopDragging();
      return;
    }
    this.camera.scrollX -= (pointer.x - this.lastX) / this.camera.zoom;
    this.camera.scrollY -= (pointer.y - this.lastY) / this.camera.zoom;
    this.constrainPosition();
    this.lastX = pointer.x;
    this.lastY = pointer.y;
  };

  private readonly onPointerUp = (pointer: Phaser.Input.Pointer): void => {
    if (pointer.id === this.dragPointerId) this.stopDragging();
  };

  private readonly stopDragging = (): void => {
    this.dragPointerId = null;
    this.scene.input.setDefaultCursor('default');
  };

  destroy(): void {
    this.stopDragging();
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    this.scene.input.off('wheel', this.onWheel);
    this.scene.input.off('pointerdown', this.onPointerDown);
    this.scene.input.off('pointermove', this.onPointerMove);
    this.scene.input.off('pointerup', this.onPointerUp);
    this.scene.input.off('pointerupoutside', this.onPointerUp);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.stopDragging);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.events.off(Phaser.Scenes.Events.DESTROY, this.destroy, this);
  }
}



